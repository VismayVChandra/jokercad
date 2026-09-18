"""Checks model-written CAD code before it is allowed to run.

The code the LLM produces is untrusted input: a prompt can steer it, and
`/api/run` takes code straight from the browser. This module is the first of
three layers around it (the others are the child process's resource limits and
the stripped environment in `executor.py`).

It parses the code and walks the syntax tree, rather than searching the source
text for banned words. Text matching both missed the real escapes (`from os
import getcwd`, `import pathlib`, `importlib.import_module("os")` all read as
innocent) and tripped over harmless strings and comments that happened to
contain a banned word.

This raises the bar a long way; it is not a sandbox. Escaping a Python
allowlist is a known art, so treat this as defence in depth alongside the
process limits, never as the only thing standing between a prompt and the
server.
"""

import ast

# Generated code is meant to use build123d, the helpers copied in beside it as
# `jokercad_parts`, and stdlib maths. The system prompt asks for exactly this,
# so anything else is either a mistake worth telling the model about or an
# attempt to reach outside the part it was asked to build.
ALLOWED_IMPORTS = frozenset({"build123d", "math", "jokercad_parts"})

# Builtins that turn data into code, reach the filesystem, or walk the object
# graph looking for a way out.
BANNED_CALLS = frozenset(
    {
        "eval",
        "exec",
        "compile",
        "open",
        "__import__",
        "getattr",
        "setattr",
        "delattr",
        "globals",
        "locals",
        "vars",
        "dir",
        "input",
        "breakpoint",
        "memoryview",
        "help",
        "exit",
        "quit",
    }
)

# The classic escape is `().__class__.__bases__[0].__subclasses__()`: every step
# of it goes through a dunder, so no dunder is reachable at all. Real CAD code
# has no reason to touch one.
_MAX_CODE_BYTES = 20_000


class UnsafeCode(Exception):
    """Raised when generated code asks for something outside building a part."""


def _is_dunder(name: str) -> bool:
    return name.startswith("__") and name.endswith("__")


def _root_module(name: str) -> str:
    return name.split(".", 1)[0]


class _Auditor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.problems: list[str] = []

    def _reject(self, node: ast.AST, message: str) -> None:
        line = getattr(node, "lineno", None)
        self.problems.append(f"line {line}: {message}" if line else message)

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            if _root_module(alias.name) not in ALLOWED_IMPORTS:
                self._reject(node, f"`import {alias.name}` is not allowed")
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        # `from . import x` has no module name and would resolve beside the script.
        module = node.module or ""
        if not module or _root_module(module) not in ALLOWED_IMPORTS:
            self._reject(node, f"`from {module or '.'} import ...` is not allowed")
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        if _is_dunder(node.attr):
            self._reject(node, f"attribute `{node.attr}` is not allowed")
        self.generic_visit(node)

    def visit_Name(self, node: ast.Name) -> None:
        if _is_dunder(node.id):
            self._reject(node, f"name `{node.id}` is not allowed")
        elif isinstance(node.ctx, ast.Load) and node.id in BANNED_CALLS:
            self._reject(node, f"`{node.id}` is not allowed")
        self.generic_visit(node)

    # Keyword arguments and attribute writes go through their own node types.
    def visit_keyword(self, node: ast.keyword) -> None:
        if node.arg and _is_dunder(node.arg):
            self._reject(node, f"keyword `{node.arg}` is not allowed")
        self.generic_visit(node)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        if _is_dunder(node.name):
            self._reject(node, f"defining `{node.name}` is not allowed")
        self.generic_visit(node)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        if _is_dunder(node.name):
            self._reject(node, f"defining `{node.name}` is not allowed")
        self.generic_visit(node)


def validate_code(code: str) -> None:
    """Raises UnsafeCode when the code does anything beyond building a part.

    The message is written to be fed back to the model as a repair instruction,
    so it says what to use instead rather than only what was refused.
    """
    if len(code.encode("utf-8")) > _MAX_CODE_BYTES:
        raise UnsafeCode(f"The code is too long ({len(code)} characters; the limit is {_MAX_CODE_BYTES}).")

    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        raise UnsafeCode(f"The code doesn't parse as Python: line {e.lineno}: {e.msg}") from e

    auditor = _Auditor()
    auditor.visit(tree)
    if auditor.problems:
        listed = "; ".join(auditor.problems[:6])
        raise UnsafeCode(
            f"The code isn't allowed to do this: {listed}. "
            "Build the part using only build123d (already imported with `from build123d import *`), "
            "the helpers in this environment, and `math` — no other imports, no file, process or "
            "network access, and no dunder attributes."
        )
