import os
import time

from .base import LLMProvider, ProviderError

# Seconds to wait before each retry after a rate-limit (429) response. Groq's
# free tier limits tokens per rolling minute, and a repair retry sent right
# after the first call often goes over; waiting lets the window roll on.
_RATE_LIMIT_WAITS = (10, 20)


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
            from groq import Groq, RateLimitError
        except ImportError as e:
            raise ProviderError(f"groq package not installed: {e}")

        client = Groq(api_key=self.api_key, timeout=self.timeout, max_retries=1)
        request = [{"role": "system", "content": system_prompt}, *messages]
        last_error = None
        for wait in (0, *_RATE_LIMIT_WAITS):
            time.sleep(wait)
            try:
                resp = client.chat.completions.create(model=self.model, messages=request, temperature=0.2)
                return resp.choices[0].message.content
            except RateLimitError as e:
                last_error = e
            except Exception as e:
                # Includes 413 "request too large", which waiting can't fix.
                raise ProviderError(f"Groq call failed: {e}")
        raise ProviderError(f"Groq call failed: {last_error}")
