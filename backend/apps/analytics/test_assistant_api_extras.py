"""The assistant's API beyond the basics: usage, insight cards, follow-ups, who is asking, the
limits that are settings, and the same API answering with Gemini."""

import json
from decimal import Decimal

import pytest
from django.utils import timezone
from google.genai import errors as genai_errors

from apps.analytics.conftest import (
    FakeGemini,
    gemini_text,
    gemini_tool_calls,
    sent_tool_results,
    text_reply,
    tool_call_reply,
)
from apps.analytics.models import AssistantConversation, AssistantMessage
from apps.categories.models import Category
from apps.transactions.models import Transaction

STATUS = "/api/assistant/"
CONVERSATIONS = "/api/assistant/conversations/"


def _this_month() -> dict:
    today = timezone.localdate()
    return {"year": today.year, "month": today.month}


def _start(auth_client, fake_model, question="Hello", answer="Hi!"):
    fake_model.script.append(text_reply(answer))
    response = auth_client.post(CONVERSATIONS, {"message": question}, format="json")
    assert response.status_code == 201, response.content
    return response.json()


@pytest.fixture
def food_spending(user, food_category):
    Transaction.objects.create(
        user=user, category=food_category, type="expense", amount=Decimal("42.00"), date=timezone.localdate()
    )


# --- Usage, insight cards and follow-up questions ----------------------------------------------------


@pytest.mark.django_db
def test_an_answer_reports_its_token_usage(auth_client, fake_model):
    fake_model.script = [tool_call_reply(("get_monthly_spending", _this_month())), text_reply("Nothing yet.")]

    body = auth_client.post(CONVERSATIONS, {"message": "What did I spend?"}, format="json").json()

    # Two model calls of 100 input / 20 output tokens each.
    assert body["usage"] == {"input_tokens": 200, "output_tokens": 40}


@pytest.mark.django_db
def test_an_answer_comes_with_cards_and_follow_ups_that_are_stored(auth_client, fake_model, food_spending):
    fake_model.script = [
        tool_call_reply(("get_monthly_spending", _this_month())),
        text_reply("You spent 42.00 EUR on **Food**."),
    ]

    body = auth_client.post(CONVERSATIONS, {"message": "What did I spend the most on?"}, format="json").json()

    question, answer = body["messages"]
    assert question["insights"] == [] and question["suggested_questions"] == []
    month = timezone.localdate().strftime("%B %Y")
    assert [
        (card["type"], card["label"], card["detail"], card["amount"], card["currency"], card["tone"])
        for card in answer["insights"]
    ] == [
        ("total_spending", "Total spending", month, "42.00", "EUR", "neutral"),
        ("largest_category", "Largest category", "Food", "42.00", "EUR", "neutral"),
    ]
    assert answer["insights"][1]["percentage"] == 100.0
    assert answer["suggested_questions"] == [
        "How much did I spend on Food last month?",
        "How does that compare to the previous month?",
        "What are my biggest expense categories?",
    ]
    # The same extras come back with the history.
    detail = auth_client.get(f"{CONVERSATIONS}{body['conversation']['id']}/").json()
    assert detail["messages"][1]["insights"] == answer["insights"]
    assert detail["messages"][1]["suggested_questions"] == answer["suggested_questions"]


@pytest.mark.django_db
def test_an_answer_without_data_has_no_cards_but_still_follow_ups(auth_client, fake_model):
    body = _start(auth_client, fake_model, "Hi", "Hello!")

    answer = body["messages"][1]
    assert answer["insights"] == []
    assert len(answer["suggested_questions"]) == 3


@pytest.mark.django_db
def test_cards_and_follow_ups_are_shown_in_the_language_of_the_request(auth_client, fake_model, food_spending):
    fake_model.script = [tool_call_reply(("get_monthly_spending", _this_month())), text_reply("42.00 EUR.")]
    started = auth_client.post(CONVERSATIONS, {"message": "What did I spend?"}, format="json").json()

    english = auth_client.get(f"{CONVERSATIONS}{started['conversation']['id']}/").json()["messages"][1]
    hungarian = auth_client.get(f"{CONVERSATIONS}{started['conversation']['id']}/", HTTP_ACCEPT_LANGUAGE="hu").json()[
        "messages"
    ][1]

    assert [card["label"] for card in english["insights"]] == ["Total spending", "Largest category"]
    assert [card["label"] for card in hungarian["insights"]] == ["Összes kiadás", "Legnagyobb kategória"]
    assert hungarian["insights"][1]["detail"] == "Food"  # the user's own category name is data, not a label


# --- Who is asking: only ever the signed-in user --------------------------------------------------------


@pytest.mark.django_db
def test_a_user_id_in_the_request_changes_nothing(user, other_user, auth_client, fake_model, food_spending):
    theirs = Category.objects.create(user=other_user, name="Theirs", type="expense")
    Transaction.objects.create(
        user=other_user, category=theirs, type="expense", amount=Decimal("999.00"), date=timezone.localdate()
    )
    fake_model.script = [tool_call_reply(("get_monthly_spending", _this_month())), text_reply("42.00 EUR.")]

    response = auth_client.post(
        CONVERSATIONS,
        {
            "message": "How much did I spend?",
            "user_id": other_user.id,
            "user": other_user.id,
            "email": other_user.email,
        },
        format="json",
    )

    assert response.status_code == 201
    conversation = AssistantConversation.objects.get(pk=response.json()["conversation"]["id"])
    assert conversation.user == user
    [result] = sent_tool_results(fake_model.requests[1])
    assert result["content"]["total_expenses"] == "42.00"  # the signed-in user's, not 999.00
    sent = json.dumps(fake_model.requests, default=str)
    assert "999.00" not in sent and other_user.email not in sent and "Theirs" not in sent


@pytest.mark.django_db
def test_the_conversation_to_continue_cannot_be_chosen_in_the_body(auth_client, other_auth_client, fake_model):
    theirs = _start(other_auth_client, fake_model, "Their secret", "Their answer")["conversation"]["id"]
    fake_model.script = [text_reply("Fresh answer.")]
    before = len(fake_model.requests)  # their own question is in the record; ours come after it

    body = auth_client.post(
        CONVERSATIONS, {"message": "Hello", "conversation": theirs, "conversation_id": theirs}, format="json"
    ).json()

    assert body["conversation"]["id"] != theirs  # a new conversation of its own
    assert AssistantMessage.objects.filter(conversation_id=theirs).count() == 2
    assert [m["content"] for m in body["messages"]] == ["Hello", "Fresh answer."]
    # What the model got contains nothing of the other user's conversation.
    assert len(fake_model.requests) == before + 1
    assert "Their secret" not in json.dumps(fake_model.requests[before:], default=str)


@pytest.mark.django_db
def test_asking_requires_signing_in(api_client, fake_model):
    assert api_client.post(CONVERSATIONS, {"message": "Hi"}, format="json").status_code == 401
    assert api_client.get(CONVERSATIONS).status_code == 401
    assert api_client.get(STATUS).status_code == 401
    assert fake_model.requests == []


# --- Limits are settings -------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_the_question_limit_is_a_setting(auth_client, fake_model, settings):
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "MAX_QUESTION_LENGTH": 20}

    assert auth_client.get(STATUS).json()["max_question_length"] == 20
    response = auth_client.post(CONVERSATIONS, {"message": "x" * 21}, format="json")

    assert response.status_code == 400
    assert response.json() == {"message": ["Ensure this field has no more than 20 characters."]}
    assert fake_model.requests == []


# --- The same API with Gemini ------------------------------------------------------------------------------


@pytest.mark.django_db
def test_asking_with_gemini_end_to_end(user, auth_client, fake_gemini, food_spending):
    fake_gemini.script = [
        gemini_tool_calls(("get_monthly_spending", _this_month())),
        gemini_text("You spent 42.00 EUR on **Food**.", prompt_tokens=300, output_tokens=25),
    ]

    response = auth_client.post(CONVERSATIONS, {"message": "What did I spend the most on?"}, format="json")

    assert response.status_code == 201, response.content
    body = response.json()
    assert body["messages"][1]["content"] == "You spent 42.00 EUR on **Food**."
    assert body["messages"][1]["sources"][0]["tool"] == "get_monthly_spending"
    assert [card["type"] for card in body["messages"][1]["insights"]] == ["total_spending", "largest_category"]
    assert body["usage"] == {"input_tokens": 400, "output_tokens": 45}  # 2 calls: 100 + 300 in, 20 + 25 out
    assert AssistantConversation.objects.get().user == user


@pytest.mark.django_db
@pytest.mark.parametrize(
    "failure",
    [
        genai_errors.ServerError(503, {"error": {"code": 503, "message": "overloaded", "status": "UNAVAILABLE"}}),
        genai_errors.ClientError(
            400, {"error": {"code": 400, "message": "API key not valid", "status": "INVALID_ARGUMENT"}}
        ),
        TimeoutError("timed out"),
    ],
)
def test_when_gemini_fails_the_apps_get_a_safe_error_and_nothing_is_stored(auth_client, fake_gemini, failure):
    fake_gemini.script = [failure]

    response = auth_client.post(CONVERSATIONS, {"message": "What did I spend?"}, format="json")

    assert response.status_code == 503
    assert response.json() == {
        "detail": "The assistant is temporarily unavailable. Please try again in a moment.",
        "code": "assistant_unavailable",
    }
    assert "API key" not in response.content.decode()
    assert not AssistantConversation.objects.exists() and not AssistantMessage.objects.exists()


@pytest.mark.django_db
def test_gemini_quota_exhaustion_says_the_assistant_is_busy(auth_client, fake_gemini):
    quota = genai_errors.ClientError(429, {"error": {"code": 429, "message": "Quota", "status": "RESOURCE_EXHAUSTED"}})
    fake_gemini.script = [quota]

    response = auth_client.post(CONVERSATIONS, {"message": "What did I spend?"}, format="json")

    assert response.status_code == 503
    assert response.json()["detail"] == "The assistant is busy right now. Please try again in a minute."


@pytest.mark.django_db
def test_without_the_providers_key_nothing_reaches_gemini(auth_client, fake_gemini, settings):
    """The settings switch the assistant off without the chosen provider's key (tests/test_ai_settings.py);
    then no question is ever sent to the provider."""
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "ENABLED": False}

    assert auth_client.get(STATUS).json()["available"] is False
    assert auth_client.post(CONVERSATIONS, {"message": "Hi"}, format="json").status_code == 503
    assert FakeGemini.requests == []
