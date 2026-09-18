"""Pulling the code and the intent spec out of a model reply.

The code fence used to be `(?:python)?`, which would happily have matched the
new JSON block and fed it to the CAD engine as Python. These tests pin the
split, including replies in the older code-only shape that conversations saved
before the spec existed still produce.
"""

from app.cad.executor import extract_code, extract_spec

TWO_BLOCK_REPLY = """```json
{"part": "plate", "units": "mm", "dimensions": {"length": 100},
 "features": [{"type": "hole_pattern", "diameter": 6, "count": 4}],
 "explicit": ["100 mm long"], "assumptions": ["8 mm thick"]}
```

```python
length = 100.0  # mm
result = Box(length, 60, 8)
```
"""

CODE_ONLY_REPLY = """```python
result = Box(10, 10, 10)
```
"""

UNTAGGED_REPLY = """```
result = Box(10, 10, 10)
```
"""


def test_two_block_reply_splits_cleanly():
    assert extract_code(TWO_BLOCK_REPLY).startswith("length = 100.0")
    assert "json" not in extract_code(TWO_BLOCK_REPLY)
    spec = extract_spec(TWO_BLOCK_REPLY)
    assert spec["dimensions"]["length"] == 100
    assert spec["features"][0]["count"] == 4
    assert spec["assumptions"] == ["8 mm thick"]


def test_json_block_is_never_mistaken_for_code():
    """The regression this file exists for."""
    code = extract_code(TWO_BLOCK_REPLY)
    assert not code.lstrip().startswith("{")


def test_code_only_reply_still_works():
    assert extract_code(CODE_ONLY_REPLY) == "result = Box(10, 10, 10)"
    assert extract_spec(CODE_ONLY_REPLY) is None


def test_untagged_fence_still_works():
    assert extract_code(UNTAGGED_REPLY) == "result = Box(10, 10, 10)"


def test_json_first_but_untagged_python():
    reply = '```json\n{"part": "x"}\n```\n\n```\nresult = Box(1, 1, 1)\n```'
    assert extract_code(reply) == "result = Box(1, 1, 1)"
    assert extract_spec(reply) == {"part": "x"}


def test_malformed_spec_costs_the_check_not_the_part():
    reply = '```json\n{"part": "x", oops\n```\n\n```python\nresult = Box(1, 1, 1)\n```'
    assert extract_spec(reply) is None
    assert extract_code(reply) == "result = Box(1, 1, 1)"


def test_spec_must_be_an_object():
    assert extract_spec('```json\n[1, 2, 3]\n```') is None


def test_oversized_spec_is_trimmed():
    huge = '{"assumptions": [' + ", ".join(f'"item {i}"' for i in range(200)) + "]}"
    spec = extract_spec(f"```json\n{huge}\n```")
    assert len(spec["assumptions"]) <= 24


def test_long_spec_strings_are_capped():
    spec = extract_spec('```json\n{"note": "' + "x" * 5000 + '"}\n```')
    assert len(spec["note"]) <= 400
