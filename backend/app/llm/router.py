import os
import re

from .base import LLMProvider, ProviderError
from .gemini_provider import GeminiProvider
from .groq_provider import GroqProvider
from .ollama_provider import OllamaProvider

_ALL_PROVIDERS = {
    "groq": GroqProvider,
    "gemini": GeminiProvider,
    "ollama": OllamaProvider,
}

_NOT_CONFIGURED = "not configured (no API key set)"


def _pretty_wait(raw: str) -> str:
    """'19m49.727999999s' -> '19m 50s'."""
    match = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?", raw)
    if not match:
        return raw
    hours, minutes, seconds = (float(g) if g else 0.0 for g in match.groups())
    total = round(hours * 3600 + minutes * 60 + seconds)
    h, rest = divmod(total, 3600)
    m, s = divmod(rest, 60)
    return " ".join(f"{value}{unit}" for value, unit in ((h, "h"), (m, "m"), (s, "s")) if value) or "a moment"


def _explain(provider: str, error: str) -> str:
    """Turns a provider's raw API error into a message worth showing a user."""
    name = provider.capitalize()
    text = error.lower()
    if re.search(r"\b413\b", text) or "request too large" in text:
        return (
            f"That request was too large for {name}'s free tier, which limits tokens per minute. "
            "Try a shorter prompt, or reload the page to start a fresh conversation."
        )
    # Groq says "tokens per day"; Gemini names a "...PerDay..." quota.
    if "per day" in text or "perday" in text:
        retry = re.search(r"(?:try again|retry) in ([0-9hms.]+)", text)
        when = f" {name} says to try again in {_pretty_wait(retry.group(1).rstrip('.'))}." if retry else ""
        return f"{name}'s free daily allowance is used up.{when}"
    if re.search(r"\b429\b", text) or "rate limit" in text or "rate_limit" in text:
        return f"{name}'s free-tier rate limit was reached. Wait a minute, then try again."
    if re.search(r"\b404\b", text) or "not_found" in text or "no longer available" in text:
        return f"{name} doesn't offer the model set in {provider.upper()}_MODEL. Update it in the server's environment variables."
    if re.search(r"\b(401|403)\b", text) or "api key" in text:
        return f"{name} rejected the API key. Check it in the server's environment variables."
    if "timed out" in text or "timeout" in text:
        return f"{name} took too long to answer. Try again."
    return f"{name} failed: {error[:200]}"


def _worth_reporting(provider: str, error: str) -> bool:
    # An unconfigured provider, or a local Ollama that simply isn't running
    # (it never is on a hosted deploy), isn't news to the user.
    if error == _NOT_CONFIGURED:
        return False
    return not (provider == "ollama" and "connection" in error.lower())


class RouterExhaustedError(Exception):
    def __init__(self, attempts: dict[str, str]):
        self.attempts = attempts
        detail = "; ".join(f"{name}: {err}" for name, err in attempts.items())
        super().__init__(f"All LLM providers failed or are unconfigured — {detail}")

    def user_message(self) -> str:
        failures = [(name, err) for name, err in self.attempts.items() if _worth_reporting(name, err)]
        if not failures:
            return "No AI provider is available. Set GROQ_API_KEY or GEMINI_API_KEY on the server."
        # Every provider that was tried and failed, so a fallback's own problem
        # (e.g. a retired model name) isn't hidden behind the first failure.
        first, *others = [_explain(name, err) for name, err in failures]
        message = " ".join([first, *(f"It also tried {name.capitalize()}: {text}" for (name, _), text in zip(failures[1:], others))])
        if "gemini" not in dict(failures) and self.attempts.get("gemini") == _NOT_CONFIGURED:
            message += " Adding a free GEMINI_API_KEY lets the app fall back to Gemini automatically."
        return message


class LLMRouter:
    """Tries providers in order, falling through on failure so a rate-limited or
    unconfigured free-tier provider doesn't block generation."""

    def __init__(self, order: list[str] | None = None, review_order: list[str] | None = None):
        # Gemini writes far better code for complex parts (assemblies, mechanisms)
        # than Groq's models, so it builds first. Reviews are short checks that
        # Groq answers quickly, which also leaves Gemini's small per-minute
        # allowance for building parts.
        order = order or os.getenv("LLM_PROVIDER_ORDER", "gemini,groq,ollama").split(",")
        review_order = review_order or os.getenv("REVIEW_PROVIDER_ORDER", "groq,gemini").split(",")
        instances: dict[str, LLMProvider] = {}

        def build(names: list[str]) -> list[LLMProvider]:
            names = [n.strip() for n in names if n.strip() in _ALL_PROVIDERS]
            return [instances.setdefault(n, _ALL_PROVIDERS[n]()) for n in names]

        self.providers = build(order)
        self.review_providers = build(review_order)

    def generate(self, system_prompt: str, messages: list[dict]) -> tuple[str, str]:
        """Returns (text, provider_name_used)."""
        return self._first_answer(self.providers, system_prompt, messages, review=False)

    def review(self, system_prompt: str, messages: list[dict]) -> str:
        """A quick check of a built part; providers may use a smaller model for it."""
        text, _ = self._first_answer(self.review_providers, system_prompt, messages, review=True)
        return text

    def _first_answer(
        self, providers: list[LLMProvider], system_prompt: str, messages: list[dict], review: bool
    ) -> tuple[str, str]:
        attempts: dict[str, str] = {}
        for provider in providers:
            if not provider.is_configured():
                attempts[provider.name] = _NOT_CONFIGURED
                continue
            try:
                return provider.generate(system_prompt, messages, review=review), provider.name
            except ProviderError as e:
                attempts[provider.name] = str(e)
        raise RouterExhaustedError(attempts)
