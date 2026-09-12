import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .cad.executor import GENERATED_DIR, extract_code, run_build123d_code
from .cad.prompts import SYSTEM_PROMPT, build_repair_prompt
from .llm.router import LLMRouter, RouterExhaustedError
from .models import GenerateRequest, GenerateResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("jokercad")

app = FastAPI(title="jokercad")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/generated", StaticFiles(directory=GENERATED_DIR), name="generated")

router = LLMRouter()

# In-memory per-session conversation state. Fine for a single-user local
# prototype; swap for a real store before running this for multiple users.
_sessions: dict[str, dict] = {}

MAX_REPAIR_ATTEMPTS = int(os.getenv("MAX_REPAIR_ATTEMPTS", "3"))
# Bounds how much conversation history gets replayed to the LLM on each turn,
# so a long iterative session doesn't blow past free-tier context limits.
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "16"))
MAX_PROMPT_LENGTH = 2000


@app.post("/api/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest) -> GenerateResponse:
    prompt = req.prompt.strip()
    if not prompt:
        return GenerateResponse(ok=False, error="Prompt is empty.")
    if len(prompt) > MAX_PROMPT_LENGTH:
        return GenerateResponse(ok=False, error=f"Prompt is too long (max {MAX_PROMPT_LENGTH} characters).")

    session = _sessions.setdefault(req.session_id, {"messages": []})
    history = session["messages"][-MAX_HISTORY_MESSAGES:]
    messages = list(history) + [{"role": "user", "content": prompt}]

    provider_used = None
    code = None
    last_error = None

    try:
        for attempt in range(1, MAX_REPAIR_ATTEMPTS + 1):
            try:
                text, provider_used = router.generate(SYSTEM_PROMPT, messages)
            except RouterExhaustedError as e:
                logger.warning("session=%s attempt=%d router exhausted: %s", req.session_id, attempt, e)
                return GenerateResponse(ok=False, error=str(e), attempts=attempt)

            code = extract_code(text)
            result = run_build123d_code(code, req.session_id)

            if result.ok:
                logger.info(
                    "session=%s provider=%s attempt=%d ok", req.session_id, provider_used, attempt
                )
                session["messages"] = messages + [{"role": "assistant", "content": text}]
                return GenerateResponse(
                    ok=True,
                    provider_used=provider_used,
                    code=code,
                    glb_url=f"/generated/{Path(result.glb_path).name}",
                    stl_url=f"/generated/{Path(result.stl_path).name}",
                    attempts=attempt,
                )

            last_error = result.error
            logger.info(
                "session=%s provider=%s attempt=%d failed: %s",
                req.session_id, provider_used, attempt, (last_error or "")[:300],
            )
            messages.append({"role": "assistant", "content": text})
            messages.append({"role": "user", "content": build_repair_prompt(code, result.error)})
    except Exception as e:
        logger.exception("session=%s unexpected error", req.session_id)
        return GenerateResponse(ok=False, provider_used=provider_used, code=code, error=f"Unexpected server error: {e}")

    return GenerateResponse(
        ok=False,
        provider_used=provider_used,
        code=code,
        error=f"Gave up after {MAX_REPAIR_ATTEMPTS} attempts. Last error: {last_error}",
        attempts=MAX_REPAIR_ATTEMPTS,
    )


@app.get("/api/health")
def health():
    configured = [p.name for p in router.providers if p.is_configured()]
    return {"status": "ok", "providers_configured": configured}


_frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
if _frontend_dir.exists():
    app.mount("/", StaticFiles(directory=_frontend_dir, html=True), name="frontend")
