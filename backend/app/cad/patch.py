"""Applying a model's edits to code it was not asked to repeat in full.

A part of a few hundred lines can't be repaired by asking for the whole script
again: Groq's free tier refuses a request over 8,000 tokens and caps the reply
at about 3,072, so the fix comes back truncated in the middle of a function —
or never leaves, as a 413. Asking for only the lines that change sidesteps both
limits, and costs a fraction of the tokens on smaller parts too.

The format is a search/replace block, which models are far better at than line
numbers (they mis-count lines constantly, but they can copy a few lines
verbatim):

    <<<<<<< SEARCH
    hole_diameter = 5.0  # mm, mounting hole
    =======
    hole_diameter = 6.5  # mm, mounting hole
    >>>>>>> REPLACE

Every block must match exactly once. A block that matches nowhere, or in two
places, is refused rather than guessed at: applying an edit to the wrong place
in a CAD script produces a part that builds and is quietly wrong, which is far
worse than a failed repair.
"""

import re

_BLOCK_RE = re.compile(
    r"^<{5,9} SEARCH[ \t]*\n(.*?)^={5,9}[ \t]*\n(.*?)^>{5,9} REPLACE[ \t]*$",
    re.DOTALL | re.MULTILINE,
)


class PatchError(Exception):
    """Raised when the edits don't apply cleanly, so the caller can fall back."""


def _lines(text: str) -> list[str]:
    return text.replace("\r\n", "\n").replace("\r", "\n").split("\n")


def _find(haystack: list[str], needle: list[str]) -> int:
    """The single index where `needle` occurs, ignoring trailing whitespace.

    Trailing whitespace is the one difference worth forgiving: models drop it
    silently, and it never changes what Python does. Indentation is compared
    strictly, because in Python it is the meaning.
    """
    if not needle:
        raise PatchError("An edit had an empty SEARCH section.")
    flat = [line.rstrip() for line in haystack]
    want = [line.rstrip() for line in needle]
    hits = [i for i in range(len(flat) - len(want) + 1) if flat[i : i + len(want)] == want]
    if not hits:
        raise PatchError(
            f"An edit did not match the code. Its first line was {needle[0].strip()!r}. "
            "Copy the lines to change exactly as they appear, including indentation."
        )
    if len(hits) > 1:
        raise PatchError(
            f"An edit matched {len(hits)} places, starting {needle[0].strip()!r}. "
            "Include a few more surrounding lines so it matches only one."
        )
    return hits[0]


def parse_patches(text: str) -> list[tuple[str, str]]:
    """The (search, replace) pairs in a model reply, in the order they appear."""
    return [(m.group(1), m.group(2)) for m in _BLOCK_RE.finditer(text.replace("\r\n", "\n"))]


def apply_patches(code: str, text: str) -> str:
    """Returns `code` with the reply's edits applied. Raises PatchError if any doesn't fit."""
    blocks = parse_patches(text)
    if not blocks:
        raise PatchError("The reply contained no SEARCH/REPLACE edits.")

    lines = _lines(code)
    for search, replace in blocks:
        # A block's body carries the newline that ends its last line; that
        # newline belongs to the delimiter, not to the code.
        want = _lines(search.removesuffix("\n"))
        new = _lines(replace.removesuffix("\n")) if replace.strip("\n") else []
        at = _find(lines, want)
        lines[at : at + len(want)] = new

    patched = "\n".join(lines)
    if not patched.strip():
        raise PatchError("The edits would delete the whole script.")
    return patched
