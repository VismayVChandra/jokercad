from abc import ABC, abstractmethod


class ProviderError(Exception):
    """Raised when a provider fails or is unavailable, so the router can fall through."""


class LLMProvider(ABC):
    name: str

    @abstractmethod
    def is_configured(self) -> bool:
        """Whether this provider has what it needs (API key, reachable host) to attempt a call."""

    @abstractmethod
    def generate(self, system_prompt: str, messages: list[dict]) -> str:
        """messages is a list of {"role": "user"|"assistant", "content": str}. Returns raw text."""
