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

from .validator import UnsafeCode, validate_code

# The first build123d/OCP import in a fresh process can take 60-90s on Windows
# (antivirus scanning the native OpenCascade DLLs); later runs take seconds.
EXECUTION_TIMEOUT_SECONDS = 120

# Exit code the runner uses when build123d itself can't be imported, so a
# broken environment isn't mistaken for a bug the LLM could fix.
_ENGINE_UNAVAILABLE_EXIT = 97

# Copied next to each generated script as `jokercad_parts`, so its helpers
# (e.g. spur_gear) are available to generated code.
_PARTS_LIBRARY = Path(__file__).with_name("parts_library.py")

_PYTHON_FENCE_RE = re.compile(r"```python\s*\n(.*?)```", re.DOTALL)
_JSON_FENCE_RE = re.compile(r"```json\s*\n(.*?)```", re.DOTALL)
_ANY_FENCE_RE = re.compile(r"```(?:\w+)?\s*\n(.*?)```", re.DOTALL)

# Caps on the model-declared spec before it is stored or shown: it is model
# output, so it gets bounded like any other untrusted text.
_MAX_SPEC_ITEMS = 24
_MAX_SPEC_TEXT = 400

_SECRET_ENV_NAME = re.compile(r"KEY|SECRET|TOKEN|PASSWORD", re.IGNORECASE)

# Ceilings the child puts on itself before any model-written code runs (POSIX
# only; Windows has no `resource` module, so local development goes without).
# A process can lower a hard limit but not raise it again, so code running
# later in the script cannot undo these.
#
# CPU seconds: stops a runaway loop burning the box without waiting out the
# wall-clock timeout.
CAD_CPU_SECONDS = int(os.getenv("CAD_CPU_SECONDS", str(EXECUTION_TIMEOUT_SECONDS)))
# Largest file the child may write. Real output is a few MB; this stops a
# script filling the disk.
CAD_MAX_FILE_MB = int(os.getenv("CAD_MAX_FILE_MB", "64"))
# Processes/threads for this user. Generous, because OpenCascade uses threads;
# a fork bomb reaches it immediately, ordinary work never does.
CAD_MAX_PROCESSES = int(os.getenv("CAD_MAX_PROCESSES", "256"))
# Address-space ceiling, off by default: OpenCascade reserves a lot of virtual
# memory it never commits, and too low a value breaks legitimate builds. Set
# CAD_MEMORY_LIMIT_MB on a host where memory exhaustion matters more.
CAD_MEMORY_LIMIT_MB = int(os.getenv("CAD_MEMORY_LIMIT_MB", "0"))

# Refuse to read a result bigger than this into memory. The API caps GLB at
# 3 MB and STEP at 4 MB further up; this is the backstop that keeps a script
# that wrote a huge file from turning into an out-of-memory crash here.
_MAX_RESULT_BYTES = 64 * 1024 * 1024

_RUNNER_TEMPLATE = """\
{limits_code}
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

# Runs first, before the CAD engine or any model-written code is loaded. Each
# limit is applied on its own: a kernel that doesn't offer one shouldn't cost
# us the others.
_LIMITS_CODE = """\
try:
    import resource as _rlimit
    for _name, _value in (
        ("RLIMIT_CPU", {cpu_seconds}),
        ("RLIMIT_FSIZE", {file_bytes}),
        ("RLIMIT_NPROC", {max_processes}),
        ("RLIMIT_AS", {memory_bytes}),
    ):
        if not _value:
            continue
        _which = getattr(_rlimit, _name, None)
        if _which is None:
            continue
        try:
            _rlimit.setrlimit(_which, (_value, _value))
        except (ValueError, OSError):
            pass
    del _rlimit
except ImportError:
    pass
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
    try:
        stats["measured"] = _jokercad_measure(result)
    except Exception:
        pass
    return stats


def _jokercad_measure(result):
    """Real measurements read back off the built solid.

    Everything here is queried from the geometry itself, so the self-check and
    the inspector never show a number the model merely claimed. Wrapped by the
    caller: a measurement that fails must never cost the user their part.
    """
    faces = result.faces()
    measured = {
        "area": result.area,
        "faces": len(faces),
        "edges": len(result.edges()),
        "vertices": len(result.vertices()),
        "shells": len(result.shells()),
        "valid": bool(result.is_valid),
        "degenerate_faces": sum(1 for f in faces if f.area < 1e-9),
    }
    try:
        measured["holes"] = _jokercad_round_features(result)
    except Exception:
        pass
    return measured


def _jokercad_round_features(result):
    """Every cylindrical face, told apart as a hole or a boss.

    A hole's outward normal (out of the solid) points back toward its own axis;
    a boss's points away from it. Faces sharing an axis and diameter are one
    feature: a bore can be split into several faces by whatever else touches it.
    """
    from OCP.BRepAdaptor import BRepAdaptor_Surface

    found = {}
    for face in result.faces().filter_by(GeomType.CYLINDER):
        cylinder = BRepAdaptor_Surface(face.wrapped).Cylinder()
        axis = cylinder.Axis()
        origin, direction = axis.Location(), axis.Direction()
        radius = cylinder.Radius()

        point = face.center()
        normal = face.normal_at(point)
        offset = (point.X - origin.X(), point.Y - origin.Y(), point.Z - origin.Z())
        along = sum(o * d for o, d in zip(offset, (direction.X(), direction.Y(), direction.Z())))
        radial = [o - along * d for o, d in zip(offset, (direction.X(), direction.Y(), direction.Z()))]
        outward = radial[0] * normal.X + radial[1] * normal.Y + radial[2] * normal.Z

        # A cylinder's axis may be reported pointing either way, from any point
        # along it. Normalise both so one physical hole is one entry: flip the
        # direction to a canonical sign, and name the axis by its closest point
        # to the origin rather than by whichever point OpenCascade handed back.
        axis_dir = [direction.X(), direction.Y(), direction.Z()]
        if [round(v, 6) for v in axis_dir] < [0.0, 0.0, 0.0]:
            axis_dir = [-v for v in axis_dir]
        start = (origin.X(), origin.Y(), origin.Z())
        from_origin = sum(s * d for s, d in zip(start, axis_dir))
        on_axis = [s - from_origin * d for s, d in zip(start, axis_dir)]

        key = (round(radius, 4), tuple(round(v, 3) for v in axis_dir), tuple(round(v, 3) for v in on_axis))
        entry = found.get(key)
        if entry is None:
            entry = {
                "diameter": 2 * radius,
                "kind": "boss" if outward > 0 else "hole",
                "axis": [round(v, 4) for v in axis_dir],
                "at": [round(v, 3) for v in on_axis],
                "face_area": 0.0,
            }
            found[key] = entry
        entry["face_area"] += face.area

    features = []
    for entry in found.values():
        # Exact for a full cylinder: area = 2 * pi * r * height.
        height = entry.pop("face_area") / (math.pi * entry["diameter"]) if entry["diameter"] else 0.0
        entry["height"] = round(height, 3)
        entry["diameter"] = round(entry["diameter"], 4)
        features.append(entry)
    features.sort(key=lambda f: (f["kind"], -f["diameter"], f["at"]))
    return features


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
    """The Python block from a reply that may also carry a JSON intent block.

    A `python`-tagged fence wins outright; without one, any fence that isn't the
    JSON spec is taken, so replies from before the spec existed still work.
    """
    match = _PYTHON_FENCE_RE.search(llm_text)
    if match:
        return match.group(1).strip()
    without_spec = _JSON_FENCE_RE.sub("", llm_text)
    match = _ANY_FENCE_RE.search(without_spec)
    return match.group(1).strip() if match else without_spec.strip()


def extract_spec(llm_text: str) -> dict | None:
    """The declared design intent, or None when the model didn't give usable JSON.

    Never raises: a missing or malformed spec costs the self-check, not the part.
    """
    match = _JSON_FENCE_RE.search(llm_text)
    if not match:
        return None
    try:
        spec = json.loads(match.group(1))
    except (json.JSONDecodeError, ValueError):
        return None
    return _trim_spec(spec) if isinstance(spec, dict) else None


def _trim_spec(spec: dict) -> dict:
    """Bounds a model-written spec so it can't bloat storage or a response."""

    def clean(value, depth=0):
        if depth > 4:
            return None
        if isinstance(value, str):
            return value[:_MAX_SPEC_TEXT]
        if isinstance(value, bool) or isinstance(value, (int, float)) or value is None:
            return value
        if isinstance(value, list):
            return [clean(v, depth + 1) for v in value[:_MAX_SPEC_ITEMS]]
        if isinstance(value, dict):
            return {str(k)[:80]: clean(v, depth + 1) for k, v in list(value.items())[:_MAX_SPEC_ITEMS]}
        return None

    return {str(k)[:80]: clean(v) for k, v in list(spec.items())[:_MAX_SPEC_ITEMS]}


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
    """Runs model-written code; with step=True, also exports the part as STEP.

    The code is untrusted: `validate_code` rejects anything beyond building a
    part, and the script then limits itself (CPU, file size, processes) before
    the CAD engine loads. See `validator.py` for what that does and doesn't buy.
    """
    try:
        validate_code(code)
    except UnsafeCode as e:
        return ExecutionResult(ok=False, code=code, error=str(e))

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
                limits_code=_LIMITS_CODE.format(
                    cpu_seconds=CAD_CPU_SECONDS,
                    file_bytes=CAD_MAX_FILE_MB * 1024 * 1024,
                    max_processes=CAD_MAX_PROCESSES,
                    memory_bytes=CAD_MEMORY_LIMIT_MB * 1024 * 1024,
                ),
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

        try:
            glb_bytes = _read_capped(glb_path, "model")
            step_bytes = _read_capped(step_path, "STEP file") if step and step_path.exists() else None
            stats_text = _read_capped(stats_path, "measurements") if stats_path.exists() else None
        except ValueError as e:
            return ExecutionResult(ok=False, code=code, error=str(e))

        stats = json.loads(stats_text.decode("utf-8")) if stats_text else None
        return ExecutionResult(
            ok=True,
            code=code,
            glb_bytes=glb_bytes,
            stats=stats or None,
            step_bytes=step_bytes,
            mesh=_load_mesh(mesh_path),
        )


def _read_capped(path: Path, label: str) -> bytes:
    """Reads a result file, refusing one too big to hold in memory."""
    size = path.stat().st_size
    if size > _MAX_RESULT_BYTES:
        raise ValueError(f"The generated {label} is too large ({size // (1024 * 1024)} MB). Try a simpler part.")
    return path.read_bytes()


def _load_mesh(path: Path) -> list | None:
    if not path.exists() or path.stat().st_size > _MAX_RESULT_BYTES:
        return None
    try:
        with np.load(path) as data:
            return [(data[f"v{i}"], data[f"t{i}"]) for i in range(len(data.files) // 2)]
    except Exception:
        return None
