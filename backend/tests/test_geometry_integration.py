"""End-to-end: build real solids and check them with the real measurements.

These run the CAD engine, so they are slow (~10s each, plus a one-off minute or
two on Windows while antivirus scans the OpenCascade DLLs). Skip them with
`-m "not cad"`; the rest of the suite is pure logic and runs instantly.
"""

import pytest

from app.cad.executor import run_build123d_code
from app.cad.selfcheck import check_part

pytestmark = pytest.mark.cad


def plate(holes: int, hole_diameter: float = 6.0, length: float = 100.0) -> str:
    """A plate with `holes` of the four corner holes actually drilled."""
    corners = [
        "(length/2-inset, width/2-inset)",
        "(-(length/2-inset), width/2-inset)",
        "(length/2-inset, -(width/2-inset))",
        "(-(length/2-inset), -(width/2-inset))",
    ][:holes]
    locations = ", ".join(corners)
    drilling = (
        f"    with Locations({locations}):\n"
        f"        Cylinder(hole_diameter/2, thickness, mode=Mode.SUBTRACT)\n"
        if holes
        else ""
    )
    return (
        f"length = {length}  # mm\n"
        "width = 60.0  # mm\n"
        "thickness = 8.0  # mm\n"
        f"hole_diameter = {hole_diameter}  # mm\n"
        "inset = 12.0  # mm\n"
        "\n"
        "with BuildPart() as bp:\n"
        "    Box(length, width, thickness)\n"
        f"{drilling}"
        "result = bp.part\n"
    )


SPEC = {
    "part": "mounting_plate",
    "units": "mm",
    "dimensions": {"length": 100, "width": 60, "thickness": 8},
    "features": [{"type": "hole_pattern", "diameter": 6, "count": 4}],
    "constraints": [{"type": "symmetric", "feature": "hole_pattern"}],
}


def build(code: str):
    result = run_build123d_code(code)
    assert result.ok, result.error
    return result


def test_measurements_come_from_the_real_solid():
    stats = build(plate(4)).stats
    measured = stats["measured"]
    assert [round(v, 1) for v in stats["size"]] == [100.0, 60.0, 8.0]
    # 100*60*8 minus four Ø6 bores through 8 mm.
    assert stats["volume"] == pytest.approx(47095.2, abs=1.0)
    assert measured["valid"] is True
    assert measured["degenerate_faces"] == 0
    assert measured["area"] > 0


def test_real_holes_are_counted_and_sized():
    measured = build(plate(4)).stats["measured"]
    holes = [f for f in measured["holes"] if f["kind"] == "hole"]
    assert len(holes) == 4
    assert all(h["diameter"] == pytest.approx(6.0, abs=0.01) for h in holes)
    # Through a plate 8 mm thick.
    assert all(h["height"] == pytest.approx(8.0, abs=0.01) for h in holes)
    # Symmetric about both centre axes.
    assert sorted(round(h["at"][0], 1) for h in holes) == [-38.0, -38.0, 38.0, 38.0]


def test_a_boss_is_not_counted_as_a_hole():
    code = (
        "with BuildPart() as bp:\n"
        "    Box(80, 50, 10)\n"
        "    with Locations((-25, 0, 0)):\n"
        "        Cylinder(3, 10, mode=Mode.SUBTRACT)\n"
        "    with Locations((25, 0, 5)):\n"
        "        Cylinder(7, 6, mode=Mode.ADD)\n"
        "result = bp.part\n"
    )
    features = build(code).stats["measured"]["holes"]
    kinds = sorted((f["kind"], round(f["diameter"], 1)) for f in features)
    assert kinds == [("boss", 14.0), ("hole", 6.0)]


def test_matching_part_passes_the_real_check():
    report = check_part(SPEC, build(plate(4)).stats)
    assert report.ok, [c.as_dict() for c in report.failures]
    assert report.as_dict()["confidence"] == 1.0


def test_missing_hole_is_caught_on_real_geometry():
    """Requested 4 holes, built 3 — the case the brief names."""
    report = check_part(SPEC, build(plate(3)).stats)
    assert not report.ok
    failure = next(c for c in report.failures if "hole" in c.name)
    assert "4 hole" in failure.expected and "3 hole" in failure.actual
    assert "Fix only these specific problems" in report.repair_hint()


def test_wrong_hole_size_is_caught_on_real_geometry():
    report = check_part(SPEC, build(plate(4, hole_diameter=8.0)).stats)
    assert not report.ok
    assert any("no hole of that diameter" in c.actual for c in report.failures)


def test_wrong_overall_length_is_caught_on_real_geometry():
    report = check_part(SPEC, build(plate(4, length=120.0)).stats)
    assert not report.ok
    assert any("length" in c.name for c in report.failures)


def test_unsafe_code_never_reaches_the_engine():
    result = run_build123d_code("import pathlib\nresult = Box(1, 1, 1)")
    assert not result.ok
    assert "not allowed" in result.error


# --- what a broken solid is told about itself -----------------------------

# A sweep whose profile is wider than the arc it follows: the shape passes
# through itself. This is the shape of the failures people hit with pasted
# code, where the script is far too long to find the bad part by reading it.
SELF_INTERSECTING_SWEEP = """from build123d import *
with BuildPart() as p:
    with BuildLine() as path:
        RadiusArc((0, 0, 0), (14, 14, 0), 10.0)
    with BuildSketch(Plane.YZ):
        Rectangle(30, 6)
    sweep(path=path.line)
result = p.part
"""


def test_a_self_intersecting_solid_is_not_reported_as_empty():
    result = run_build123d_code(SELF_INTERSECTING_SWEEP)
    assert not result.ok
    # It has a large negative volume, which used to trip the "~zero volume,
    # the solid is empty" branch and send the fix in entirely the wrong
    # direction.
    assert "negative volume" in result.error
    assert "empty" not in result.error
    assert "passes through itself" in result.error


def test_a_malformed_solid_says_which_faces_and_where():
    # Fusing the bad sweep into a big box keeps the malformed faces but makes
    # the volume positive, so this reaches the validity check rather than the
    # volume one.
    result = run_build123d_code(SELF_INTERSECTING_SWEEP.replace("result = p.part", "result = p.part + Box(60, 60, 20)"))
    assert not result.ok
    assert "not a valid/manifold solid" in result.error
    assert "faces are malformed" in result.error
    # The coordinates are the point of it: the part is too long to find by eye.
    assert "around (" in result.error


def test_a_good_solid_still_builds():
    # The new checks sit in front of every build, so the happy path is pinned.
    result = run_build123d_code(plate(4))
    assert result.ok, result.error
