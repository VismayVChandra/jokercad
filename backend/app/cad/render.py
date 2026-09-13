"""A picture of a built part, for the review model to look at.

Serverless functions have no GPU or display, so this draws the part's triangles
with Pillow, farthest first (the painter's algorithm), from four directions."""

import io

import numpy as np
from PIL import Image, ImageDraw, ImageFont

# (label, the direction the camera looks in, the world direction shown as up).
# The review prompt describes these views; keep the two in step.
VIEWS = [
    ("ISO: from front-right, above", (-1.0, 1.0, -1.0), (0.0, 0.0, 1.0)),
    ("FRONT: looking +Y, X right, Z up", (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)),
    ("TOP: looking down, X right, Y up", (0.0, 0.0, -1.0), (0.0, 1.0, 0.0)),
    ("RIGHT: looking -X, Y right, Z up", (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0)),
]

# The viewer's part colours, so an assembly's parts look the same in both.
_COLORS = [
    (0x8B, 0x93, 0xF0),
    (0x4F, 0xD1, 0xB0),
    (0xF2, 0xB3, 0x5B),
    (0xE5, 0x8F, 0xD8),
    (0x6C, 0xB8, 0xFF),
    (0xB3, 0xE0, 0x6B),
    (0xFF, 0x8F, 0x8F),
    (0xC8, 0xA7, 0xFF),
]

PANEL = 360  # pixels per view in the finished picture
_SUPERSAMPLE = 2  # drawn larger, then shrunk, to smooth the edges


def _camera(forward, hint):
    f = np.asarray(forward, dtype=float)
    f /= np.linalg.norm(f)
    right = np.cross(f, hint)
    right /= np.linalg.norm(right)
    return f, right, np.cross(right, f)


def _font(pixels: int):
    try:
        return ImageFont.load_default(size=pixels)
    except TypeError:  # Pillow before 10.1 has only the fixed-size font
        return ImageFont.load_default()


def render_views(pieces) -> bytes:
    """pieces: one (vertices (n, 3), triangles (m, 3)) pair per part, in mm with
    Z up. Returns a PNG with the four VIEWS in a 2x2 grid, all at one scale."""
    pieces = [
        (np.asarray(v, dtype=float), np.asarray(t, dtype=int).reshape(-1, 3))
        for v, t in pieces
        if len(v) and len(t)
    ]
    if not pieces:
        raise ValueError("nothing to draw")

    everything = np.concatenate([v for v, _ in pieces])
    center = (everything.min(axis=0) + everything.max(axis=0)) / 2
    radius = max(float(np.linalg.norm(everything - center, axis=1).max()), 1e-6)

    corners = np.concatenate([v[t] for v, t in pieces]) - center  # (triangles, 3 corners, xyz)
    part_of = np.concatenate([np.full(len(t), i) for i, (_, t) in enumerate(pieces)])
    normals = np.cross(corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0])
    # Make every part's normals point outwards: a closed mesh wound the other
    # way round has a negative signed volume.
    signed = np.einsum("ij,ij->i", corners[:, 0], np.cross(corners[:, 1], corners[:, 2]))
    for i in range(len(pieces)):
        mine = part_of == i
        if signed[mine].sum() < 0:
            normals[mine] *= -1
    lengths = np.linalg.norm(normals, axis=1)
    keep = lengths > 1e-12
    corners, part_of, normals = corners[keep], part_of[keep], normals[keep] / lengths[keep, None]
    base_colors = np.array([_COLORS[i % len(_COLORS)] for i in range(len(pieces))], dtype=float)[part_of]

    size = PANEL * _SUPERSAMPLE
    scale = size * 0.4 / radius
    image = Image.new("RGB", (2 * size, 2 * size), (244, 245, 248))
    draw = ImageDraw.Draw(image)
    font = _font(int(size * 0.045))

    for index, (label, forward, hint) in enumerate(VIEWS):
        f, right, up = _camera(forward, hint)
        left, top = (index % 2) * size, (index // 2) * size
        x = corners @ right * scale + left + size / 2
        y = top + size * 0.53 - corners @ up * scale
        # Lit from the viewer's upper left.
        light = -f + 0.6 * up - 0.4 * right
        light /= np.linalg.norm(light)
        shade = 0.38 + 0.62 * np.clip(normals @ light, 0, 1)
        colors = [tuple(c) for c in np.clip(base_colors * shade[:, None], 0, 255).astype(int).tolist()]
        polygons = np.stack([x, y], axis=-1).tolist()
        # Faces turned away from the camera are hidden behind the front ones
        # anyway; skipping them stops the far-first ordering, which is only
        # approximate for big triangles, from painting them over the front.
        front = np.nonzero(normals @ f < 1e-6)[0]
        order = front[np.argsort(-(corners[front] @ f).mean(axis=1))]
        for i in order.tolist():
            points = [tuple(p) for p in polygons[i]]
            draw.polygon(points, fill=colors[i], outline=colors[i])
        draw.text((left + 16, top + 12), label, fill=(60, 64, 80), font=font)

    divider = (200, 203, 212)
    draw.line([(size, 0), (size, 2 * size)], fill=divider, width=2)
    draw.line([(0, size), (2 * size, size)], fill=divider, width=2)

    out = io.BytesIO()
    image.resize((2 * PANEL, 2 * PANEL), Image.LANCZOS).save(out, format="PNG", optimize=True)
    return out.getvalue()
