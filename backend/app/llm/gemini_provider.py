import base64
import os

import requests

from .base import LLMProvider, ProviderError, first_answer, model_chain

_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def _mime_type(image: bytes) -> str:
    if image.startswith(b"\x89PNG"):
        return "image/png"
    if image[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


class GeminiProvider(LLMProvider):
    """Calls the Gemini REST API directly; the google-generativeai SDK and its
    dependencies would add ~130 MB to the deploy bundle."""

    name = "gemini"
    supports_images = True

    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY", "")
        # Gemini's free tier limits each model separately (and allows only a few
        # requests a minute), so when one model is busy the next takes over.
        self.models = model_chain(
            os.getenv("GEMINI_MODEL", "gemini-3.6-flash"),
            os.getenv(
                "GEMINI_FALLBACK_MODELS", "gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash,gemini-3.1-flash-lite"
            ),
        )
        # Gemini 3 thinks before answering. At its default level a complex part
        # took ~80 s; at "low" ~9 s, with code of similar quality. Empty turns
        # the setting off, for models that don't support a thinking level.
        self.thinking_level = os.getenv("GEMINI_THINKING_LEVEL", "low")
        self.timeout = float(os.getenv("GEMINI_TIMEOUT_SECONDS", "60"))

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def generate(
        self, system_prompt: str, messages: list[dict], review: bool = False, images: list[bytes] | None = None
    ) -> str:
        """images: PNGs shown with the last message."""
        config = {"temperature": 0.2}
        if self.thinking_level:
            config["thinkingConfig"] = {"thinkingLevel": self.thinking_level}
        contents = [
            {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
            for m in messages
        ]
        # In order, before the text: the review refers to "the first picture".
        for image in reversed(images or []):
            contents[-1]["parts"].insert(
                0, {"inline_data": {"mime_type": _mime_type(image), "data": base64.b64encode(image).decode("ascii")}}
            )
        body = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": contents,
            "generationConfig": config,
        }
        return first_answer(self.models, lambda model, _: self._call(model, body))

    def _call(self, model: str, body: dict) -> str:
        try:
            resp = requests.post(
                _API_URL.format(model=model),
                json=body,
                headers={"x-goog-api-key": self.api_key},
                timeout=self.timeout,
            )
        except requests.RequestException as e:
            raise ProviderError(f"Gemini request failed ({model}): {e}")

        if resp.status_code != 200:
            raise ProviderError(f"Gemini returned {resp.status_code} ({model}): {resp.text[:600]}")

        try:
            parts = resp.json()["candidates"][0]["content"]["parts"]
            return "".join(p.get("text", "") for p in parts)
        except (KeyError, IndexError, ValueError) as e:
            raise ProviderError(f"Unexpected Gemini response shape ({model}): {e}")
