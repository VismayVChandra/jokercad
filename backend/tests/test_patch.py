"""Applying a model's search/replace edits to a script it didn't repeat in full.

A misapplied edit is worse than a failed repair: it produces a part that builds
and is quietly the wrong size. So the rule these tests pin is that anything
ambiguous is refused rather than guessed at.
"""

import pytest

from app.cad.patch import PatchError, apply_patches, parse_patches

CODE = """from build123d import *

plate_length = 100  # mm, overall length
plate_width = 60  # mm, overall width
hole_diameter = 5.0  # mm, mounting hole

with BuildPart() as plate:
    Box(plate_length, plate_width, 8)
    with Locations((30, 20)):
        Hole(radius=hole_diameter / 2)

result = plate.part
"""


def edit(search: str, replace: str) -> str:
    return f"<<<<<<< SEARCH\n{search}\n=======\n{replace}\n>>>>>>> REPLACE"


def test_one_edit_changes_only_its_own_lines():
    out = apply_patches(CODE, edit("hole_diameter = 5.0  # mm, mounting hole", "hole_diameter = 6.5  # mm, mounting hole"))
    assert "hole_diameter = 6.5" in out
    assert "plate_length = 100" in out
    assert out.count("\n") == CODE.count("\n")


def test_several_edits_all_apply():
    reply = (
        edit("plate_length = 100  # mm, overall length", "plate_length = 120  # mm, overall length")
        + "\n"
        + edit("plate_width = 60  # mm, overall width", "plate_width = 80  # mm, overall width")
    )
    out = apply_patches(CODE, reply)
    assert "plate_length = 120" in out
    assert "plate_width = 80" in out


def test_indentation_is_preserved_and_required():
    out = apply_patches(CODE, edit("        Hole(radius=hole_diameter / 2)", "        Hole(radius=hole_diameter / 2, depth=4)"))
    assert "        Hole(radius=hole_diameter / 2, depth=4)" in out
    # Indentation is meaning in Python, so a block that gets it wrong is refused.
    with pytest.raises(PatchError):
        apply_patches(CODE, edit("Hole(radius=hole_diameter / 2)", "Hole(radius=3)"))


def test_trailing_whitespace_differences_are_forgiven():
    # Models drop trailing spaces silently, and it never changes what Python does.
    out = apply_patches(CODE, edit("plate_length = 100  # mm, overall length   ", "plate_length = 150  # mm, overall length"))
    assert "plate_length = 150" in out


def test_an_edit_matching_nothing_is_refused():
    with pytest.raises(PatchError, match="did not match"):
        apply_patches(CODE, edit("plate_length = 999", "plate_length = 1"))


def test_an_edit_matching_twice_is_refused_rather_than_guessed():
    doubled = CODE + "\nwith BuildPart() as plate:\n    Box(plate_length, plate_width, 8)\n"
    with pytest.raises(PatchError, match="matched 2 places"):
        apply_patches(doubled, edit("with BuildPart() as plate:", "with BuildPart() as base:"))


def test_a_reply_with_no_edits_is_refused():
    with pytest.raises(PatchError, match="no SEARCH/REPLACE"):
        apply_patches(CODE, "Sure! Just change the hole to 6.5mm.")


def test_a_fenced_full_script_is_not_mistaken_for_edits():
    with pytest.raises(PatchError):
        apply_patches(CODE, "```python\nresult = Box(1, 1, 1)\n```")


def test_an_edit_can_delete_lines():
    out = apply_patches(CODE, edit("    with Locations((30, 20)):\n        Hole(radius=hole_diameter / 2)", ""))
    assert "Hole(" not in out
    assert "Box(plate_length" in out


def test_edits_that_would_empty_the_script_are_refused():
    with pytest.raises(PatchError, match="delete the whole script"):
        apply_patches(CODE, edit(CODE.rstrip("\n"), ""))


def test_windows_line_endings_in_the_reply_still_match():
    reply = edit("hole_diameter = 5.0  # mm, mounting hole", "hole_diameter = 7.0  # mm, mounting hole").replace("\n", "\r\n")
    assert "hole_diameter = 7.0" in apply_patches(CODE, reply)


def test_parse_finds_each_block_in_order():
    reply = edit("a", "b") + "\nsome chatter\n" + edit("c", "d")
    assert parse_patches(reply) == [("a\n", "b\n"), ("c\n", "d\n")]
