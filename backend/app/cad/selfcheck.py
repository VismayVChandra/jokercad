"""Compares what was asked for against what was actually built.

Everything here is arithmetic on two dictionaries: the design intent the model
declared before writing code, and measurements taken off the finished solid by
`_jokercad_measure` in the executor. No model is consulted, so a check never
"decides" a part is fine — it either demonstrates a mismatch or admits it
couldn't test the claim.

That last part matters: a check that can't be made honestly is reported as
SKIPPED, never quietly as a pass. The confidence figure shown to the user is
the share of checks that actually ran.
"""

from dataclasses import dataclass, field

PASS = "pass"
FAIL = "fail"
SKIPPED = "skipped"

# An overall extent is allowed to differ by the larger of these, covering both
# a fillet trimming a corner and ordinary floating-point drift.
SIZE_TOLERANCE_MM = 0.5
SIZE_TOLERANCE_FRACTION = 0.01
# Diameters come straight off the cylinder, so they should be near-exact.
DIAMETER_TOLERANCE_MM = 0.05
# How far two holes may sit from perfect mirror images and still count as symmetric.
SYMMETRY_TOLERANCE_MM = 0.2

# Spec dimension names that should show up as an overall extent of the part.
# Anything else (a bore, a spacing, an inset) is a dimension the bounding box
# can't confirm, so it isn't guessed at.
_OVERALL_NAMES = frozenset(
    {
        "length",
        "width",
        "height",
        "thickness",
        "depth",
        "size",
        "overall_length",
        "overall_width",
        "overall_height",
        "outer_diameter",
        "od",
        "diameter",
    }
)

_HOLE_TYPES = frozenset({"hole", "holes", "hole_pattern", "bore", "through_hole", "counterbore", "clearance_hole"})


@dataclass
class Check:
    name: str
    status: str
    expected: str = ""
    actual: str = ""
    detail: str = ""

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "status": self.status,
            "expected": self.expected,
            "actual": self.actual,
            "detail": self.detail,
        }


@dataclass
class Report:
    checks: list[Check] = field(default_factory=list)

    @property
    def failures(self) -> list[Check]:
        return [c for c in self.checks if c.status == FAIL]

    @property
    def ran(self) -> list[Check]:
        return [c for c in self.checks if c.status != SKIPPED]

    @property
    def ok(self) -> bool:
        return not self.failures

    def as_dict(self) -> dict:
        return {
            "ok": self.ok,
            # Share of checks that could actually be made and passed. Checks that
            # were skipped are excluded rather than counted in our favour.
            "confidence": round(len([c for c in self.ran if c.status == PASS]) / len(self.ran), 3)
            if self.ran
            else None,
            "checked": len(self.ran),
            "skipped": len(self.checks) - len(self.ran),
            "checks": [c.as_dict() for c in self.checks],
        }

    def repair_hint(self) -> str:
        """A specific diagnostic for the repair loop, naming only what failed.

        The loop is told what to change and what to leave alone, so a wrong hole
        count doesn't come back as an unrelated redesign of the whole part.
        """
        if not self.failures:
            return ""
        listed = "\n".join(f"- {c.name}: expected {c.expected}, but the built part has {c.actual}" for c in self.failures)
        return (
            "The part built, but measuring the finished solid shows it doesn't match what was asked for:\n"
            f"{listed}\n\n"
            "Fix only these specific problems. Keep every other dimension, feature and the overall approach "
            "exactly as they are, and return the full corrected code."
        )


def _close(a: float, b: float, tolerance: float) -> bool:
    return abs(a - b) <= tolerance


def _size_tolerance(value: float) -> float:
    return max(SIZE_TOLERANCE_MM, abs(value) * SIZE_TOLERANCE_FRACTION)


def _number(value) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _holes(measured: dict) -> list[dict]:
    return [f for f in measured.get("holes") or [] if f.get("kind") == "hole"]


def _check_overall_sizes(spec: dict, stats: dict, report: Report) -> None:
    dimensions = spec.get("dimensions")
    size = stats.get("size")
    if not isinstance(dimensions, dict) or not size:
        report.checks.append(Check("Overall size", SKIPPED, detail="No overall dimensions were declared."))
        return

    extents = [float(v) for v in size]
    for name, raw in dimensions.items():
        value = _number(raw)
        if value is None or value <= 0:
            continue
        if name.lower() not in _OVERALL_NAMES:
            # A bore or a spacing is real, but the bounding box can't confirm it.
            report.checks.append(
                Check(f"Dimension '{name}'", SKIPPED, expected=f"{value:g} mm",
                      detail="Not an overall extent, so the bounding box can't confirm it.")
            )
            continue
        matched = any(_close(value, extent, _size_tolerance(value)) for extent in extents)
        shown = " x ".join(f"{e:g}" for e in extents)
        report.checks.append(
            Check(
                f"Dimension '{name}'",
                PASS if matched else FAIL,
                expected=f"{value:g} mm",
                actual=f"{shown} mm overall",
                detail="" if matched else "No overall extent of the built part matches this dimension.",
            )
        )


def _check_holes(spec: dict, measured: dict, report: Report) -> None:
    features = spec.get("features")
    if not isinstance(features, list):
        return

    drilled = _holes(measured)
    for feature in features:
        if not isinstance(feature, dict):
            continue
        kind = str(feature.get("type", "")).lower()
        if kind not in _HOLE_TYPES:
            continue

        diameter = _number(feature.get("diameter"))
        count = _number(feature.get("count"))
        label = f"Feature '{kind}'" + (f" Ø{diameter:g}" if diameter else "")

        if diameter is None:
            report.checks.append(Check(label, SKIPPED, detail="No diameter was declared, so nothing to match against."))
            continue

        matching = [h for h in drilled if _close(h["diameter"], diameter, DIAMETER_TOLERANCE_MM)]
        if not matching:
            others = sorted({round(h["diameter"], 2) for h in drilled})
            report.checks.append(
                Check(
                    label,
                    FAIL,
                    expected=f"{int(count) if count else 'some'} hole(s) of Ø{diameter:g} mm",
                    actual=f"no hole of that diameter (found: {others or 'no holes at all'})",
                    detail="The hole may be missing, the wrong size, or filled in by a later operation.",
                )
            )
            continue

        if count is None:
            report.checks.append(
                Check(label, PASS, expected=f"Ø{diameter:g} mm", actual=f"{len(matching)} hole(s) of Ø{diameter:g} mm")
            )
            continue

        report.checks.append(
            Check(
                label,
                PASS if len(matching) == int(count) else FAIL,
                expected=f"{int(count)} hole(s) of Ø{diameter:g} mm",
                actual=f"{len(matching)} hole(s) of Ø{diameter:g} mm",
                detail="" if len(matching) == int(count) else "The hole count doesn't match the pattern that was asked for.",
            )
        )


def _mirrors(holes: list[dict], axis_index: int) -> bool:
    """Whether every hole has a partner mirrored across the given axis."""
    remaining = list(holes)
    for hole in holes:
        target = list(hole["at"])
        target[axis_index] = -target[axis_index]
        partner = next(
            (
                other
                for other in remaining
                if _close(other["diameter"], hole["diameter"], DIAMETER_TOLERANCE_MM)
                and all(_close(a, b, SYMMETRY_TOLERANCE_MM) for a, b in zip(other["at"], target))
            ),
            None,
        )
        if partner is None:
            return False
    return True


def _check_symmetry(spec: dict, measured: dict, report: Report) -> None:
    constraints = spec.get("constraints")
    if not isinstance(constraints, list):
        return
    wants_symmetry = any(
        isinstance(c, dict) and "symmetric" in str(c.get("type", "")).lower() for c in constraints
    )
    if not wants_symmetry:
        return

    drilled = _holes(measured)
    if len(drilled) < 2:
        report.checks.append(
            Check("Symmetric hole pattern", SKIPPED, detail="Fewer than two holes were found to compare.")
        )
        return

    about_x = _mirrors(drilled, 0)
    about_y = _mirrors(drilled, 1)
    symmetric = about_x or about_y
    axes = ", ".join(a for a, ok in (("X", about_x), ("Y", about_y)) if ok)
    report.checks.append(
        Check(
            "Symmetric hole pattern",
            PASS if symmetric else FAIL,
            expected="holes mirrored about the part's centre",
            actual=f"symmetric about {axes}" if symmetric else "holes are not mirrored about either centre axis",
            detail="" if symmetric else "At least one hole has no counterpart on the opposite side.",
        )
    )


def _check_solid_health(measured: dict, report: Report) -> None:
    if "valid" not in measured:
        return
    valid = bool(measured.get("valid"))
    degenerate = int(measured.get("degenerate_faces") or 0)
    report.checks.append(
        Check(
            "Solid is valid",
            PASS if valid and not degenerate else FAIL,
            expected="a valid solid with no zero-area faces",
            actual=("valid" if valid else "invalid geometry")
            + (f", {degenerate} zero-area face(s)" if degenerate else ""),
        )
    )


def check_part(spec: dict | None, stats: dict | None) -> Report | None:
    """Diffs declared intent against the measured solid, or None if it can't.

    Returns None when there is no spec or no measurements, so callers can tell
    "nothing to check" apart from "checked and found nothing wrong".
    """
    if not isinstance(spec, dict) or not isinstance(stats, dict):
        return None
    measured = stats.get("measured")
    if not isinstance(measured, dict):
        return None

    report = Report()
    _check_solid_health(measured, report)
    _check_overall_sizes(spec, stats, report)
    _check_holes(spec, measured, report)
    _check_symmetry(spec, measured, report)
    return report if report.checks else None
