import base64
import logging
import os
import secrets
import threading
import time
from collections import deque
from pathlib import Path
from urllib.parse import unquote

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .cad.executor import extract_code, run_build123d_code
from .cad.prompts import SYSTEM_PROMPT, build_repair_prompt
from .llm.router import LLMRouter, RouterExhaustedError
from .models import GenerateRequest, GenerateResponse, RunRequest

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("jokercad")

app = FastAPI(title="jokercad")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# The frontend files change with every deploy but are served without cache
# headers, so browsers may reuse stale copies (e.g. old app.js with new HTML).
# "no-cache" makes them revalidate each load; the ETag keeps that a cheap 304.
@app.middleware("http")
async def revalidate_frontend(request: Request, call_next):
    response = await call_next(request)
    if not request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


router = LLMRouter()

MAX_REPAIR_ATTEMPTS = int(os.getenv("MAX_REPAIR_ATTEMPTS", "3"))
# Bounds how much conversation history gets replayed to the LLM on each turn,
# so a long iterative session doesn't blow past free-tier context limits.
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "16"))
MAX_PROMPT_LENGTH = 2000
# base64 adds a third on top of this, and Vercel caps function responses at 4.5 MB.
MAX_GLB_BYTES = 3_000_000

# Only generation is gated: it's what runs model-written code and spends LLM
# quota. The page itself stays viewable without the password.
APP_PASSWORD = os.getenv("APP_PASSWORD", "")
GENERATIONS_PER_HOUR = int(os.getenv("GENERATIONS_PER_HOUR", "60"))
ON_VERCEL = bool(os.getenv("VERCEL"))

# Kept in memory, so on serverless hosts the cap applies per running instance.
_generation_times: deque[float] = deque()
_generation_lock = threading.Lock()


def _require_password(request: Request) -> None:
    if not APP_PASSWORD:
        if ON_VERCEL:
            # A public deployment without a password would let anyone run
            # model-written code on it and spend the LLM quota.
            raise HTTPException(
                status_code=503,
                detail="Generation is disabled: set APP_PASSWORD in the Vercel project's environment variables.",
            )
        return
    supplied = unquote(request.headers.get("x-app-password", ""))
    if not secrets.compare_digest(supplied.encode(), APP_PASSWORD.encode()):
        raise HTTPException(status_code=401, detail="Access password required.")


def _consume_generation_slot() -> None:
    if GENERATIONS_PER_HOUR <= 0:
        return
    now = time.monotonic()
    with _generation_lock:
        while _generation_times and now - _generation_times[0] > 3600:
            _generation_times.popleft()
        if len(_generation_times) >= GENERATIONS_PER_HOUR:
            raise HTTPException(
                status_code=429,
                detail=f"Generation limit reached ({GENERATIONS_PER_HOUR} per hour). Try again later.",
            )
        _generation_times.append(now)


def _model_response(glb_bytes: bytes, code: str, provider_used: str | None, attempts: int) -> GenerateResponse:
    if len(glb_bytes) > MAX_GLB_BYTES:
        return GenerateResponse(
            ok=False,
            provider_used=provider_used,
            code=code,
            error="The model is too detailed to send back (over 3 MB). Try a simpler part.",
            attempts=attempts,
        )
    return GenerateResponse(
        ok=True,
        provider_used=provider_used,
        code=code,
        glb_base64=base64.b64encode(glb_bytes).decode("ascii"),
        attempts=attempts,
    )


@app.post("/api/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest, request: Request) -> GenerateResponse:
    _require_password(request)

    prompt = req.prompt.strip()
    if not prompt:
        return GenerateResponse(ok=False, error="Prompt is empty.")
    if len(prompt) > MAX_PROMPT_LENGTH:
        return GenerateResponse(ok=False, error=f"Prompt is too long (max {MAX_PROMPT_LENGTH} characters).")

    _consume_generation_slot()

    history = [m.model_dump() for m in req.history][-MAX_HISTORY_MESSAGES:]
    messages = history + [{"role": "user", "content": prompt}]

    provider_used = None
    code = None
    last_error = None

    try:
        for attempt in range(1, MAX_REPAIR_ATTEMPTS + 1):
            try:
                text, provider_used = router.generate(SYSTEM_PROMPT, messages)
            except RouterExhaustedError as e:
                logger.warning("attempt=%d router exhausted: %s", attempt, e)
                return GenerateResponse(ok=False, error=str(e), attempts=attempt)

            code = extract_code(text)
            result = run_build123d_code(code)

            if result.ok:
                logger.info("provider=%s attempt=%d ok (%d bytes)", provider_used, attempt, len(result.glb_bytes))
                return _model_response(result.glb_bytes, code, provider_used, attempt)

            if not result.retryable:
                logger.error("CAD engine unavailable: %s", result.error)
                return GenerateResponse(
                    ok=False, provider_used=provider_used, code=code, error=result.error, attempts=attempt
                )

            last_error = result.error
            logger.info("provider=%s attempt=%d failed: %s", provider_used, attempt, (last_error or "")[:300])
            messages.append({"role": "assistant", "content": text})
            messages.append({"role": "user", "content": build_repair_prompt(code, result.error)})
    except Exception as e:
        logger.exception("unexpected error")
        return GenerateResponse(ok=False, provider_used=provider_used, code=code, error=f"Unexpected server error: {e}")

    return GenerateResponse(
        ok=False,
        provider_used=provider_used,
        code=code,
        error=f"Gave up after {MAX_REPAIR_ATTEMPTS} attempts. Last error: {last_error}",
        attempts=MAX_REPAIR_ATTEMPTS,
    )


@app.post("/api/run", response_model=GenerateResponse)
def run(req: RunRequest, request: Request) -> GenerateResponse:
    """Rebuilds code whose parameter values the user edited, without calling the LLM."""
    _require_password(request)
    _consume_generation_slot()

    result = run_build123d_code(req.code)
    if result.ok:
        return _model_response(result.glb_bytes, req.code, None, 0)
    return GenerateResponse(ok=False, code=req.code, error=result.error)


@app.post("/api/auth")
def auth(request: Request):
    _require_password(request)
    return {"ok": True}


@app.get("/api/health")
def health():
    configured = [p.name for p in router.providers if p.is_configured()]
    return {"status": "ok", "providers_configured": configured, "auth_required": bool(APP_PASSWORD)}


_frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
if _frontend_dir.exists():
    app.mount("/", StaticFiles(directory=_frontend_dir, html=True), name="frontend")
