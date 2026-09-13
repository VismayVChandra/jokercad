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


class RunRequest(BaseModel):
    code: str = Field(max_length=20000)


class GenerateResponse(BaseModel):
    ok: bool
    provider_used: str | None = None
    code: str | None = None
    glb_base64: str | None = None
    error: str | None = None
    attempts: int = 0
