"""Asking within a stored conversation: the history sent along, limits, saving the exchange.

The server owns the history. Clients send only the new question, so nobody can put words in
the assistant's mouth — or fake tool results — by editing earlier turns. The limits (question
length, history sent, messages per conversation) are settings: AI_ASSISTANT[...].
"""

from dataclasses import dataclass
from datetime import date

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from ..models import AssistantConversation, AssistantMessage, AssistantRole
from . import engine
from .providers import Usage

TITLE_LENGTH = 80


class ConversationFullError(Exception):
    pass


class ConversationGoneError(Exception):
    """Deleted (e.g. on another device) while the answer was being prepared."""


@dataclass(frozen=True)
class Exchange:
    conversation: AssistantConversation
    question: AssistantMessage
    answer: AssistantMessage
    usage: Usage


def max_question_length() -> int:
    return settings.AI_ASSISTANT["MAX_QUESTION_LENGTH"]


def make_title(question: str) -> str:
    title = " ".join(question.split())
    return title if len(title) <= TITLE_LENGTH else title[: TITLE_LENGTH - 1].rstrip() + "…"


def _history(conversation: AssistantConversation) -> list[dict]:
    # Earlier messages sent with a new question (an even number: question + answer pairs).
    latest = list(conversation.messages.order_by("-created_at", "-id")[: settings.AI_ASSISTANT["HISTORY_MESSAGES"]])
    history = [{"role": message.role, "content": message.content} for message in reversed(latest)]
    while history and history[0]["role"] != AssistantRole.USER:  # the model's input starts with a question
        history.pop(0)
    return history


def ask(user, question: str, conversation: AssistantConversation | None = None, today: date | None = None) -> Exchange:
    """Answers `question` (in `conversation`, or in a new one) and stores both.

    Nothing is stored when there is no answer (engine raises AssistantError): the client keeps
    the question and can simply send it again.
    """
    history = []
    if conversation is not None:
        # A conversation holds up to MAX_MESSAGES / 2 questions and answers; after that, a new one starts afresh.
        if conversation.messages.count() + 2 > settings.AI_ASSISTANT["MAX_MESSAGES"]:
            raise ConversationFullError
        history = _history(conversation)

    # The model call takes seconds: outside any database transaction.
    result = engine.answer(user, history, question, today or timezone.localdate())

    with transaction.atomic():
        if conversation is None:
            conversation = AssistantConversation.objects.create(user=user, title=make_title(question))
        else:
            conversation = AssistantConversation.objects.select_for_update().filter(pk=conversation.pk).first()
            if conversation is None:
                raise ConversationGoneError
            conversation.save(update_fields=["updated_at"])  # moves it to the top of the history
        asked = AssistantMessage.objects.create(conversation=conversation, role=AssistantRole.USER, content=question)
        answered = AssistantMessage.objects.create(
            conversation=conversation,
            role=AssistantRole.ASSISTANT,
            content=result.text,
            sources=result.sources,
            insights=result.insights,
            suggested_questions=result.suggested_questions,
        )
    return Exchange(conversation, asked, answered, result.usage)
