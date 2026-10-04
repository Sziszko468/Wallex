"""OpenAPI documentation for the AI finance assistant."""

from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema, extend_schema_view, inline_serializer
from rest_framework import serializers

from apps.common.openapi import error_response, validation_error

from .serializers import (
    DEFAULT_MAX_QUESTION_LENGTH,
    ConversationDetailSerializer,
    ConversationSerializer,
    ExchangeSerializer,
    QuestionSerializer,
)

TAG = "AI Assistant"
ERROR_CODE_CHOICES = [
    ("assistant_unavailable", "assistant_unavailable"),
    ("assistant_not_configured", "assistant_not_configured"),
]
# The documented defaults of the AI_ASSISTANT_* limits (settings).
MAX_QUESTION_LENGTH = DEFAULT_MAX_QUESTION_LENGTH
MAX_QUESTIONS = 25

_HOW = f"""The assistant never reads the database. It can only call seven read-only backend tools
— monthly spending, spending by category, by merchant, budget status, subscription costs, savings
progress and month comparison — which run the same services as the dashboard, for the signed-in
user only, and return aggregated figures without ids, name or e-mail. **The numbers are calculated
by Python/PostgreSQL; the model only explains them.** Answers are based on those results alone;
when they are not enough, the answer says so ("Nem áll rendelkezésre elegendő adat." /
"There isn't enough data available.") instead of guessing. `sources` lists the tools an answer
used; `insights` are cards with the key figures, computed by the backend from the same results;
`suggested_questions` are follow-ups to offer under the latest answer.

The model is a provider behind the backend (Gemini by default, Claude optional; chosen with
`AI_ASSISTANT_PROVIDER`) — its API key never leaves the server and the apps never see which one
answered. The server keeps the history (the text of questions and answers; never the tool results
— every question fetches fresh figures). Who asks always comes from the access token: a `user_id`
in the body is ignored. Questions: max {MAX_QUESTION_LENGTH} characters by default
(`AI_ASSISTANT_MAX_QUESTION_LENGTH`); a conversation holds {MAX_QUESTIONS} questions.
**Answering takes a few seconds, up to about 90**: use a long client timeout and show progress.
Nothing is stored when no answer comes back (`503`) — send the question again.
Limited to 30 questions per hour per user (`AI_ASSISTANT_RATE`)."""

_ANSWER = {
    "id": 18,
    "role": "assistant",
    "content": "You spent the most on **Food**: €412.30 this month, 38% of your €1,085.10 expenses.",
    "sources": [{"tool": "get_monthly_spending", "label": "Monthly spending", "detail": "September 2026"}],
    "insights": [
        {
            "type": "total_spending",
            "label": "Total spending",
            "detail": "September 2026",
            "amount": "1085.10",
            "currency": "EUR",
            "percentage": None,
            "tone": "neutral",
        },
        {
            "type": "largest_category",
            "label": "Largest category",
            "detail": "Food",
            "amount": "412.30",
            "currency": "EUR",
            "percentage": 38.0,
            "tone": "neutral",
        },
    ],
    "suggested_questions": [
        "How much did I spend on Food last month?",
        "How does that compare to the previous month?",
        "What are my biggest expense categories?",
    ],
    "created_at": "2026-09-29T10:15:08.412311Z",
}
_QUESTION = {
    "id": 17,
    "role": "user",
    "content": "What did I spend the most on this month?",
    "sources": [],
    "insights": [],
    "suggested_questions": [],
    "created_at": "2026-09-29T10:15:08.410552Z",
}
_CONVERSATION = {
    "id": 5,
    "title": "What did I spend the most on this month?",
    "created_at": "2026-09-29T10:15:08.405118Z",
    "updated_at": "2026-09-29T10:15:08.405164Z",
}

_UNAVAILABLE = OpenApiResponse(
    inline_serializer(
        "AssistantError",
        {
            "detail": serializers.CharField(help_text="Safe to show to the user."),
            "code": serializers.ChoiceField(
                choices=ERROR_CODE_CHOICES,
                help_text="`assistant_unavailable`: no answer this time (model API down or busy, too slow) — "
                "retry. `assistant_not_configured`: the server has no API key for the chosen provider — retrying won't help.",
            ),
        },
    ),
    description="No answer; nothing was stored.",
    examples=[
        OpenApiExample(
            "Unavailable",
            value={
                "detail": "The assistant is temporarily unavailable. Please try again in a moment.",
                "code": "assistant_unavailable",
            },
        ),
        OpenApiExample(
            "Not configured",
            value={"detail": "The AI assistant isn't set up on this server.", "code": "assistant_not_configured"},
        ),
    ],
)

_QUESTION_ERRORS = (
    ("Missing", {"message": ["This field is required."]}),
    ("Empty", {"message": ["This field may not be blank."]}),
    ("Too long", {"message": [f"Ensure this field has no more than {MAX_QUESTION_LENGTH} characters."]}),
)

_ASK_EXAMPLE = OpenApiExample(
    "Question", request_only=True, value={"message": "What did I spend the most on this month?"}
)
_EXCHANGE_EXAMPLE = OpenApiExample(
    "Answered",
    response_only=True,
    value={
        "conversation": _CONVERSATION,
        "messages": [_QUESTION, _ANSWER],
        "usage": {"input_tokens": 2310, "output_tokens": 164},
    },
)

ASSISTANT_STATUS_SCHEMA = extend_schema(
    tags=[TAG],
    summary="Assistant status and suggested questions",
    description=(
        "Whether the assistant can be used on this server (`available` is false without the provider's API key), "
        "questions to suggest — picked from what data the user has, e.g. a question about their own savings "
        "goal — and the question length limit.\n\n" + _HOW
    ),
    responses={
        200: OpenApiResponse(
            inline_serializer(
                "AssistantStatus",
                {
                    "available": serializers.BooleanField(),
                    "suggested_questions": serializers.ListField(
                        child=serializers.CharField(), help_text="Up to 6; empty when not available."
                    ),
                    "max_question_length": serializers.IntegerField(),
                },
            ),
            examples=[
                OpenApiExample(
                    "Available",
                    value={
                        "available": True,
                        "suggested_questions": [
                            "What did I spend the most on this month?",
                            "Where did I spend more than last month?",
                            "Which of my subscriptions costs the most?",
                            "How am I doing with my Japan trip savings goal?",
                        ],
                        "max_question_length": MAX_QUESTION_LENGTH,
                    },
                )
            ],
        )
    },
)

ASSISTANT_CONVERSATION_SCHEMA = extend_schema_view(
    list=extend_schema(
        tags=[TAG],
        summary="List conversations",
        description="The conversation history, most recently active first, **paginated** (`count`, `next`, `previous`, `results`).",
        responses={
            200: OpenApiResponse(ConversationSerializer(many=True)),
            404: error_response("`page` is past the last page.", ("Past the end", {"detail": "Invalid page."})),
        },
        examples=[
            OpenApiExample(
                "Page",
                response_only=True,
                value={"count": 1, "next": None, "previous": None, "results": [_CONVERSATION]},
            )
        ],
    ),
    retrieve=extend_schema(
        tags=[TAG],
        summary="Get a conversation",
        description="The conversation with all its messages, oldest first.",
        responses={200: ConversationDetailSerializer},
        examples=[
            OpenApiExample(
                "Conversation", response_only=True, value={**_CONVERSATION, "messages": [_QUESTION, _ANSWER]}
            )
        ],
    ),
    create=extend_schema(
        tags=[TAG],
        summary="Ask a question in a new conversation",
        description="Starts a conversation with its first question and returns the question and the answer.\n\n" + _HOW,
        request=QuestionSerializer,
        responses={
            201: OpenApiResponse(ExchangeSerializer, description="Answered; the conversation was created."),
            400: validation_error(*_QUESTION_ERRORS),
            503: _UNAVAILABLE,
        },
        examples=[_ASK_EXAMPLE, _EXCHANGE_EXAMPLE],
    ),
    destroy=extend_schema(
        tags=[TAG],
        summary="Delete a conversation",
        description="Deletes the conversation and its messages on every device.",
        responses={204: None},
    ),
    messages=extend_schema(
        tags=[TAG],
        summary="Ask a follow-up question",
        description=(
            "Asks in an existing conversation; the earlier questions and answers go to the model as context. "
            "Returns the question and the answer.\n\n" + _HOW
        ),
        request=QuestionSerializer,
        responses={
            201: OpenApiResponse(ExchangeSerializer, description="Answered."),
            400: validation_error(
                *_QUESTION_ERRORS,
                (
                    "Conversation full",
                    {"non_field_errors": ["This conversation is full. Start a new conversation to ask more."]},
                ),
            ),
            503: _UNAVAILABLE,
        },
        examples=[_ASK_EXAMPLE, _EXCHANGE_EXAMPLE],
    ),
)
