import os

from .base import LLMProvider, ProviderError


class GroqProvider(LLMProvider):
    name = "groq"

    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY", "")
        self.model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
        self.timeout = float(os.getenv("LLM_TIMEOUT_SECONDS", "30"))

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def generate(self, system_prompt: str, messages: list[dict]) -> str:
        try:
            from groq import Groq
        except ImportError as e:
            raise ProviderError(f"groq package not installed: {e}")

        try:
            client = Groq(api_key=self.api_key, timeout=self.timeout)
            resp = client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": system_prompt}, *messages],
                temperature=0.2,
            )
            return resp.choices[0].message.content
        except Exception as e:
            raise ProviderError(f"Groq call failed: {e}")
