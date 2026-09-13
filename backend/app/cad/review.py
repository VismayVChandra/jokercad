REVIEW_PROMPT = """You check a 3D CAD part against what the user asked for. You get their \
requests, the build123d code that made the part, and measurements of the built solid \
(units are mm; the Z axis points up).

Decide whether the part plausibly matches the requests. Flag only clear, specific problems:
- a requested feature that's missing (a hole, slot, lip, flange, teeth, groove, support);
- an overall size that can't be right for the request (e.g. a stand meant to hold a phone
  upright that is only 15 mm tall);
- a feature in an impossible place (a hole breaking into a bore, a cut that stops short of
  going through, pieces floating apart from the part);
- in a mechanism or assembly: parts that should move fused into one solid, a part that
  doesn't reach the pivot, pin or part it should sit on, pivot holes in mating parts that
  don't line up, or parts overlapping each other (moving parts need a small gap).
Ignore style, naming, and reasonable choices the user left open. Separate parts in an
assembly are intended, joined by pins through aligned holes. A size the user gave for one
feature (say, a body's diameter) doesn't limit other features they asked for: a flange is meant
to be wider than the body, with its mounting holes outside the body, and a base can be wider
than what stands on it. Never ask to remove or shrink a feature the request mentions. If
unsure, say OK.

Reply with exactly one line: either `OK`, or `PROBLEM: ` followed by what is wrong and how
to fix it, in at most two sentences."""


VISUAL_REVIEW_PROMPT = """You check a 3D CAD part against what the user asked for. You get \
their requests, a picture of the built part, measurements of it (units are mm; Z points up) \
and the build123d code that made it.

The picture shows the part from four directions at one scale: ISO (seen from the front-right,
above), FRONT (looking toward +Y: X to the right, Z up), TOP (looking down: X to the right,
Y up) and RIGHT (looking toward -X: Y to the right, Z up). An assembly's separate parts have
different colours.

When the user gave a reference photo or sketch, it comes first and the picture of the
built part second; the part should then match the reference's shape and features too.

Look at the picture first. Flag only clear, specific mismatches with the requests:
- a requested feature that's missing or clearly the wrong shape (a hole, slot, lip, flange,
  teeth, groove, arm, finger, support);
- a feature in the wrong place (a hole off-centre that should be centred, an arm that doesn't
  meet the pivot it should turn on, parts floating apart, a stand lying flat instead of
  holding something up);
- proportions that can't be right for the request.
Ignore colours, style, small details and reasonable choices the user left open. A flange is
meant to be wider than the body it's on, and an assembly's parts are separate on purpose,
joined by pins through aligned holes. Never ask to remove or shrink something the request
mentions. If unsure, say OK.

Reply with exactly one line: either `OK`, or `PROBLEM: ` followed by what is wrong in the
picture and how to fix it in the code, in at most two sentences."""


def build_review_request(requests: list[str], code: str, stats: dict, notes: list[str] | None = None) -> str:
    """notes are things the server already verified, so the reviewer doesn't second-guess them."""
    sx, sy, sz = stats["size"]
    lo, hi = stats["min"], stats["max"]
    listed = "\n".join(f"{i}. {request}" for i, request in enumerate(requests, 1))
    checked = "".join(f"\n- {note}" for note in notes or [])
    measurements = (
        f"Built part: {sx:.1f} x {sy:.1f} x {sz:.1f} mm "
        f"(x {lo[0]:.1f} to {hi[0]:.1f}, y {lo[1]:.1f} to {hi[1]:.1f}, z {lo[2]:.1f} to {hi[2]:.1f}), "
        f"volume {stats['volume'] / 1000:.2f} cm3, {stats['solids']} separate solid(s)."
    )
    parts = stats.get("parts") or []
    if parts:
        listing = "\n".join(
            f"- {p['name']}: x {p['min'][0]:.1f} to {p['max'][0]:.1f}, y {p['min'][1]:.1f} to {p['max'][1]:.1f}, "
            f"z {p['min'][2]:.1f} to {p['max'][2]:.1f}, volume {p['volume'] / 1000:.2f} cm3"
            for p in parts
        )
        clashes = "; ".join(f"{a} and {b} share {v:.0f} mm3" for a, b, v in stats.get("overlaps") or []) or "none"
        measurements += f"\nParts:\n{listing}\nOverlapping parts: {clashes}."
    already = f"\n\nAlready checked, and correct as built:{checked}" if checked else ""
    return f"Requests, oldest first:\n{listed}\n\n{measurements}{already}\n\nCode:\n```python\n{code}\n```"


def parse_verdict(reply: str) -> str | None:
    """The problem the reviewer described, or None if it said the part looks right."""
    for line in reply.splitlines():
        line = line.strip().strip("`")
        if line.upper().startswith("PROBLEM"):
            problem = line.split(":", 1)[1].strip() if ":" in line else ""
            return problem[:400] or None
    return None
