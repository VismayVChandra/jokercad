import base64
import binascii
import logging
import os
import re
import secrets
import threading
import time
from collections import deque
from pathlib import Path
from urllib.parse import unquote

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .cad.executor import ExecutionResult, extract_code, run_build123d_code
from .cad.prompts import PLAN_SYSTEM_PROMPT, SYSTEM_PROMPT, build_repair_prompt, parse_plan
from .cad.render import render_views
from .cad.review import REVIEW_PROMPT, VISUAL_REVIEW_PROMPT, build_review_request, parse_verdict
from .llm.router import LLMRouter, RouterExhaustedError
from .models import GenerateRequest, GenerateResponse, PlannedPart, PlanRequest, PlanResponse, RunRequest

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
# Rough cap (at ~4 characters per token) on what one LLM request sends. Groq's
# free tier allows 8,000 tokens per minute including the reply, and rejects a
# single request that would exceed it outright.
INPUT_TOKEN_BUDGET = int(os.getenv("INPUT_TOKEN_BUDGET", "5000"))
# The end of a traceback is what explains the failure.
MAX_ERROR_CHARS = 1500
# base64 adds a third on top of this, and Vercel caps function responses at 4.5 MB.
MAX_GLB_BYTES = 3_000_000
# STEP goes back as the raw file, so it can use nearly all of the 4.5 MB.
MAX_STEP_BYTES = 4_000_000
# A reference picture sent with a prompt; the browser shrinks photos well below this.
MAX_IMAGE_BYTES = 3_000_000
# The fit chosen in the app, told to the model with each prompt: (description, clearance mm).
FITS = {
    "print:press": ("a press fit for 3D printing", 0.1),
    "print:sliding": ("a sliding fit for 3D printing", 0.3),
    "print:loose": ("a loose fit for 3D printing", 0.6),
    "machined:press": ("a machined press fit (about H7/p6)", -0.02),
    "machined:sliding": ("a machined sliding fit (about H7/g6)", 0.03),
    "machined:loose": ("a machined loose fit (about H11/c11)", 0.15),
}


def _fit_note(fit: str | None) -> str:
    if fit not in FITS:
        return ""
    description, clearance = FITS[fit]
    process, kind = fit.split(":")
    size = f"{abs(clearance):g} mm {'wider' if clearance >= 0 else 'narrower'}"
    return (
        f"\n\n(Fit setting: {description}. Where parts go together, like a pin or shaft in a hole, make the "
        f'hole {size} than what goes in it: fit_clearance("{kind}", "{process}"), kept in a `clearance` parameter.)'
    )


PICTURE_NOTE = (
    "A reference photo or sketch is attached. Build the object it shows as a part: use any dimensions "
    "written on it, and size the rest in proportion to a given dimension, or at a sensible real-world size "
    "if none is given. Keep every visible feature (holes, slots, steps, bosses, rounded edges)."
)
# After a part builds, a second model checks it against the request.
REVIEW_PARTS = os.getenv("REVIEW_PARTS", "1") != "0"

# Only generation is gated: it's what runs model-written code and spends LLM
# quota. The page itself stays viewable without the password.
APP_PASSWORD = os.getenv("APP_PASSWORD", "")
GENERATIONS_PER_HOUR = int(os.getenv("GENERATIONS_PER_HOUR", "60"))
ON_VERCEL = bool(os.getenv("VERCEL"))

# Optional: cross-device project sync (see README). The anon key is meant to
# be public — Supabase's Row Level Security is what actually protects each
# signed-in visitor's own projects, not keeping this key secret.
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")

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


def _fence(code: str) -> str:
    return "```python\n" + code + "\n```"


def _approx_tokens(*texts: str) -> int:
    return sum(len(t) for t in texts) // 4


def _prepare_history(history: list[dict], prompt: str) -> list[dict]:
    # Every assistant turn is a complete script, so only the latest one is
    # needed; older ones are stubbed out to save tokens.
    latest = max((i for i, m in enumerate(history) if m["role"] == "assistant"), default=-1)
    history = [
        m if m["role"] == "user" or i == latest else {"role": "assistant", "content": "(superseded earlier version)"}
        for i, m in enumerate(history)
    ]
    # Drop the oldest exchanges until the request fits, always keeping the latest one.
    while len(history) > 2 and _approx_tokens(SYSTEM_PROMPT, prompt, *(m["content"] for m in history)) > INPUT_TOKEN_BUDGET:
        history = history[2:]
    return history


# The model sometimes ignores what a prompt's engineering terms require (it
# draws gear teeth by hand, or treats "flange" as the body itself), producing
# the wrong part. So these requests are checked in code: when the prompt asks
# for the feature and the code lacks it, that attempt isn't run and the model
# is told what's missing.


def _wants_spur_gear(prompt: str) -> bool:
    # Other gear types, "gear-like" or "gear housing" aren't what spur_gear() makes.
    text = prompt.lower()
    asks_for_gear = re.search(r"\bspur\b", text) or (
        re.search(r"\bgears?\b(?!-)", text) and re.search(r"\b(teeth|tooth|module)\b", text)
    )
    other_type = re.search(r"\b(bevel|worm|rack|helical|herringbone|internal|planetary|sprocket)\b", text)
    return bool(asks_for_gear) and not other_type


def _wants_flange(prompt: str) -> bool:
    text = prompt.lower()
    removing = re.search(r"\b(no|without|remove|delete|drop)\b[^.]{0,30}\bflange", text)
    return bool(re.search(r"\bflange", text)) and not removing


def _wants_assembly(prompt: str) -> bool:
    # Things whose parts move relative to each other, unless asked for as one piece.
    text = prompt.lower()
    moving = re.search(
        r"\b(grippers?|hinges?|hinged|linkages?|mechanisms?|assembl(y|ies)|moving parts|articulated|pivoting|pivots)\b",
        text,
    )
    one_piece = re.search(r"\b(one|single)[ -](piece|part|solid|body)\b", text)
    return bool(moving) and not one_piece


def _wants_organic(prompt: str) -> bool:
    return bool(re.search(r"\b(organic|sculpt\w*|ergonomic|soften)\b", prompt.lower()))


# A top-level variable giving the flange its own size, whether a number or a
# formula (`flange_diameter = body_diameter + 5 * hole_diameter`). A thickness
# alone doesn't count: the usual mistake is calling a slice of the body "the flange".
_FLANGE_SIZE_VAR = re.compile(r"^\w*flange\w*(diameter|radius|width|length|size)\w*\s*=", re.MULTILINE)

# (does the prompt ask for it, does the code have it, what to tell the model if
# not, what to tell the reviewer so it doesn't undo the feature)
_FEATURE_CHECKS = [
    (
        _wants_spur_gear,
        lambda code: "spur_gear(" in code,
        "The gear teeth were drawn by hand. Use the built-in spur_gear() helper for the gear instead.",
        "The gear comes from a tested involute-gear helper; its tooth shape and tip diameter are correct.",
    ),
    (
        _wants_flange,
        lambda code: bool(_FLANGE_SIZE_VAR.search(code)),
        "The prompt asks for a flange, but the code has none. Build the flange as a separate plate wider than "
        "the body, with its size (e.g. flange_diameter) and thickness as top-level parameters, and put the "
        "mounting holes through the flange outside the body.",
        "The request asks for a flange, so the part is meant to be wider than the body diameter the user gave: "
        "the flange sticks out beyond the body and its mounting holes sit outside the body. Don't flag the "
        "overall width or the flange.",
    ),
    (
        _wants_assembly,
        lambda code: "children=" in code,
        "This is a mechanism with moving parts, but the code builds it as one solid. Build each moving part "
        "separately (the base, each arm or finger, a pin for each pivot), with every pivot's position in one "
        "shared variable so the holes and pins line up, label each part, return "
        "result = Compound(label=..., children=[...]), and describe how it moves in a motion dict, as in "
        "the clamp example.",
        "The design is an assembly on purpose: its moving parts are separate solids joined by pins through "
        "aligned holes. Don't ask to fuse them.",
    ),
    (
        _wants_organic,
        lambda code: "soften(" in code,
        "The request asks for an organic look, but the code doesn't round the part. Shape it with curves "
        "(arcs, splines, lofts) and finish with result = soften(result, fillet_radius).",
        "The request asks for an organic look: curved, tapered and rounded forms are intended, as long as the "
        "requested features are all there. Don't flag the rounding.",
    ),
]


def _review_notes(prompt: str) -> list[str]:
    return [note for wants, _, _, note in _FEATURE_CHECKS if wants(prompt)]


def _part_picture(result: ExecutionResult) -> bytes | None:
    if not result.mesh:
        return None
    try:
        return render_views(result.mesh)
    except Exception:
        logger.exception("couldn't draw the part for the review")
        return None


def _review_part(
    requests: list[str], result: ExecutionResult, notes: list[str], reference: bytes | None = None
) -> str | None:
    """What the reviewer thinks is wrong with a built part, or None if it looks right.

    The reviewer looks at a picture of the part when a model that can see is
    available, which catches misplaced and missing features that measurements
    alone don't; otherwise it goes by the code and measurements. Returns None
    as well when reviews are off, there are no measurements, or no reviewer can
    be reached: the review is a safety net, never a blocker.
    """
    stats = result.stats
    if not REVIEW_PARTS or not stats or "size" not in stats:
        return None
    messages = [{"role": "user", "content": build_review_request(requests, result.code, stats, notes)}]
    picture = _part_picture(result)
    if picture:
        images = [picture]
        if reference:
            images = [reference, picture]
            messages = [{
                "role": "user",
                "content": messages[0]["content"]
                + "\n\nThe first picture is the user's reference; the second is the built part.",
            }]
        try:
            return parse_verdict(router.review_visual(VISUAL_REVIEW_PROMPT, messages, images))
        except RouterExhaustedError as e:
            logger.warning("review by picture unavailable, checking the code instead: %s", e)
    try:
        return parse_verdict(router.review(REVIEW_PROMPT, messages))
    except RouterExhaustedError as e:
        logger.warning("review skipped: %s", e)
        return None


def _repair_messages(base_messages: list[dict], code: str, error: str) -> list[dict]:
    # A retry carries only the latest failed attempt, so repair requests don't
    # grow with every failure.
    return base_messages + [
        {"role": "assistant", "content": _fence(code)},
        {"role": "user", "content": build_repair_prompt(error[-MAX_ERROR_CHARS:])},
    ]


def _model_response(
    glb_bytes: bytes, code: str, provider_used: str | None, attempts: int, stats: dict | None = None
) -> GenerateResponse:
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
        parts=(stats or {}).get("assembly"),
        motion=(stats or {}).get("motion"),
    )


@app.post("/api/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest, request: Request) -> GenerateResponse:
    _require_password(request)

    prompt = req.prompt.strip()
    image = None
    if req.image:
        try:
            image = base64.b64decode(req.image, validate=True)
        except (binascii.Error, ValueError):
            return GenerateResponse(ok=False, error="The attached picture couldn't be read.")
        if len(image) > MAX_IMAGE_BYTES:
            return GenerateResponse(ok=False, error="The attached picture is too large (over 3 MB).")
        if not any(p.is_configured() for p in router.vision_providers):
            return GenerateResponse(
                ok=False, error="Building from a picture needs Gemini: set GEMINI_API_KEY on the server."
            )
    if not prompt and not image:
        return GenerateResponse(ok=False, error="Prompt is empty.")
    if len(prompt) > MAX_PROMPT_LENGTH:
        return GenerateResponse(ok=False, error=f"Prompt is too long (max {MAX_PROMPT_LENGTH} characters).")

    _consume_generation_slot()

    request_text = prompt or "Build the object in the picture."
    history = _prepare_history([m.model_dump() for m in req.history][-MAX_HISTORY_MESSAGES:], request_text)
    asked = f"{PICTURE_NOTE}\n\n{request_text}" if image else request_text
    base_messages = history + [{"role": "user", "content": asked + _fit_note(req.fit)}]
    messages = base_messages
    images = [image] if image else None
    required_features = [(has, message) for wants, has, message, _ in _FEATURE_CHECKS if wants(request_text)]
    requests_so_far = [m["content"] for m in history if m["role"] == "user"] + [request_text]
    review_notes = _review_notes(request_text)

    provider_used = None
    code = None
    last_error = None
    # The latest part that built but that the review objected to. It's returned,
    # with the objection as a note, if no later attempt does better.
    flagged: GenerateResponse | None = None

    try:
        for attempt in range(1, MAX_REPAIR_ATTEMPTS + 1):
            try:
                text, provider_used = router.generate(SYSTEM_PROMPT, messages, images=images)
            except RouterExhaustedError as e:
                logger.warning("attempt=%d all providers failed: %s", attempt, e)
                return flagged or GenerateResponse(ok=False, code=code, error=e.user_message(), attempts=attempt)

            code = extract_code(text)

            missing = next((message for has, message in required_features if not has(code)), None)
            if missing:
                last_error = missing
                logger.info("provider=%s attempt=%d missing a requested feature: %s", provider_used, attempt, missing[:60])
                messages = _repair_messages(base_messages, code, missing)
                continue

            result = run_build123d_code(code)

            if result.ok:
                logger.info("provider=%s attempt=%d ok (%d bytes)", provider_used, attempt, len(result.glb_bytes))
                response = _model_response(result.glb_bytes, code, provider_used, attempt, result.stats)
                problem = _review_part(requests_so_far, result, review_notes, image) if response.ok else None
                if not problem:
                    return response
                logger.info("provider=%s attempt=%d review flagged: %s", provider_used, attempt, problem[:120])
                response.note = problem
                flagged = response
                last_error = f"The part built, but a check against the request found a problem: {problem}"
                messages = _repair_messages(base_messages, code, last_error)
                continue

            if not result.retryable:
                logger.error("CAD engine unavailable: %s", result.error)
                return GenerateResponse(
                    ok=False, provider_used=provider_used, code=code, error=result.error, attempts=attempt
                )

            last_error = result.error
            logger.info("provider=%s attempt=%d failed: %s", provider_used, attempt, last_error[-300:])
            messages = _repair_messages(base_messages, code, last_error)
    except Exception as e:
        logger.exception("unexpected error")
        return flagged or GenerateResponse(
            ok=False, provider_used=provider_used, code=code, error=f"Unexpected server error: {e}"
        )

    if flagged:
        return flagged
    last_line = (last_error or "").strip().splitlines()[-1] if last_error and last_error.strip() else "unknown error"
    return GenerateResponse(
        ok=False,
        provider_used=provider_used,
        code=code,
        error=f"Couldn't build a valid part after {MAX_REPAIR_ATTEMPTS} attempts. Last error: {last_line}",
        attempts=MAX_REPAIR_ATTEMPTS,
    )


@app.post("/api/plan", response_model=PlanResponse)
def plan(req: PlanRequest, request: Request) -> PlanResponse:
    """Breaks a whole-product prompt into a short list of parts, each with its own
    self-contained build prompt, to hand one at a time to /api/generate and assemble."""
    _require_password(request)

    prompt = req.prompt.strip()
    if not prompt:
        return PlanResponse(ok=False, error="Describe what you want to build.")
    if len(prompt) > MAX_PROMPT_LENGTH:
        return PlanResponse(ok=False, error=f"Prompt is too long (max {MAX_PROMPT_LENGTH} characters).")

    _consume_generation_slot()

    try:
        text, _ = router.generate(PLAN_SYSTEM_PROMPT, [{"role": "user", "content": prompt}])
    except RouterExhaustedError as e:
        return PlanResponse(ok=False, error=e.user_message())

    parts = parse_plan(text)
    if not parts:
        return PlanResponse(ok=False, error="Couldn't break that into parts — try describing it a bit more concretely.")
    return PlanResponse(ok=True, parts=[PlannedPart(name=name, prompt=part_prompt) for name, part_prompt in parts])


@app.post("/api/run", response_model=GenerateResponse)
def run(req: RunRequest, request: Request) -> GenerateResponse:
    """Rebuilds code whose parameter values the user edited, without calling the LLM."""
    _require_password(request)
    _consume_generation_slot()

    result = run_build123d_code(req.code)
    if result.ok:
        return _model_response(result.glb_bytes, req.code, None, 0, result.stats)
    return GenerateResponse(ok=False, code=req.code, error=result.error)


@app.post("/api/export/step")
def export_step(req: RunRequest, request: Request) -> Response:
    """Rebuilds the code and returns the part as a STEP file, the format other CAD tools import."""
    _require_password(request)
    _consume_generation_slot()

    result = run_build123d_code(req.code, step=True)
    if not result.ok:
        last_line = (result.error or "").strip().splitlines()[-1:] or ["unknown error"]
        raise HTTPException(status_code=422, detail=f"Couldn't rebuild the part for export: {last_line[0]}")
    if not result.step_bytes:
        raise HTTPException(status_code=500, detail="The STEP export didn't produce a file.")
    if len(result.step_bytes) > MAX_STEP_BYTES:
        raise HTTPException(status_code=413, detail="The part is too detailed to send as STEP (over 4 MB).")
    return Response(
        content=result.step_bytes,
        media_type="model/step",
        headers={"Content-Disposition": 'attachment; filename="jokercad-part.step"'},
    )


@app.post("/api/auth")
def auth(request: Request):
    _require_password(request)
    return {"ok": True}


@app.get("/api/health")
def health():
    configured = [p.name for p in router.providers if p.is_configured()]
    resp = {"status": "ok", "providers_configured": configured, "auth_required": bool(APP_PASSWORD)}
    if SUPABASE_URL and SUPABASE_ANON_KEY:
        resp["sync"] = {"url": SUPABASE_URL, "anon_key": SUPABASE_ANON_KEY}
    return resp


_frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
if _frontend_dir.exists():
    app.mount("/", StaticFiles(directory=_frontend_dir, html=True), name="frontend")
