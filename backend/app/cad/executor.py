import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np

# The first build123d/OCP import in a fresh process can take 60-90s on Windows
# (antivirus scanning the native OpenCascade DLLs); later runs take seconds.
EXECUTION_TIMEOUT_SECONDS = 120

# Exit code the runner uses when build123d itself can't be imported, so a
# broken environment isn't mistaken for a bug the LLM could fix.
_ENGINE_UNAVAILABLE_EXIT = 97

# Copied next to each generated script as `jokercad_parts`, so its helpers
# (e.g. spur_gear) are available to generated code.
_PARTS_LIBRARY = Path(__file__).with_name("parts_library.py")

_CODE_FENCE_RE = re.compile(r"```(?:python)?\s*\n(.*?)```", re.DOTALL)

_FORBIDDEN_TOKENS = ("import os", "import sys", "subprocess", "__import__", "open(", "eval(", "exec(", "socket")

_SECRET_ENV_NAME = re.compile(r"KEY|SECRET|TOKEN|PASSWORD", re.IGNORECASE)

_RUNNER_TEMPLATE = """\
try:
    from build123d import *
    from jokercad_parts import *
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

# Measurements for the review step; never allowed to break the build.
{stats_code}
try:
    _stats = _jokercad_stats(result)
except Exception:
    _stats = {{}}
# How a mechanism moves, when the code says.
try:
    if isinstance(globals().get("motion"), dict):
        _stats["motion"] = _jokercad_motion(motion)
except Exception:
    pass
import json as _json
with open(r"{stats_path}", "w", encoding="utf-8") as _stats_file:
    _json.dump(_stats, _stats_file)

from build123d import export_gltf
export_gltf(result, r"{glb_path}", binary=True)

# Each part's triangles, for the picture the review looks at; never allowed to
# break the build.
try:
    import numpy as _np
    _pieces = list(getattr(result, "children", None) or []) or [result]
    _size = result.bounding_box().size
    _tolerance = max(_size.X, _size.Y, _size.Z) / 400 or 0.1
    _arrays = {{}}
    for _i, _piece in enumerate(_pieces[:16]):
        _vertices, _triangles = _piece.tessellate(_tolerance, 0.3)
        _arrays["v%d" % _i] = _np.array([(_p.X, _p.Y, _p.Z) for _p in _vertices], dtype=_np.float32)
        _arrays["t%d" % _i] = _np.array(_triangles, dtype=_np.int32).reshape(-1, 3)
    _np.savez_compressed(r"{mesh_path}", **_arrays)
except Exception:
    pass
{step_export}
"""

_STEP_EXPORT = """\
from build123d import export_step
export_step(result, r"{step_path}")
"""

# Measures the built part for the review step: its overall size, and for an
# assembly (or a part made of separate solids) each piece and any overlaps
# between pieces, which show parts colliding or not meeting where they should.
_STATS_CODE = '''\
def _jokercad_stats(result):
    def corners(shape):
        box = shape.bounding_box()
        return [box.min.X, box.min.Y, box.min.Z], [box.max.X, box.max.Y, box.max.Z]

    lo, hi = corners(result)
    stats = {
        "size": [b - a for a, b in zip(lo, hi)],
        "min": lo,
        "max": hi,
        "volume": result.volume,
        "solids": len(result.solids()),
    }
    children = list(getattr(result, "children", None) or [])
    if children:
        stats["assembly"] = [getattr(c, "label", "") or "" for c in children]
    pieces = children or list(result.solids())
    if 1 < len(pieces) <= 8:
        parts = []
        for i, piece in enumerate(pieces):
            plo, phi = corners(piece)
            name = getattr(piece, "label", "") or f"solid {i + 1}"
            parts.append({"name": name, "min": plo, "max": phi, "volume": piece.volume})
        overlaps = []
        for i in range(len(pieces)):
            for j in range(i + 1, len(pieces)):
                try:
                    shared = (pieces[i] & pieces[j]).volume
                except Exception:
                    continue
                if shared > 0.5:
                    overlaps.append([parts[i]["name"], parts[j]["name"], shared])
        stats["parts"] = parts
        stats["overlaps"] = overlaps
    return stats


def _jokercad_motion(spec):
    """The code's `motion` dict as plain JSON, for the viewer's motion slider."""
    def point(p):
        return [float(c) for c in list(p)[:3]]

    out = {
        "ground": str(spec.get("ground", "")),
        "range": [float(v) for v in list(spec.get("range", (-30, 30)))[:2]],
        "joints": [],
        "attached": [[str(a), str(b)] for a, b in list(spec.get("attached", []))[:32]],
    }
    for joint in list(spec.get("joints", []))[:24]:
        a, b = joint["parts"]
        entry = {"parts": [str(a), str(b)], "drive": float(joint.get("drive", 0) or 0)}
        if "slide" in joint:
            entry["slide"] = point(joint["slide"])
        else:
            entry["pivot"] = point(joint["pivot"])
        out["joints"].append(entry)
    return out
'''


@dataclass
class ExecutionResult:
    ok: bool
    code: str
    glb_bytes: bytes | None = None
    error: str | None = None
    # False when the failure is environmental (CAD engine won't load), so
    # asking the LLM to "fix" its code would just waste calls.
    retryable: bool = True
    # Bounding box, volume and solid count of the built part, when available.
    stats: dict | None = None
    # The part as a STEP file, when requested.
    step_bytes: bytes | None = None
    # (vertices, triangles) per part, for drawing the part for the review.
    mesh: list | None = None


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


def run_build123d_code(code: str, step: bool = False) -> ExecutionResult:
    """Runs model-written code; with step=True, also exports the part as STEP."""
    for token in _FORBIDDEN_TOKENS:
        if token in code:
            return ExecutionResult(ok=False, code=code, error=f"Generated code contains disallowed token: {token!r}")

    # A throwaway directory per run: on serverless hosts only the temp dir is
    # writable, and nothing needs to outlive the request.
    with tempfile.TemporaryDirectory(prefix="jokercad-") as work_dir:
        glb_path = Path(work_dir) / "part.glb"
        stats_path = Path(work_dir) / "stats.json"
        step_path = Path(work_dir) / "part.step"
        mesh_path = Path(work_dir) / "mesh.npz"
        script_path = Path(work_dir) / "run.py"
        shutil.copyfile(_PARTS_LIBRARY, Path(work_dir) / "jokercad_parts.py")
        script_path.write_text(
            _RUNNER_TEMPLATE.format(
                user_code=code,
                glb_path=glb_path,
                stats_path=stats_path,
                mesh_path=mesh_path,
                engine_exit=_ENGINE_UNAVAILABLE_EXIT,
                stats_code=_STATS_CODE,
                step_export=_STEP_EXPORT.format(step_path=step_path) if step else "",
            ),
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

        stats = json.loads(stats_path.read_text(encoding="utf-8")) if stats_path.exists() else None
        step_bytes = step_path.read_bytes() if step and step_path.exists() else None
        return ExecutionResult(
            ok=True,
            code=code,
            glb_bytes=glb_path.read_bytes(),
            stats=stats or None,
            step_bytes=step_bytes,
            mesh=_load_mesh(mesh_path),
        )


def _load_mesh(path: Path) -> list | None:
    if not path.exists():
        return None
    try:
        with np.load(path) as data:
            return [(data[f"v{i}"], data[f"t{i}"]) for i in range(len(data.files) // 2)]
    except Exception:
        return None
