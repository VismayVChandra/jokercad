import os

import requests

from .base import LLMProvider, ProviderError

_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class GeminiProvider(LLMProvider):
    """Calls the Gemini REST API directly; the google-generativeai SDK and its
    dependencies would add ~130 MB to the deploy bundle."""

    name = "gemini"

    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY", "")
        self.model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        self.timeout = float(os.getenv("LLM_TIMEOUT_SECONDS", "30"))

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def generate(self, system_prompt: str, messages: list[dict], review: bool = False) -> str:
        body = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [
                {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
                for m in messages
            ],
            "generationConfig": {"temperature": 0.2},
        }
        try:
            resp = requests.post(
                _API_URL.format(model=self.model),
                json=body,
                headers={"x-goog-api-key": self.api_key},
                timeout=self.timeout,
            )
        except requests.RequestException as e:
            raise ProviderError(f"Gemini request failed: {e}")

        if resp.status_code != 200:
            raise ProviderError(f"Gemini returned {resp.status_code}: {resp.text[:300]}")

        try:
            parts = resp.json()["candidates"][0]["content"]["parts"]
            return "".join(p.get("text", "") for p in parts)
        except (KeyError, IndexError, ValueError) as e:
            raise ProviderError(f"Unexpected Gemini response shape: {e}")
