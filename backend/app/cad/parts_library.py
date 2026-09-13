# Generators for geometry that's easy to get subtly wrong. The CAD runner copies
# this file next to each generated script as `jokercad_parts` and star-imports it.
import math

__all__ = [
    "ball_bearing",
    "bearing_size",
    "clearance_hole",
    "compression_spring",
    "counterbore",
    "fastener",
    "fit_clearance",
    "hex_bolt",
    "hex_nut",
    "insert_hole",
    "involute_gear_outline",
    "nut_trap",
    "socket_head_bolt",
    "soften",
    "spur_gear",
    "tap_hole",
    "thread_pitch",
    "washer",
]

# ---------- standard parts ----------
# Metric coarse threads, with sizes from the ISO standards named.

_METRIC = {  # size: (diameter, pitch)
    "M2": (2.0, 0.4), "M2.5": (2.5, 0.45), "M3": (3.0, 0.5), "M4": (4.0, 0.7), "M5": (5.0, 0.8),
    "M6": (6.0, 1.0), "M8": (8.0, 1.25), "M10": (10.0, 1.5), "M12": (12.0, 1.75), "M16": (16.0, 2.0),
    "M20": (20.0, 2.5),
}
_CLEARANCE = {  # ISO 273 clearance holes: fine, medium, coarse
    "M2": (2.2, 2.4, 2.6), "M2.5": (2.7, 2.9, 3.1), "M3": (3.2, 3.4, 3.6), "M4": (4.3, 4.5, 4.8),
    "M5": (5.3, 5.5, 5.8), "M6": (6.4, 6.6, 7.0), "M8": (8.4, 9.0, 10.0), "M10": (10.5, 11.0, 12.0),
    "M12": (13.0, 13.5, 14.5), "M16": (17.0, 17.5, 18.5), "M20": (21.0, 22.0, 24.0),
}
_SOCKET_HEAD = {  # ISO 4762 socket head cap screw: head diameter, head height, hex key
    "M2": (3.8, 2.0, 1.5), "M2.5": (4.5, 2.5, 2.0), "M3": (5.5, 3.0, 2.5), "M4": (7.0, 4.0, 3.0),
    "M5": (8.5, 5.0, 4.0), "M6": (10.0, 6.0, 5.0), "M8": (13.0, 8.0, 6.0), "M10": (16.0, 10.0, 8.0),
    "M12": (18.0, 12.0, 10.0), "M16": (24.0, 16.0, 14.0), "M20": (30.0, 20.0, 17.0),
}
_HEX_HEAD = {  # ISO 4017 hex head screw: across flats, head height
    "M2": (4.0, 1.4), "M2.5": (5.0, 1.7), "M3": (5.5, 2.0), "M4": (7.0, 2.8), "M5": (8.0, 3.5),
    "M6": (10.0, 4.0), "M8": (13.0, 5.3), "M10": (16.0, 6.4), "M12": (18.0, 7.5), "M16": (24.0, 10.0),
    "M20": (30.0, 12.5),
}
_HEX_NUT = {  # ISO 4032 hex nut: across flats, height
    "M2": (4.0, 1.6), "M2.5": (5.0, 2.0), "M3": (5.5, 2.4), "M4": (7.0, 3.2), "M5": (8.0, 4.7),
    "M6": (10.0, 5.2), "M8": (13.0, 6.8), "M10": (16.0, 8.4), "M12": (18.0, 10.8), "M16": (24.0, 14.8),
    "M20": (30.0, 18.0),
}
_WASHER = {  # ISO 7089 plain washer: inner diameter, outer diameter, thickness
    "M2": (2.2, 5.0, 0.3), "M2.5": (2.7, 6.0, 0.5), "M3": (3.2, 7.0, 0.5), "M4": (4.3, 9.0, 0.8),
    "M5": (5.3, 10.0, 1.0), "M6": (6.4, 12.0, 1.6), "M8": (8.4, 16.0, 1.6), "M10": (10.5, 20.0, 2.0),
    "M12": (13.0, 24.0, 2.5), "M16": (17.0, 30.0, 3.0), "M20": (21.0, 37.0, 3.0),
}
_COUNTERBORE = {  # DIN 974-1 counterbore for a socket head: diameter, depth
    "M2": (4.3, 2.4), "M2.5": (5.0, 2.9), "M3": (6.5, 3.4), "M4": (8.0, 4.4), "M5": (10.0, 5.4),
    "M6": (11.0, 6.4), "M8": (15.0, 8.6), "M10": (18.0, 10.6), "M12": (20.0, 12.6), "M16": (26.0, 16.6),
    "M20": (33.0, 20.6),
}
_INSERT = {  # heat-set brass inserts for plastic (typical): hole diameter, depth
    "M2": (3.2, 4.0), "M2.5": (3.6, 5.0), "M3": (4.0, 5.7), "M4": (5.6, 8.1), "M5": (6.4, 9.5),
    "M6": (8.0, 12.7),
}
_BEARINGS = {  # deep-groove ball bearings: bore, outer diameter, width
    "623": (3, 10, 4), "624": (4, 13, 5), "625": (5, 16, 5), "626": (6, 19, 6), "627": (7, 22, 7),
    "608": (8, 22, 7), "688": (8, 16, 5), "6800": (10, 19, 5), "6801": (12, 21, 5),
    "6000": (10, 26, 8), "6001": (12, 28, 8), "6002": (15, 32, 9), "6003": (17, 35, 10),
    "6200": (10, 30, 9), "6201": (12, 32, 10), "6202": (15, 35, 11), "6203": (17, 40, 12),
    "6204": (20, 47, 14),
}
# Diametral clearance (mm) between a hole and what goes in it. FDM prints come
# out a little tight, hence the larger values; machined ones are roughly the
# ISO H7/p6 (press), H7/g6 (sliding) and H11/c11 (loose) fits around 10 mm.
_FITS = {
    "print": {"press": 0.1, "sliding": 0.3, "loose": 0.6},
    "machined": {"press": -0.02, "sliding": 0.03, "loose": 0.15},
}


def _size(size):
    key = str(size).strip().upper().replace(" ", "").split("X")[0]
    if not key.startswith("M"):
        key = "M" + key
    if key.endswith(".0"):
        key = key[:-2]
    if key not in _METRIC:
        raise ValueError(f"Unknown metric size {size!r}; use one of {', '.join(_METRIC)}")
    return key


def _bearing(code):
    key = str(code).strip().upper().replace("-", "").replace("2RS", "").replace("ZZ", "").replace("RS", "")
    if key not in _BEARINGS:
        raise ValueError(f"Unknown bearing {code!r}; use one of {', '.join(_BEARINGS)}")
    return key


def fit_clearance(kind="sliding", process="print"):
    """How much wider (mm, on the diameter) a hole should be than the pin, shaft
    or bearing in it: kind "press", "sliding" or "loose"; process "print" or
    "machined". Negative means an interference (press) fit."""
    try:
        return _FITS[process][kind]
    except KeyError:
        raise ValueError('fit_clearance(kind, process): kind is "press", "sliding" or "loose"; process is "print" or "machined"')


def thread_pitch(size):
    return _METRIC[_size(size)][1]


def clearance_hole(size, fit="medium"):
    """Diameter of a hole a bolt passes through freely (ISO 273: fine, medium, coarse)."""
    columns = {"fine": 0, "medium": 1, "coarse": 2}
    if fit not in columns:
        raise ValueError('clearance_hole(size, fit): fit is "fine", "medium" or "coarse"')
    return _CLEARANCE[_size(size)][columns[fit]]


def tap_hole(size):
    """Diameter of a hole to cut a thread in, or to self-tap a screw into."""
    diameter, pitch = _METRIC[_size(size)]
    return round(diameter - pitch, 2)


def counterbore(size):
    """(diameter, depth) of a counterbore that sinks a socket head flush."""
    return _COUNTERBORE[_size(size)]


def insert_hole(size):
    """(diameter, depth) of the hole for a heat-set threaded insert."""
    key = _size(size)
    if key not in _INSERT:
        raise ValueError(f"No heat-set insert size for {key}; use one of {', '.join(_INSERT)}")
    return _INSERT[key]


def nut_trap(size, clearance=0.2):
    """(across_flats, depth) of a hexagonal pocket that holds a nut; cut it with
    RegularPolygon(across_flats / 2, 6, major_radius=False)."""
    across, height = _HEX_NUT[_size(size)]
    return (across + clearance, height + clearance)


def bearing_size(code):
    """(bore, outer_diameter, width) of a ball bearing such as "608" or "6201"."""
    return _BEARINGS[_bearing(code)]


def fastener(size):
    """Every standard size for a metric bolt size, as a dict (mm)."""
    key = _size(size)
    diameter, pitch = _METRIC[key]
    head_d, head_h, key_size = _SOCKET_HEAD[key]
    washer_in, washer_out, washer_t = _WASHER[key]
    info = {
        "diameter": diameter,
        "pitch": pitch,
        "clearance_hole": _CLEARANCE[key][1],
        "tap_hole": round(diameter - pitch, 2),
        "socket_head_diameter": head_d,
        "socket_head_height": head_h,
        "hex_key": key_size,
        "hex_head_across_flats": _HEX_HEAD[key][0],
        "hex_head_height": _HEX_HEAD[key][1],
        "nut_across_flats": _HEX_NUT[key][0],
        "nut_height": _HEX_NUT[key][1],
        "washer_inner": washer_in,
        "washer_outer": washer_out,
        "washer_thickness": washer_t,
        "counterbore_diameter": _COUNTERBORE[key][0],
        "counterbore_depth": _COUNTERBORE[key][1],
    }
    if key in _INSERT:
        info["insert_hole"], info["insert_depth"] = _INSERT[key]
    return info


def _labelled(part, label):
    part.label = label
    return part


def socket_head_bolt(size, length):
    """An ISO 4762 socket head cap screw: head on z = 0 upwards, shank down to
    z = -length. The thread is shown as a plain shank, as drawings do."""
    from build123d import Align, BuildPart, BuildSketch, Cylinder, Mode, Plane, RegularPolygon, extrude

    key = _size(size)
    diameter, _ = _METRIC[key]
    head_d, head_h, key_size = _SOCKET_HEAD[key]
    with BuildPart() as bolt:
        Cylinder(head_d / 2, head_h, align=(Align.CENTER, Align.CENTER, Align.MIN))
        Cylinder(diameter / 2, length, align=(Align.CENTER, Align.CENTER, Align.MAX))
        with BuildSketch(Plane.XY.offset(head_h)):
            RegularPolygon(key_size / 2, 6, major_radius=False)
        extrude(amount=-0.55 * head_h, mode=Mode.SUBTRACT)
    return _labelled(bolt.part, f"{key}x{length:g} socket head screw")


def hex_bolt(size, length):
    """An ISO 4017 hex head screw: head on z = 0 upwards, shank down to z = -length."""
    from build123d import Align, BuildPart, BuildSketch, Cylinder, RegularPolygon, extrude

    key = _size(size)
    diameter, _ = _METRIC[key]
    across, head_h = _HEX_HEAD[key]
    with BuildPart() as bolt:
        with BuildSketch():
            RegularPolygon(across / 2, 6, major_radius=False)
        extrude(amount=head_h)
        Cylinder(diameter / 2, length, align=(Align.CENTER, Align.CENTER, Align.MAX))
    return _labelled(bolt.part, f"{key}x{length:g} hex bolt")


def hex_nut(size):
    """An ISO 4032 hex nut lying on z = 0 (thread shown as a plain hole)."""
    from build123d import BuildPart, BuildSketch, Cylinder, Mode, RegularPolygon, extrude

    key = _size(size)
    diameter, _ = _METRIC[key]
    across, height = _HEX_NUT[key]
    with BuildPart() as nut:
        with BuildSketch():
            RegularPolygon(across / 2, 6, major_radius=False)
        extrude(amount=height)
        Cylinder(diameter / 2, 4 * height, mode=Mode.SUBTRACT)
    return _labelled(nut.part, f"{key} nut")


def washer(size):
    """An ISO 7089 plain washer lying on z = 0."""
    from build123d import Align, BuildPart, Cylinder, Mode

    key = _size(size)
    inner, outer, thickness = _WASHER[key]
    with BuildPart() as ring:
        Cylinder(outer / 2, thickness, align=(Align.CENTER, Align.CENTER, Align.MIN))
        Cylinder(inner / 2, 4 * thickness, mode=Mode.SUBTRACT)
    return _labelled(ring.part, f"{key} washer")


def ball_bearing(code):
    """A deep-groove ball bearing lying on z = 0: outer and inner rings with the
    gap between them where the balls run."""
    from build123d import Align, BuildPart, Cylinder, Mode

    key = _bearing(code)
    bore, outer, width = _BEARINGS[key]
    ring = (outer - bore) / 2 * 0.3
    with BuildPart() as bearing:
        Cylinder(outer / 2, width, align=(Align.CENTER, Align.CENTER, Align.MIN))
        Cylinder(outer / 2 - ring, 4 * width, mode=Mode.SUBTRACT)
        Cylinder(bore / 2 + ring, width, align=(Align.CENTER, Align.CENTER, Align.MIN))
        Cylinder(bore / 2, 4 * width, mode=Mode.SUBTRACT)
    return _labelled(bearing.part, f"{key} bearing")


def compression_spring(outer_diameter, wire_diameter, free_length, coils):
    """A coil spring standing on z = 0, its axis along Z."""
    from build123d import BuildPart, BuildSketch, Circle, Edge, Plane, Pos, sweep

    if wire_diameter <= 0 or coils <= 0 or outer_diameter <= 2 * wire_diameter:
        raise ValueError("compression_spring needs coils > 0 and outer_diameter > 2 x wire_diameter")
    pitch = free_length / coils
    if pitch <= wire_diameter:
        raise ValueError("compression_spring: the coils would touch; use fewer coils or a longer spring")
    path = Edge.make_helix(pitch, free_length - wire_diameter, (outer_diameter - wire_diameter) / 2)
    with BuildPart() as spring:
        with BuildSketch(Plane(origin=path @ 0, z_dir=path % 0)):
            Circle(wire_diameter / 2)
        sweep(path=path, is_frenet=True)
    return _labelled(Pos(0, 0, wire_diameter / 2) * spring.part, "spring")

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
