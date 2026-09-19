from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=20000)


class GenerateRequest(BaseModel):
    prompt: str
    # The browser keeps the conversation and sends it with each request, so the
    # server holds no per-user state between requests (serverless-friendly).
    history: list[ChatMessage] = Field(default_factory=list, max_length=50)
    # A reference photo or sketch, base64-encoded (the browser shrinks it first).
    image: str | None = Field(default=None, max_length=5_000_000)
    # How mating parts should fit, as "process:kind", e.g. "print:sliding".
    fit: str | None = Field(default=None, max_length=32)
    # A provider name to try first (e.g. "groq"), chosen by the user instead of
    # the router's own order. Still falls back to the others if it fails.
    provider: str | None = Field(default=None, max_length=16)
    # The intent behind the part as it stands, sent back on a follow-up so an
    # edit is made against known state instead of being re-derived from the chat.
    spec: dict | None = None


class RunRequest(BaseModel):
    code: str = Field(max_length=20000)
    # The design intent this code belongs to, sent back by the browser so a
    # rebuilt part (a parameter edit) is measured against the same intent.
    spec: dict | None = None


class PlanRequest(BaseModel):
    prompt: str
    provider: str | None = Field(default=None, max_length=16)


class PlannedPart(BaseModel):
    name: str
    prompt: str


class PlanResponse(BaseModel):
    ok: bool
    parts: list[PlannedPart] | None = None
    error: str | None = None


class GenerateResponse(BaseModel):
    ok: bool
    provider_used: str | None = None
    code: str | None = None
    glb_base64: str | None = None
    error: str | None = None
    attempts: int = 0
    # Set when the part built but the automatic review still sees a problem.
    note: str | None = None
    # For an assembly, the labels of its parts; the GLB names each part's node after its label.
    parts: list[str] | None = None
    # How an assembly's parts move (the code's `motion` dict), for the motion slider.
    motion: dict | None = None
    # What the model said it was building, before it wrote the code (see prompts.py).
    # None for a rebuild, or when the model didn't return usable JSON.
    spec: dict | None = None
    # The measured solid diffed against that spec (see cad/selfcheck.py), plus the
    # raw measurements the inspector shows. None when there was nothing to check.
    check: dict | None = None
    measured: dict | None = None
