"""The assistant's HTTP API: one for web, iOS and Android."""

from datetime import timedelta
from decimal import Decimal

import anthropic
import httpx2
import pytest
from django.utils import timezone
from rest_framework.throttling import ScopedRateThrottle

from apps.analytics.assistant import conversations, engine
from apps.analytics.conftest import text_reply, tool_call_reply
from apps.analytics.models import AssistantConversation, AssistantMessage
from apps.budgets.models import SavingsGoal
from apps.transactions.models import Transaction

STATUS = "/api/assistant/"
CONVERSATIONS = "/api/assistant/conversations/"


def _messages_url(conversation_id: int) -> str:
    return f"{CONVERSATIONS}{conversation_id}/messages/"


def _this_month() -> dict:
    today = timezone.localdate()
    return {"year": today.year, "month": today.month}


def _start(auth_client, fake_model, question="What did I spend the most on?", answer="On **Food**."):
    fake_model.script.append(text_reply(answer))
    response = auth_client.post(CONVERSATIONS, {"message": question}, format="json")
    assert response.status_code == 201, response.content
    return response.json()


# --- Status and suggestions ---------------------------------------------------------------------


@pytest.mark.django_db
def test_without_an_api_key_the_assistant_is_unavailable(auth_client, settings):
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "ENABLED": False}

    assert auth_client.get(STATUS).json() == {
        "available": False,
        "suggested_questions": [],
        "max_question_length": 1000,
    }


@pytest.mark.django_db
def test_a_new_user_gets_general_suggestions(auth_client, fake_model):
    body = auth_client.get(STATUS).json()

    assert body["available"] is True
    assert body["suggested_questions"] == [
        "What did I spend the most on this month?",
        "Where did I spend more than last month?",
        "Which of my subscriptions costs the most?",
        "Am I staying within my budgets this month?",
    ]


@pytest.mark.django_db
def test_suggestions_follow_the_users_own_data(user, auth_client, fake_model, food_category):
    today = timezone.localdate()
    Transaction.objects.create(user=user, category=food_category, type="expense", amount=Decimal("10.00"), date=today)
    Transaction.objects.create(
        user=user,
        category=food_category,
        type="expense",
        amount=Decimal("10.00"),
        date=today.replace(day=1) - timedelta(days=3),
    )
    SavingsGoal.objects.create(user=user, name="Japan trip", target_amount=Decimal("3000.00"))

    questions = auth_client.get(STATUS).json()["suggested_questions"]

    assert questions[:5] == [
        "What did I spend the most on this month?",
        "Why did my spending change compared to last month?",
        "Where did I spend more than last month?",
        "How much did I spend on Food this month?",
        "How am I doing with my Japan trip savings goal?",
    ]
    assert len(questions) == 6


# --- Asking --------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_asking_starts_a_conversation_and_stores_both_messages(user, auth_client, fake_model, food_category):
    Transaction.objects.create(
        user=user, category=food_category, type="expense", amount=Decimal("42.00"), date=timezone.localdate()
    )
    fake_model.script = [
        tool_call_reply(("get_monthly_spending", _this_month())),
        text_reply("You spent 42.00 EUR on **Food**."),
    ]

    response = auth_client.post(
        CONVERSATIONS, {"message": "  What did I spend the most on this month?  "}, format="json"
    )

    assert response.status_code == 201
    body = response.json()
    assert body["conversation"]["title"] == "What did I spend the most on this month?"
    question, answer = body["messages"]
    assert (question["role"], question["content"], question["sources"]) == (
        "user",
        "What did I spend the most on this month?",
        [],
    )
    assert (answer["role"], answer["content"]) == ("assistant", "You spent 42.00 EUR on **Food**.")
    today = timezone.localdate()
    assert answer["sources"] == [
        {"tool": "get_monthly_spending", "label": "Monthly spending", "detail": today.strftime("%B %Y")}
    ]
    conversation = AssistantConversation.objects.get(pk=body["conversation"]["id"])
    assert conversation.user == user
    assert list(conversation.messages.values_list("role", flat=True)) == ["user", "assistant"]
    # Only the text and which tools were used are kept — never the figures the tools returned.
    assert conversation.messages.get(role="assistant").sources == [
        {"tool": "get_monthly_spending", "arguments": _this_month()}
    ]


@pytest.mark.django_db
def test_a_follow_up_sends_the_history_and_moves_the_conversation_up(auth_client, fake_model):
    first = _start(auth_client, fake_model, "How much on food?", "42.00 EUR.")
    other = _start(auth_client, fake_model, "Something else", "OK.")
    fake_model.script = [text_reply("Transport: 0.00 EUR.")]

    response = auth_client.post(
        _messages_url(first["conversation"]["id"]), {"message": "And on transport?"}, format="json"
    )

    assert response.status_code == 201
    assert [message["content"] for message in response.json()["messages"]] == [
        "And on transport?",
        "Transport: 0.00 EUR.",
    ]
    assert fake_model.requests[-1]["messages"] == [
        {"role": "user", "content": "How much on food?"},
        {"role": "assistant", "content": "42.00 EUR."},
        {"role": "user", "content": "And on transport?"},
    ]
    listed = auth_client.get(CONVERSATIONS).json()["results"]
    assert [row["id"] for row in listed] == [first["conversation"]["id"], other["conversation"]["id"]]


@pytest.mark.django_db
def test_only_the_latest_history_is_sent(auth_client, fake_model, monkeypatch):
    monkeypatch.setattr(conversations, "HISTORY_MESSAGES", 2)
    started = _start(auth_client, fake_model, "Q1", "A1")
    fake_model.script = [text_reply("A2"), text_reply("A3")]
    auth_client.post(_messages_url(started["conversation"]["id"]), {"message": "Q2"}, format="json")

    auth_client.post(_messages_url(started["conversation"]["id"]), {"message": "Q3"}, format="json")

    assert [message["content"] for message in fake_model.requests[-1]["messages"]] == ["Q2", "A2", "Q3"]


@pytest.mark.django_db
def test_a_full_conversation_refuses_more_questions(auth_client, fake_model, monkeypatch):
    monkeypatch.setattr(conversations, "MAX_MESSAGES", 2)
    started = _start(auth_client, fake_model)

    response = auth_client.post(_messages_url(started["conversation"]["id"]), {"message": "More?"}, format="json")

    assert response.status_code == 400
    assert response.json() == {"non_field_errors": ["This conversation is full. Start a new conversation to ask more."]}
    assert len(fake_model.requests) == 1


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("payload", "errors"),
    [
        ({}, {"message": ["This field is required."]}),
        ({"message": "   "}, {"message": ["This field may not be blank."]}),
        ({"message": "x" * 1001}, {"message": ["Ensure this field has no more than 1000 characters."]}),
    ],
)
def test_invalid_questions_never_reach_the_model(auth_client, fake_model, payload, errors):
    response = auth_client.post(CONVERSATIONS, payload, format="json")

    assert response.status_code == 400
    assert response.json() == errors
    assert fake_model.requests == [] and not AssistantConversation.objects.exists()


@pytest.mark.django_db
def test_without_an_api_key_asking_is_refused(auth_client, settings):
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "ENABLED": False}

    response = auth_client.post(CONVERSATIONS, {"message": "Hi"}, format="json")

    assert response.status_code == 503
    assert response.json() == {
        "detail": "The AI assistant isn't set up on this server.",
        "code": "assistant_not_configured",
    }


@pytest.mark.django_db
def test_when_the_model_fails_nothing_is_stored(auth_client, fake_model):
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    fake_model.script = [anthropic.APIConnectionError(request=request)]

    response = auth_client.post(CONVERSATIONS, {"message": "What did I spend?"}, format="json")

    assert response.status_code == 503
    assert response.json() == {
        "detail": "The assistant is temporarily unavailable. Please try again in a moment.",
        "code": "assistant_unavailable",
    }
    assert not AssistantConversation.objects.exists() and not AssistantMessage.objects.exists()


@pytest.mark.django_db
def test_a_conversation_deleted_while_answering_is_not_revived(auth_client, fake_model, monkeypatch):
    started = _start(auth_client, fake_model)
    conversation_id = started["conversation"]["id"]

    def answer_after_deletion(*args, **kwargs):
        AssistantConversation.objects.filter(pk=conversation_id).delete()  # e.g. on another device
        return engine.Answer("Too late.")

    monkeypatch.setattr(engine, "answer", answer_after_deletion)

    response = auth_client.post(_messages_url(conversation_id), {"message": "Still there?"}, format="json")

    assert response.status_code == 404
    assert not AssistantMessage.objects.exists()


# --- History ---------------------------------------------------------------------------------


@pytest.mark.django_db
def test_list_retrieve_and_delete(auth_client, fake_model):
    started = _start(auth_client, fake_model)
    conversation_id = started["conversation"]["id"]

    listed = auth_client.get(CONVERSATIONS).json()
    assert listed["count"] == 1 and listed["results"][0] == started["conversation"]

    detail = auth_client.get(f"{CONVERSATIONS}{conversation_id}/").json()
    assert [message["role"] for message in detail["messages"]] == ["user", "assistant"]
    assert detail["messages"] == started["messages"]

    assert auth_client.delete(f"{CONVERSATIONS}{conversation_id}/").status_code == 204
    assert not AssistantMessage.objects.exists()
    assert auth_client.get(f"{CONVERSATIONS}{conversation_id}/").status_code == 404


@pytest.mark.django_db
def test_conversations_cannot_be_edited(auth_client, fake_model):
    conversation_id = _start(auth_client, fake_model)["conversation"]["id"]

    assert auth_client.patch(f"{CONVERSATIONS}{conversation_id}/", {"title": "x"}, format="json").status_code == 405
    assert auth_client.put(f"{CONVERSATIONS}{conversation_id}/", {"title": "x"}, format="json").status_code == 405


@pytest.mark.django_db
def test_other_users_conversations_are_invisible(auth_client, other_auth_client, fake_model):
    theirs = _start(other_auth_client, fake_model, "My secret question", "Secret answer")["conversation"]["id"]
    requests_before = len(fake_model.requests)

    assert auth_client.get(CONVERSATIONS).json()["results"] == []
    assert auth_client.get(f"{CONVERSATIONS}{theirs}/").status_code == 404
    assert auth_client.post(_messages_url(theirs), {"message": "Tell me"}, format="json").status_code == 404
    assert auth_client.delete(f"{CONVERSATIONS}{theirs}/").status_code == 404

    assert len(fake_model.requests) == requests_before  # the model was never asked
    assert AssistantMessage.objects.filter(conversation_id=theirs).count() == 2


# --- Rate limit ----------------------------------------------------------------------------


@pytest.mark.django_db
def test_questions_are_rate_limited_reading_is_not(auth_client, fake_model, monkeypatch):
    monkeypatch.setattr(
        ScopedRateThrottle, "THROTTLE_RATES", {**ScopedRateThrottle.THROTTLE_RATES, "assistant": "2/hour"}
    )
    started = _start(auth_client, fake_model)
    _start(auth_client, fake_model)

    third = auth_client.post(_messages_url(started["conversation"]["id"]), {"message": "Again"}, format="json")

    assert third.status_code == 429
    assert len(fake_model.requests) == 2
    for _ in range(3):
        assert auth_client.get(CONVERSATIONS).status_code == 200
        assert auth_client.get(STATUS).status_code == 200


def test_titles_are_shortened():
    assert conversations.make_title("How   much\ndid I spend?") == "How much did I spend?"
    long_title = conversations.make_title("word " * 40)
    assert len(long_title) == conversations.TITLE_LENGTH and long_title.endswith("…")


@pytest.mark.django_db
def test_deleting_the_user_deletes_their_conversations(user, auth_client, fake_model):
    _start(auth_client, fake_model)

    user.delete()

    assert not AssistantConversation.objects.exists() and not AssistantMessage.objects.exists()
