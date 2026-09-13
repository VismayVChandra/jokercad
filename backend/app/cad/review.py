REVIEW_PROMPT = """You check a 3D CAD part against what the user asked for. You get their \
requests, the build123d code that made the part, and measurements of the built solid \
(units are mm; the Z axis points up).

Decide whether the part plausibly matches the requests. Flag only clear, specific problems:
- a requested feature that's missing (a hole, slot, lip, flange, teeth, groove, support);
- an overall size that can't be right for the request (e.g. a stand meant to hold a phone
  upright that is only 15 mm tall);
- a feature in an impossible place (a hole breaking into a bore, a cut that stops short of
  going through, pieces floating apart from the part).
Ignore style, naming, and reasonable choices the user left open. A size the user gave for one
feature (say, a body's diameter) doesn't limit other features they asked for: a flange is meant
to be wider than the body, with its mounting holes outside the body, and a base can be wider
than what stands on it. Never ask to remove or shrink a feature the request mentions. If
unsure, say OK.

Reply with exactly one line: either `OK`, or `PROBLEM: ` followed by what is wrong and how
to fix it, in at most two sentences."""


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
