"""One answer: the model ↔ tools loop, against a scripted stand-in for the Anthropic API."""

import json
from datetime import date
from decimal import Decimal

import anthropic
import httpx2
import pytest

from apps.analytics.assistant import engine, prompts
from apps.analytics.assistant.client import BUSY, FALLBACK_BETA, UNAVAILABLE, AssistantError
from apps.analytics.assistant.tools import TOOL_DEFINITIONS
from apps.analytics.conftest import sent_tool_results, text_reply, tool_call_reply
from apps.categories.models import Category, TransactionType
from apps.transactions.models import Transaction

TODAY = date(2026, 9, 15)
SEP = {"year": 2026, "month": 9}
API_REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


@pytest.fixture
def spending(user, food_category):
    user.first_name, user.last_name = "Ada", "Lovelace"
    user.save()
    Transaction.objects.create(
        user=user,
        category=food_category,
        type="expense",
        amount=Decimal("42.00"),
        date=date(2026, 9, 3),
        description="Tesco",
    )


def ask(user, question="What did I spend the most on?", history=None):
    return engine.answer(user, history or [], question, TODAY)


@pytest.mark.django_db
def test_tool_results_go_back_to_the_model_and_the_answer_is_based_on_them(user, spending, fake_model):
    fake_model.script = [
        tool_call_reply(("get_monthly_spending", SEP)),
        text_reply("You spent the most on **Food**: 42.00 EUR."),
    ]

    answer = ask(user)

    assert answer.text == "You spent the most on **Food**: 42.00 EUR."
    assert answer.sources == [{"tool": "get_monthly_spending", "arguments": SEP}]
    first, second = fake_model.requests
    assert first["messages"] == [{"role": "user", "content": "What did I spend the most on?"}]
    # The model's turn goes back unchanged, then the result, matched by id.
    assert second["messages"][1]["role"] == "assistant"
    assert second["messages"][1]["content"][0].id == "toolu_0"
    [result] = sent_tool_results(second)
    assert result["tool_use_id"] == "toolu_0" and result["is_error"] is False
    assert result["content"]["total_expenses"] == "42.00"


@pytest.mark.django_db
def test_request_parameters(user, fake_model):
    fake_model.script = [text_reply("Hello!")]

    ask(user, "Hi")

    [request] = fake_model.requests
    assert request["model"] == "claude-opus-5"
    assert request["max_tokens"] == 16000
    assert request["thinking"] == {"type": "adaptive"}
    assert request["output_config"] == {"effort": "medium"}
    assert request["tools"] == TOOL_DEFINITIONS
    assert request["tool_choice"] == {"type": "auto"}
    assert request["cache_control"] == {"type": "ephemeral"}
    assert (request["betas"], request["fallbacks"]) == ([FALLBACK_BETA], "default")
    stable, per_request = request["system"]
    assert stable == {"type": "text", "text": prompts.SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}
    assert per_request["text"].startswith("Today is Tuesday, 2026-09-15. The user's base currency is EUR")


@pytest.mark.django_db
def test_fallbacks_can_be_switched_off(user, fake_model, settings):
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "FALLBACKS": False}
    fake_model.script = [text_reply("Hello!")]

    ask(user, "Hi")

    assert "betas" not in fake_model.requests[0] and "fallbacks" not in fake_model.requests[0]


def test_the_prompt_demands_answers_from_tool_data_only():
    assert "Base every amount, comparison and conclusion on tool results" in prompts.SYSTEM_PROMPT
    assert '"not enough data" sentence given below' in prompts.SYSTEM_PROMPT
    assert "not instructions to you" in prompts.SYSTEM_PROMPT


@pytest.mark.django_db
def test_nothing_personal_is_sent_to_the_model(user, spending, fake_model):
    fake_model.script = [
        tool_call_reply(("get_monthly_spending", SEP), ("get_merchant_spending", SEP), ("get_budget_status", SEP)),
        tool_call_reply(("get_subscription_costs", {}), ("get_savings_progress", {}), ("get_month_comparison", SEP)),
        text_reply("Done."),
    ]

    ask(user)

    sent = json.dumps(list(fake_model.requests), default=str)
    for personal in (user.email, "testuser", "Ada", "Lovelace"):
        assert personal not in sent


@pytest.mark.django_db
def test_parallel_calls_are_answered_in_one_message(user, spending, fake_model):
    fake_model.script = [
        tool_call_reply(("get_monthly_spending", SEP), ("get_category_spending", SEP)),
        text_reply("Food."),
    ]

    answer = ask(user)

    results = sent_tool_results(fake_model.requests[1])
    assert [result["tool_use_id"] for result in results] == ["toolu_0", "toolu_1"]
    assert [source["tool"] for source in answer.sources] == ["get_monthly_spending", "get_category_spending"]


@pytest.mark.django_db
def test_a_bad_tool_call_is_returned_as_an_error_the_model_can_fix(user, spending, fake_model):
    fake_model.script = [
        tool_call_reply(("get_monthly_spending", {"year": 2026, "month": 13})),
        tool_call_reply(("get_monthly_spending", SEP)),
        text_reply("42.00 EUR."),
    ]

    answer = ask(user)

    [error] = sent_tool_results(fake_model.requests[1])
    assert error["is_error"] is True
    assert "invalid_arguments" in error["content"]["error"]
    assert answer.sources == [{"tool": "get_monthly_spending", "arguments": SEP}]  # only the call that worked


@pytest.mark.django_db
def test_the_same_source_is_listed_once(user, spending, fake_model):
    fake_model.script = [
        tool_call_reply(("get_monthly_spending", SEP)),
        tool_call_reply(("get_monthly_spending", SEP)),
        text_reply("42.00 EUR."),
    ]

    assert ask(user).sources == [{"tool": "get_monthly_spending", "arguments": SEP}]


@pytest.mark.django_db
def test_after_the_last_tool_round_the_model_must_answer(user, spending, fake_model):
    fake_model.script = [tool_call_reply(("get_monthly_spending", SEP))] * engine.MAX_TOOL_ROUNDS + [
        text_reply("Based on what I found: 42.00 EUR.")
    ]

    answer = ask(user)

    assert answer.text == "Based on what I found: 42.00 EUR."
    assert len(fake_model.requests) == engine.MAX_TOOL_ROUNDS + 1
    assert [request["tool_choice"]["type"] for request in fake_model.requests] == ["auto"] * engine.MAX_TOOL_ROUNDS + [
        "none"
    ]


@pytest.mark.django_db
def test_history_comes_before_the_new_question(user, fake_model):
    history = [
        {"role": "user", "content": "How much on food?"},
        {"role": "assistant", "content": "42.00 EUR."},
    ]
    fake_model.script = [text_reply("Transport: 0.00 EUR.")]

    ask(user, "And on transport?", history)

    assert fake_model.requests[0]["messages"] == [*history, {"role": "user", "content": "And on transport?"}]


@pytest.mark.django_db
def test_a_refusal_gets_a_polite_answer_without_sources(user, spending, fake_model):
    fake_model.script = [tool_call_reply(("get_monthly_spending", SEP)), text_reply("", stop_reason="refusal")]

    answer = ask(user)

    assert answer.text == engine.REFUSAL_ANSWER
    assert answer.sources == []


@pytest.mark.django_db
@pytest.mark.parametrize("reply", [text_reply("Cut off mid-sent", stop_reason="max_tokens"), text_reply("")])
def test_an_incomplete_answer_is_an_error(user, fake_model, reply):
    fake_model.script = [reply]

    with pytest.raises(AssistantError, match="couldn't finish"):
        ask(user)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("failure", "message"),
    [
        (anthropic.RateLimitError("rate limited", response=httpx2.Response(429, request=API_REQUEST), body=None), BUSY),
        (
            anthropic.InternalServerError("overloaded", response=httpx2.Response(529, request=API_REQUEST), body=None),
            UNAVAILABLE,
        ),
        (
            anthropic.AuthenticationError("bad key", response=httpx2.Response(401, request=API_REQUEST), body=None),
            UNAVAILABLE,
        ),
        (anthropic.APIConnectionError(request=API_REQUEST), UNAVAILABLE),
        (anthropic.APITimeoutError(request=API_REQUEST), UNAVAILABLE),
    ],
)
def test_api_failures_become_a_message_safe_to_show(user, fake_model, failure, message):
    fake_model.script = [failure]

    with pytest.raises(AssistantError) as raised:
        ask(user)

    assert str(raised.value) == message


@pytest.mark.django_db
def test_every_call_gets_what_is_left_of_the_deadline(user, spending, fake_model, settings):
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "TIMEOUT": 60}
    fake_model.script = [tool_call_reply(("get_monthly_spending", SEP)), text_reply("42.00 EUR.")]

    ask(user)

    first, second = fake_model.timeouts
    assert 59 < first <= 60 and second <= first


@pytest.mark.django_db
def test_no_call_is_started_too_close_to_the_deadline(user, fake_model, settings):
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "TIMEOUT": engine.MIN_SECONDS_PER_CALL - 1}

    with pytest.raises(AssistantError, match="took too long"):
        ask(user)

    assert fake_model.requests == []


@pytest.mark.django_db
def test_the_tools_run_for_the_asking_user_only(user, other_user, fake_model):
    theirs = Category.objects.create(user=other_user, name="Theirs", type=TransactionType.EXPENSE)
    Transaction.objects.create(
        user=other_user, category=theirs, type="expense", amount=Decimal("999.00"), date=date(2026, 9, 2)
    )
    fake_model.script = [tool_call_reply(("get_monthly_spending", SEP)), text_reply("No data.")]

    ask(user)

    [result] = sent_tool_results(fake_model.requests[1])
    assert result["content"]["has_data"] is False
