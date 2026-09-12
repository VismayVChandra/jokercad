import os

from .base import ProviderError
from .gemini_provider import GeminiProvider
from .groq_provider import GroqProvider
from .ollama_provider import OllamaProvider

_ALL_PROVIDERS = {
    "groq": GroqProvider,
    "gemini": GeminiProvider,
    "ollama": OllamaProvider,
}


class RouterExhaustedError(Exception):
    def __init__(self, attempts: dict[str, str]):
        self.attempts = attempts
        detail = "; ".join(f"{name}: {err}" for name, err in attempts.items())
        super().__init__(f"All LLM providers failed or are unconfigured — {detail}")


class LLMRouter:
    """Tries providers in order, falling through on failure so a rate-limited or
    unconfigured free-tier provider doesn't block generation."""

    def __init__(self, order: list[str] | None = None):
        order = order or os.getenv("LLM_PROVIDER_ORDER", "groq,gemini,ollama").split(",")
        self.providers = [_ALL_PROVIDERS[name.strip()]() for name in order if name.strip() in _ALL_PROVIDERS]

    def generate(self, system_prompt: str, messages: list[dict]) -> tuple[str, str]:
        """Returns (text, provider_name_used)."""
        attempts: dict[str, str] = {}
        for provider in self.providers:
            if not provider.is_configured():
                attempts[provider.name] = "not configured (no API key set)"
                continue
            try:
                text = provider.generate(system_prompt, messages)
                return text, provider.name
            except ProviderError as e:
                attempts[provider.name] = str(e)
                continue
        raise RouterExhaustedError(attempts)
