import os
import time

from .base import LLMProvider, ProviderError

# Seconds to wait before each retry after a per-minute rate limit (429). Groq's
# free tier limits tokens per rolling minute, and a repair retry sent right
# after the first call often goes over; waiting lets the window roll on.
_RATE_LIMIT_WAITS = (10, 20)


class GroqProvider(LLMProvider):
    name = "groq"

    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY", "")
        self.model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
        # Groq rate-limits each model separately, so reviews on a smaller model
        # don't eat into the main model's allowance.
        self.review_model = os.getenv("GROQ_REVIEW_MODEL", "openai/gpt-oss-20b")
        self.timeout = float(os.getenv("LLM_TIMEOUT_SECONDS", "30"))

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def generate(self, system_prompt: str, messages: list[dict], review: bool = False) -> str:
        try:
            from groq import Groq
        except ImportError as e:
            raise ProviderError(f"groq package not installed: {e}")

        client = Groq(api_key=self.api_key, timeout=self.timeout, max_retries=1)
        model = self.review_model if review else self.model
        request = [{"role": "system", "content": system_prompt}, *messages]

        content, finish_reason = self._complete(client, model, request, review, low_effort=False)
        # gpt-oss can spend its whole output allowance reasoning about a complex
        # part and get cut off before writing any code; ask again, reasoning less.
        if finish_reason == "length" and "```" not in content and not review:
            content, _ = self._complete(client, model, request, review, low_effort=True)
        return content

    def _complete(self, client, model: str, request: list[dict], review: bool, low_effort: bool) -> tuple[str, str]:
        from groq import RateLimitError

        extra = {"extra_body": {"reasoning_effort": "low"}} if low_effort else {}
        last_error = None
        for wait in (0, *(() if review else _RATE_LIMIT_WAITS)):
            time.sleep(wait)
            try:
                resp = client.chat.completions.create(model=model, messages=request, temperature=0.2, **extra)
                choice = resp.choices[0]
                return choice.message.content or "", choice.finish_reason
            except RateLimitError as e:
                if "per day" in str(e).lower():
                    # A daily allowance won't free up within seconds.
                    raise ProviderError(f"Groq call failed: {e}")
                last_error = e
            except Exception as e:
                # Includes 413 "request too large", which waiting can't fix.
                raise ProviderError(f"Groq call failed: {e}")
        raise ProviderError(f"Groq call failed: {last_error}")
