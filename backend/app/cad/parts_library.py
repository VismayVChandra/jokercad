# Generators for geometry that's easy to get subtly wrong. The CAD runner copies
# this file next to each generated script as `jokercad_parts` and star-imports it.
import math

__all__ = ["involute_gear_outline", "soften", "spur_gear"]

# Edges rounded one at a time, at most, when a part won't take one radius on
# every edge at once; each attempt costs a fillet operation.
_MAX_SINGLE_EDGES = 120


def _shrinking(radius, smallest):
    radii = []
    while radius >= smallest and len(radii) < 5:
        radii.append(radius)
        radius *= 0.6
    return radii


def _try_fillet(part, edges, radius):
    """The part with the edges rounded, or None if the kernel can't do it."""
    from build123d import Compound, Part

    try:
        rounded = part.fillet(radius, list(edges))
        if rounded.is_valid and rounded.volume > 0:
            return Part(Compound([rounded]).wrapped)
    except Exception:
        pass
    return None


def soften(part, radius, min_radius=0.2):
    """Rounds every edge of a finished part (or of each part of an assembly) for a
    smooth, organic look. Tries `radius` on all edges, then smaller radii; if the
    part still won't take it, rounds the edges one at a time, longest first, each
    with the largest radius that fits, and leaves the rest sharp. Never raises:
    at worst the part comes back unchanged."""
    from build123d import Compound

    if radius <= 0:
        return part
    children = list(getattr(part, "children", None) or [])
    if children:
        softened = []
        for child in children:
            new = soften(child, radius, min_radius)
            new.label = child.label
            softened.append(new)
        return Compound(label=part.label, children=softened)

    try:
        radii = _shrinking(radius, min_radius)
        for r in radii:
            rounded = _try_fillet(part, part.edges(), r)
            if rounded is not None:
                return rounded

        current = part
        for edge in sorted(part.edges(), key=lambda e: -e.length)[:_MAX_SINGLE_EDGES]:
            # Earlier fillets trim the edges next to them, so find this edge
            # again in the part as it is now by its centre, allowing for that.
            target = edge.center()
            match = min(current.edges(), key=lambda e: (e.center() - target).length)
            if (match.center() - target).length > 0.6 * radius + 1e-3:
                continue
            for r in radii[:3]:
                rounded = _try_fillet(current, [match], r)
                if rounded is not None:
                    current = rounded
                    break
        return current
    except Exception:
        return part


def _polar(radius: float, angle: float) -> tuple[float, float]:
    return (radius * math.cos(angle), radius * math.sin(angle))


def involute_gear_outline(module, teeth, pressure_angle=20.0, points_per_flank=10):
    """Closed (x, y) outline of a standard involute spur gear, centred on the origin."""
    teeth = int(round(teeth))
    if module <= 0:
        raise ValueError("module must be positive")
    if teeth < 6:
        raise ValueError("a spur gear needs at least 6 teeth")
    if not 10 <= pressure_angle <= 35:
        raise ValueError("pressure_angle must be between 10 and 35 degrees")

    alpha = math.radians(pressure_angle)
    r_pitch = module * teeth / 2
    r_base = r_pitch * math.cos(alpha)
    r_tip = r_pitch + module  # standard addendum: 1 module
    r_root = r_pitch - 1.25 * module  # standard dedendum: 1.25 modules

    # Angle from a tooth's centre line to its flank at the base circle: half the
    # pitch-circle tooth thickness (pi*m/2) plus the involute function inv(alpha).
    half_base = math.pi / (2 * teeth) + math.tan(alpha) - alpha

    t_tip = math.sqrt((r_tip / r_base) ** 2 - 1)
    t_start = math.sqrt((r_root / r_base) ** 2 - 1) if r_root > r_base else 0.0

    # One flank as (radius, angle from the centre line), root to tip. An involute
    # point at roll parameter t sits at radius r_base*sqrt(1+t^2), turned by
    # t - atan(t). Below the base circle there's no involute, so the flank drops
    # radially to the root.
    flank = [(r_root, half_base)] if r_root < r_base else []
    for i in range(points_per_flank + 1):
        t = t_start + (t_tip - t_start) * i / points_per_flank
        flank.append((r_base * math.hypot(1, t), half_base - (t - math.atan(t))))

    if flank[-1][1] <= 0:
        raise ValueError("the teeth come to a point; use more teeth or a smaller pressure angle")
    pitch_angle = 2 * math.pi / teeth
    root_half = flank[0][1]
    if pitch_angle <= 2 * root_half:
        raise ValueError("the teeth overlap at the root")

    points = []
    for k in range(teeth):
        centre = k * pitch_angle
        points += [_polar(r, centre - a) for r, a in flank]
        points += [_polar(r, centre + a) for r, a in reversed(flank)]
        start, end = centre + root_half, centre + pitch_angle - root_half
        points += [_polar(r_root, start + (end - start) * j / 4) for j in range(1, 4)]
    return points


def spur_gear(module, teeth, face_width, pressure_angle=20.0, bore_diameter=0.0):
    """Involute spur gear as a Part: centred on the origin, axis along Z, optional centre bore."""
    # Imported here so the outline maths above can be tested without the CAD engine.
    from build123d import BuildPart, BuildSketch, Cylinder, Mode, Polygon, extrude

    if face_width <= 0:
        raise ValueError("face_width must be positive")
    outline = involute_gear_outline(module, teeth, pressure_angle)
    root_diameter = module * int(round(teeth)) - 2.5 * module
    if not 0 <= bore_diameter < root_diameter:
        raise ValueError(f"bore_diameter must be at least 0 and below the root diameter ({root_diameter:.1f} mm)")

    with BuildPart() as gear:
        with BuildSketch():
            Polygon(*outline, align=None)
        extrude(amount=face_width / 2, both=True)
        if bore_diameter > 0:
            Cylinder(radius=bore_diameter / 2, height=face_width, mode=Mode.SUBTRACT)
    return gear.part
