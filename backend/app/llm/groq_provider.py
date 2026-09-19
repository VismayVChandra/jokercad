import os
import time

from .base import LLMProvider, ProviderError, first_answer, model_chain

# Seconds to wait before each retry after a per-minute rate limit (429). Groq's
# free tier limits tokens per rolling minute, and a repair retry sent right
# after the first call often goes over; waiting lets the window roll on.
_RATE_LIMIT_WAITS = (10, 20)


class GroqProvider(LLMProvider):
    name = "groq"

    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY", "")
        # Groq limits each model separately, so when the main model's daily
        # allowance runs out, the fallbacks take over.
        self.models = model_chain(
            os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
            os.getenv("GROQ_FALLBACK_MODELS", "openai/gpt-oss-20b,qwen/qwen3.8-27b"),
        )
        # Reviews on a smaller model don't eat into the main model's allowance.
        self.review_model = os.getenv("GROQ_REVIEW_MODEL", "openai/gpt-oss-20b")
        self.timeout = float(os.getenv("LLM_TIMEOUT_SECONDS", "30"))
        # Groq's free tier counts the prompt against 8,000 tokens per minute and
        # refuses a single request over that outright, so this stays well under.
        self.input_budget = int(os.getenv("GROQ_INPUT_BUDGET", "5000"))

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def generate(self, system_prompt: str, messages: list[dict], review: bool = False) -> str:
        try:
            from groq import Groq
        except ImportError as e:
            raise ProviderError(f"groq package not installed: {e}")

        client = Groq(api_key=self.api_key, timeout=self.timeout, max_retries=1)
        request = [{"role": "system", "content": system_prompt}, *messages]

        if review:
            content, _ = self._complete(client, self.review_model, request, patient=False, low_effort=False)
            return content

        # Only the last model waits out a per-minute limit; before that,
        # moving on to the next model is quicker.
        return first_answer(self.models, lambda model, is_last: self._answer(client, model, request, is_last))

    def _answer(self, client, model: str, request: list[dict], patient: bool) -> str:
        content, finish_reason = self._complete(client, model, request, patient, low_effort=False)
        # gpt-oss can spend its whole output allowance reasoning about a complex
        # part and get cut off before writing any code; ask again, reasoning less.
        if finish_reason == "length" and "```" not in content:
            content, _ = self._complete(client, model, request, patient, low_effort=True)
        return content

    def _complete(self, client, model: str, request: list[dict], patient: bool, low_effort: bool) -> tuple[str, str]:
        from groq import RateLimitError

        extra = {"extra_body": {"reasoning_effort": "low"}} if low_effort else {}
        last_error = None
        for wait in (0, *(_RATE_LIMIT_WAITS if patient else ())):
            time.sleep(wait)
            try:
                resp = client.chat.completions.create(model=model, messages=request, temperature=0.2, **extra)
                choice = resp.choices[0]
                return choice.message.content or "", choice.finish_reason
            except RateLimitError as e:
                if "per day" in str(e).lower():
                    # A daily allowance won't free up within seconds.
                    raise ProviderError(f"Groq call failed ({model}): {e}")
                last_error = e
            except Exception as e:
                # Includes 413 "request too large", which waiting can't fix.
                raise ProviderError(f"Groq call failed ({model}): {e}")
        raise ProviderError(f"Groq call failed ({model}): {last_error}")
