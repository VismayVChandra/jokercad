from abc import ABC, abstractmethod


class ProviderError(Exception):
    """Raised when a provider fails or is unavailable, so the router can fall through."""


def model_chain(primary: str, fallbacks: str) -> list[str]:
    """The primary model followed by the comma-separated fallbacks, without repeats."""
    names = [primary, *fallbacks.split(",")]
    return list(dict.fromkeys(n.strip() for n in names if n.strip()))


def is_rate_limit(error: Exception) -> bool:
    text = str(error).lower()
    return any(s in text for s in ("429", "rate limit", "rate_limit", "resource_exhausted"))


def first_answer(models: list[str], ask) -> str:
    """Calls ask(model, is_last) for each model until one answers.

    Free tiers limit each model separately, so when one model's allowance runs
    out, the next takes over. The main model's other errors (a bad key, a
    request that's too large) are raised at once: another model won't help.
    If every model fails, the main model's error is the one reported.
    """
    first_error = None
    for i, model in enumerate(models):
        try:
            return ask(model, i == len(models) - 1)
        except ProviderError as e:
            if i == 0 and not is_rate_limit(e):
                raise
            first_error = first_error or e
    raise first_error


def approx_tokens(*texts: str) -> int:
    """Rough token count: fine for deciding what to drop, never for billing."""
    return sum(len(str(t)) for t in texts) // 4


def fit_messages(system_prompt: str, messages: list[dict], budget: int) -> list[dict]:
    """Drops the oldest exchanges until the request fits one provider's budget.

    Budgets differ by an order of magnitude between free tiers, so this is
    applied per provider rather than once for everyone: trimming a request to
    the smallest provider's size and then sending it to a larger one throws
    away context that provider would happily have read. The latest exchange is
    always kept, even when it alone is over budget — a request that big is
    better sent and refused (the router then falls through to a provider with
    room) than silently emptied.
    """
    if budget <= 0:
        return messages
    kept = list(messages)
    while len(kept) > 2 and approx_tokens(system_prompt, *(m["content"] for m in kept)) > budget:
        kept = kept[2:]
    return kept


class LLMProvider(ABC):
    name: str
    # Roughly how many tokens of prompt this provider will take in one request.
    # Overridden per provider, because the free tiers are nothing like each
    # other: Groq refuses anything over 8k outright, Gemini reads a whole file.
    input_budget: int = 8000

    @abstractmethod
    def is_configured(self) -> bool:
        """Whether this provider has what it needs (API key, reachable host) to attempt a call."""

    @abstractmethod
    def generate(self, system_prompt: str, messages: list[dict], review: bool = False) -> str:
        """messages is a list of {"role": "user"|"assistant", "content": str}. Returns raw text.

        review=True marks a quick, optional check of a built part: a provider may use a
        smaller model for it and shouldn't spend time waiting out rate limits.
        """
