import os
import re

from .base import ProviderError
from .gemini_provider import GeminiProvider
from .groq_provider import GroqProvider
from .ollama_provider import OllamaProvider

_ALL_PROVIDERS = {
    "groq": GroqProvider,
    "gemini": GeminiProvider,
    "ollama": OllamaProvider,
}

_NOT_CONFIGURED = "not configured (no API key set)"


def _explain(provider: str, error: str) -> str:
    """Turns a provider's raw API error into a message worth showing a user."""
    name = provider.capitalize()
    text = error.lower()
    if re.search(r"\b413\b", text) or "request too large" in text:
        return (
            f"That request was too large for {name}'s free tier, which limits tokens per minute. "
            "Try a shorter prompt, or reload the page to start a fresh conversation."
        )
    if re.search(r"\b429\b", text) or "rate limit" in text or "rate_limit" in text:
        return f"{name}'s free-tier rate limit was reached. Wait a minute, then try again."
    if re.search(r"\b401\b", text) or "api key" in text:
        return f"{name} rejected the API key. Check it in the server's environment variables."
    if "timed out" in text or "timeout" in text:
        return f"{name} took too long to answer. Try again."
    return f"The AI provider ({name}) failed: {error[:200]}"


class RouterExhaustedError(Exception):
    def __init__(self, attempts: dict[str, str]):
        self.attempts = attempts
        detail = "; ".join(f"{name}: {err}" for name, err in attempts.items())
        super().__init__(f"All LLM providers failed or are unconfigured — {detail}")

    def user_message(self) -> str:
        failures = [(name, err) for name, err in self.attempts.items() if err != _NOT_CONFIGURED]
        if not failures:
            return "No AI provider is configured. Set GROQ_API_KEY or GEMINI_API_KEY on the server."
        name, error = failures[0]
        message = _explain(name, error)
        if name != "gemini" and self.attempts.get("gemini") == _NOT_CONFIGURED:
            message += " Adding a free GEMINI_API_KEY lets the app fall back to Gemini automatically."
        return message


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
                attempts[provider.name] = _NOT_CONFIGURED
                continue
            try:
                text = provider.generate(system_prompt, messages)
                return text, provider.name
            except ProviderError as e:
                attempts[provider.name] = str(e)
                continue
        raise RouterExhaustedError(attempts)
