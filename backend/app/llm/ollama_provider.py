import os

import requests

from .base import LLMProvider, ProviderError


class OllamaProvider(LLMProvider):
    name = "ollama"

    def __init__(self):
        self.host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
        self.model = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:7b")

    def is_configured(self) -> bool:
        # Always "configured" — availability is checked live in generate().
        return True

    def generate(self, system_prompt: str, messages: list[dict], review: bool = False) -> str:
        try:
            resp = requests.post(
                f"{self.host}/api/chat",
                json={
                    "model": self.model,
                    "messages": [{"role": "system", "content": system_prompt}, *messages],
                    "stream": False,
                    "options": {"temperature": 0.2},
                },
                timeout=120,
            )
            resp.raise_for_status()
            return resp.json()["message"]["content"]
        except Exception as e:
            raise ProviderError(f"Ollama call failed (is `ollama serve` running? is the model pulled?): {e}")
