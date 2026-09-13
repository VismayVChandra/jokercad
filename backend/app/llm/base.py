from abc import ABC, abstractmethod


class ProviderError(Exception):
    """Raised when a provider fails or is unavailable, so the router can fall through."""


class LLMProvider(ABC):
    name: str

    @abstractmethod
    def is_configured(self) -> bool:
        """Whether this provider has what it needs (API key, reachable host) to attempt a call."""

    @abstractmethod
    def generate(self, system_prompt: str, messages: list[dict], review: bool = False) -> str:
        """messages is a list of {"role": "user"|"assistant", "content": str}. Returns raw text.

        review=True marks a quick, optional check of a built part: a provider may use a
        smaller model for it and shouldn't spend time waiting out rate limits.
        """
