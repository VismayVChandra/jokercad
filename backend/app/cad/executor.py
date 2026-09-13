import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

# The first build123d/OCP import in a fresh process can take 60-90s on Windows
# (antivirus scanning the native OpenCascade DLLs); later runs take seconds.
EXECUTION_TIMEOUT_SECONDS = 120

# Exit code the runner uses when build123d itself can't be imported, so a
# broken environment isn't mistaken for a bug the LLM could fix.
_ENGINE_UNAVAILABLE_EXIT = 97

_CODE_FENCE_RE = re.compile(r"```(?:python)?\s*\n(.*?)```", re.DOTALL)

_FORBIDDEN_TOKENS = ("import os", "import sys", "subprocess", "__import__", "open(", "eval(", "exec(", "socket")

_SECRET_ENV_NAME = re.compile(r"KEY|SECRET|TOKEN|PASSWORD", re.IGNORECASE)

_RUNNER_TEMPLATE = """\
try:
    from build123d import *
except Exception as _engine_error:
    import sys as _sys
    print(f"{{type(_engine_error).__name__}}: {{_engine_error}}", file=_sys.stderr)
    _sys.exit({engine_exit})
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

from build123d import export_gltf
export_gltf(result, r"{glb_path}", binary=True)
"""


@dataclass
class ExecutionResult:
    ok: bool
    code: str
    glb_bytes: bytes | None = None
    error: str | None = None
    # False when the failure is environmental (CAD engine won't load), so
    # asking the LLM to "fix" its code would just waste calls.
    retryable: bool = True


def extract_code(llm_text: str) -> str:
    match = _CODE_FENCE_RE.search(llm_text)
    return match.group(1).strip() if match else llm_text.strip()


def _child_env() -> dict[str, str]:
    # Model-written code runs in the child, so don't hand it the API keys.
    env = {k: v for k, v in os.environ.items() if not _SECRET_ENV_NAME.search(k)}
    # Serverless runtimes can put dependencies on sys.path at startup instead
    # of in the interpreter's own site-packages; pass the parent's path along
    # so the child finds build123d the same way.
    env["PYTHONPATH"] = os.pathsep.join(p for p in sys.path if p)
    # Python 3.13+ colours tracebacks when FORCE_COLOR is set; the escape
    # codes garble the UI and the error text fed back to the LLM.
    env["PYTHON_COLORS"] = "0"
    # System libraries OpenCascade links against (libGL and friends) that the
    # host lacks, copied into backend/syslibs at deploy time by
    # scripts/vendor_system_libs.sh.
    syslib_dir = Path(__file__).resolve().parents[2] / "syslibs"
    if syslib_dir.is_dir():
        env["LD_LIBRARY_PATH"] = os.pathsep.join(p for p in (str(syslib_dir), env.get("LD_LIBRARY_PATH", "")) if p)
    return env


def run_build123d_code(code: str) -> ExecutionResult:
    for token in _FORBIDDEN_TOKENS:
        if token in code:
            return ExecutionResult(ok=False, code=code, error=f"Generated code contains disallowed token: {token!r}")

    # A throwaway directory per run: on serverless hosts only the temp dir is
    # writable, and nothing needs to outlive the request.
    with tempfile.TemporaryDirectory(prefix="jokercad-") as work_dir:
        glb_path = Path(work_dir) / "part.glb"
        script_path = Path(work_dir) / "run.py"
        script_path.write_text(
            _RUNNER_TEMPLATE.format(user_code=code, glb_path=glb_path, engine_exit=_ENGINE_UNAVAILABLE_EXIT),
            encoding="utf-8",
        )

        try:
            proc = subprocess.run(
                [sys.executable, str(script_path)],
                capture_output=True,
                text=True,
                timeout=EXECUTION_TIMEOUT_SECONDS,
                cwd=work_dir,
                env=_child_env(),
            )
        except subprocess.TimeoutExpired:
            return ExecutionResult(ok=False, code=code, error=f"Execution timed out after {EXECUTION_TIMEOUT_SECONDS}s.")

        if proc.returncode == _ENGINE_UNAVAILABLE_EXIT:
            return ExecutionResult(
                ok=False,
                code=code,
                error=f"The CAD engine (build123d/OpenCascade) failed to load on this server: {proc.stderr.strip()}",
                retryable=False,
            )

        if proc.returncode != 0:
            return ExecutionResult(ok=False, code=code, error=proc.stderr.strip()[-4000:])

        if not glb_path.exists():
            return ExecutionResult(ok=False, code=code, error="Script ran but did not produce a GLB file.")

        return ExecutionResult(ok=True, code=code, glb_bytes=glb_path.read_bytes())
