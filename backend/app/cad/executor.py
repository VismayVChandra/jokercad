import re
import subprocess
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path

GENERATED_DIR = Path(__file__).resolve().parent.parent.parent / "generated"
GENERATED_DIR.mkdir(exist_ok=True)

# The first build123d/OCP import in a fresh process can take 60-90s (OS/AV
# scanning the native OpenCascade DLLs the first time); later runs are ~5s.
EXECUTION_TIMEOUT_SECONDS = 120

_CODE_FENCE_RE = re.compile(r"```(?:python)?\s*\n(.*?)```", re.DOTALL)

_FORBIDDEN_TOKENS = ("import os", "import sys", "subprocess", "__import__", "open(", "eval(", "exec(", "socket")

_RUNNER_TEMPLATE = """\
from build123d import *
import math

{user_code}

if "result" not in dir():
    raise RuntimeError("Generated code did not assign a `result` variable.")

if not hasattr(result, "volume"):
    raise RuntimeError(
        f"`result` is a {{type(result).__name__}}, not a solid Part/Solid/Compound "
        "(e.g. you assigned a Sketch or a builder object instead of `bp.part`)."
    )
if result.volume <= 1e-6:
    raise RuntimeError(
        f"`result` has ~zero volume ({{result.volume}}mm^3) — the solid is empty, "
        "fully subtracted away, or the boolean operations cancelled it out."
    )
if hasattr(result, "is_valid") and not result.is_valid:
    raise RuntimeError("`result` is not a valid/manifold solid (self-intersecting or malformed geometry).")

from build123d import export_stl, export_gltf
export_stl(result, r"{stl_path}")
export_gltf(result, r"{glb_path}", binary=True)
"""


@dataclass
class ExecutionResult:
    ok: bool
    code: str
    stl_path: str | None = None
    glb_path: str | None = None
    error: str | None = None


def extract_code(llm_text: str) -> str:
    match = _CODE_FENCE_RE.search(llm_text)
    return match.group(1).strip() if match else llm_text.strip()


def run_build123d_code(code: str, session_id: str) -> ExecutionResult:
    for token in _FORBIDDEN_TOKENS:
        if token in code:
            return ExecutionResult(ok=False, code=code, error=f"Generated code contains disallowed token: {token!r}")

    job_id = uuid.uuid4().hex[:8]
    stl_path = GENERATED_DIR / f"{session_id}_{job_id}.stl"
    glb_path = GENERATED_DIR / f"{session_id}_{job_id}.glb"
    script_path = GENERATED_DIR / f"{session_id}_{job_id}_run.py"

    script = _RUNNER_TEMPLATE.format(user_code=code, stl_path=stl_path, glb_path=glb_path)
    script_path.write_text(script, encoding="utf-8")

    try:
        proc = subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=True,
            text=True,
            timeout=EXECUTION_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return ExecutionResult(ok=False, code=code, error=f"Execution timed out after {EXECUTION_TIMEOUT_SECONDS}s.")
    finally:
        script_path.unlink(missing_ok=True)

    if proc.returncode != 0:
        return ExecutionResult(ok=False, code=code, error=proc.stderr.strip()[-4000:])

    if not glb_path.exists():
        return ExecutionResult(ok=False, code=code, error="Script ran but did not produce a GLB file.")

    return ExecutionResult(ok=True, code=code, stl_path=str(stl_path), glb_path=str(glb_path))
