from pydantic import BaseModel


class GenerateRequest(BaseModel):
    session_id: str
    prompt: str


class GenerateResponse(BaseModel):
    ok: bool
    provider_used: str | None = None
    code: str | None = None
    glb_url: str | None = None
    stl_url: str | None = None
    error: str | None = None
    attempts: int = 0
