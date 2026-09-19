"""The geometric self-check: does it actually catch a part that doesn't match?

The measurements below are the real ones this pipeline produced for a
100 x 60 x 8 mm plate with four Ø6 holes, so a passing case here is a
measurement the CAD engine genuinely returned rather than one invented to
make the check look good.
"""

from app.cad.selfcheck import FAIL, PASS, SKIPPED, check_part

PLATE_SPEC = {
    "part": "mounting_plate",
    "units": "mm",
    "dimensions": {"length": 100, "width": 60, "thickness": 8},
    "features": [{"type": "hole_pattern", "diameter": 6, "count": 4}],
    "constraints": [{"type": "symmetric", "feature": "hole_pattern"}],
}


def plate_stats(holes=4, hole_diameter=6.0, size=(100.0, 60.0, 8.0), valid=True, positions=None):
    """Measurements shaped exactly like `_jokercad_measure` returns them."""
    if positions is None:
        positions = [[-38.0, -18.0, 0.0], [-38.0, 18.0, 0.0], [38.0, -18.0, 0.0], [38.0, 18.0, 0.0]]
    return {
        "size": list(size),
        "volume": 47095.2,
        "solids": 1,
        "measured": {
            "area": 15068.9,
            "faces": 10,
            "edges": 24,
            "vertices": 16,
            "shells": 1,
            "valid": valid,
            "degenerate_faces": 0,
            "holes": [
                {
                    "diameter": hole_diameter,
                    "kind": "hole",
                    "axis": [0.0, 0.0, 1.0],
                    "at": positions[i % len(positions)],
                    "height": 8.0,
                }
                for i in range(holes)
            ],
        },
    }


def status_of(report, name_fragment):
    return next(c["status"] for c in report.as_dict()["checks"] if name_fragment in c["name"])


def test_matching_part_passes_every_check():
    report = check_part(PLATE_SPEC, plate_stats())
    assert report.ok
    assert report.as_dict()["confidence"] == 1.0
    assert report.repair_hint() == ""


def test_missing_hole_is_caught():
    """The headline case from the brief: requested 4, built 3."""
    report = check_part(PLATE_SPEC, plate_stats(holes=3))
    assert not report.ok
    assert status_of(report, "hole_pattern") == FAIL
    failure = report.failures[0]
    assert "4 hole" in failure.expected
    assert "3 hole" in failure.actual


def test_wrong_hole_diameter_is_caught():
    report = check_part(PLATE_SPEC, plate_stats(hole_diameter=8.0))
    assert not report.ok
    assert "no hole of that diameter" in report.failures[0].actual


def test_wrong_overall_dimension_is_caught():
    report = check_part(PLATE_SPEC, plate_stats(size=(100.0, 45.0, 8.0)))
    assert not report.ok
    assert any("width" in c.name for c in report.failures)


def test_asymmetric_holes_are_caught():
    off_centre = [[-38.0, -18.0, 0.0], [-38.0, 18.0, 0.0], [30.0, -18.0, 0.0], [38.0, 18.0, 0.0]]
    report = check_part(PLATE_SPEC, plate_stats(positions=off_centre))
    assert not report.ok
    assert status_of(report, "Symmetric") == FAIL


def test_invalid_solid_is_caught():
    report = check_part(PLATE_SPEC, plate_stats(valid=False))
    assert not report.ok
    assert status_of(report, "valid") == FAIL


def test_tolerance_allows_small_drift_but_not_real_error():
    assert check_part(PLATE_SPEC, plate_stats(size=(100.3, 60.0, 8.0))).ok
    assert not check_part(PLATE_SPEC, plate_stats(size=(104.0, 60.0, 8.0))).ok


def test_non_overall_dimensions_are_skipped_not_guessed():
    """A bore diameter isn't an extent, so the bounding box can't judge it."""
    spec = {"dimensions": {"length": 100, "bore_diameter": 22}, "features": []}
    report = check_part(spec, plate_stats())
    assert status_of(report, "bore_diameter") == SKIPPED
    assert status_of(report, "length") == PASS


def test_confidence_excludes_skipped_checks():
    spec = {"dimensions": {"length": 100, "bore_diameter": 22}, "features": []}
    data = report_dict = check_part(spec, plate_stats()).as_dict()
    assert data["skipped"] >= 1
    # 2 checks ran (validity + length), both passed; the skipped one isn't counted as a win.
    assert report_dict["confidence"] == 1.0
    assert report_dict["checked"] == 2


def test_repair_hint_names_only_what_failed():
    report = check_part(PLATE_SPEC, plate_stats(holes=2))
    hint = report.repair_hint()
    assert "hole" in hint
    assert "Keep every other dimension" in hint
    # It must not invite a full redesign.
    assert "start over" not in hint.lower()


def test_unverifiable_feature_is_declared_not_ignored():
    """A fillet can't be measured here, so it must show as skipped, not vanish."""
    spec = {"features": [{"type": "fillet", "radius": 5}, {"type": "hole_pattern", "diameter": 6, "count": 4}]}
    report = check_part(spec, plate_stats())
    assert status_of(report, "fillet") == SKIPPED
    assert report.ok  # skipped is not a failure
    # and it isn't counted as a win either
    assert report.as_dict()["skipped"] >= 1


def test_no_spec_or_no_measurements_returns_none():
    """Older saved parts have no spec; the check must stand down, not fail them."""
    assert check_part(None, plate_stats()) is None
    assert check_part(PLATE_SPEC, None) is None
    assert check_part(PLATE_SPEC, {"size": [1, 2, 3]}) is None


def test_hole_count_without_declared_count_still_reports():
    spec = {"features": [{"type": "hole", "diameter": 6}]}
    report = check_part(spec, plate_stats())
    assert report.ok
    assert "4 hole(s)" in next(c.actual for c in report.checks if "hole" in c.name)
