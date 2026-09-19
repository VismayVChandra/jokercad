"""How much conversation each provider is sent.

The budget used to be one global number sized for the tightest free tier, and
it was applied before the router had chosen anyone — so a request was cut down
to Groq's size even when it was about to be answered by a provider that could
read ten times as much. That is what stopped a long script ever being repaired.
"""

from app.llm.base import approx_tokens, fit_messages

SYSTEM = "system prompt " * 100  # ~350 tokens


def exchange(n: int, size: int = 400) -> list[dict]:
    """`n` user/assistant pairs, each message roughly `size` tokens."""
    out = []
    for i in range(n):
        out.append({"role": "user", "content": f"ask {i} " + "x" * size * 4})
        out.append({"role": "assistant", "content": f"code {i} " + "y" * size * 4})
    return out


def test_a_small_budget_drops_the_oldest_exchanges_first():
    messages = exchange(5)
    kept = fit_messages(SYSTEM, messages, budget=2000)
    assert len(kept) < len(messages)
    # What survives is the end of the conversation, not the start.
    assert kept[-1] is messages[-1]
    assert "ask 0" not in kept[0]["content"]


def test_a_large_budget_keeps_everything():
    messages = exchange(5)
    assert fit_messages(SYSTEM, messages, budget=60_000) == messages


def test_the_same_history_is_trimmed_differently_per_provider():
    # The whole point: one conversation, two budgets, two different requests.
    messages = exchange(6)
    small = fit_messages(SYSTEM, messages, budget=2000)
    large = fit_messages(SYSTEM, messages, budget=60_000)
    assert len(large) > len(small)


def test_the_latest_exchange_survives_even_when_it_alone_is_over_budget():
    # Emptying the request would guarantee a useless answer. Sending it lets the
    # provider refuse, and the router then falls through to one with room.
    messages = exchange(1, size=5000)
    kept = fit_messages(SYSTEM, messages, budget=1000)
    assert kept == messages


def test_a_budget_of_zero_means_no_limit():
    messages = exchange(4)
    assert fit_messages(SYSTEM, messages, budget=0) == messages


def test_providers_declare_budgets_that_match_their_free_tiers():
    from app.llm.gemini_provider import GeminiProvider
    from app.llm.groq_provider import GroqProvider

    # Groq refuses a single request over 8,000 tokens outright, so it has to sit
    # below that; Gemini's context is far larger and shouldn't be held to it.
    assert GroqProvider().input_budget < 8000
    assert GeminiProvider().input_budget > GroqProvider().input_budget * 2


def test_approx_tokens_counts_every_piece():
    assert approx_tokens("x" * 400) == 100
    assert approx_tokens("x" * 400, "y" * 400) == 200
