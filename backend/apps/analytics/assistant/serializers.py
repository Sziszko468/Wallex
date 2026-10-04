from rest_framework import serializers

from ..models import AssistantConversation, AssistantMessage, AssistantRole
from .cards import CARD_TYPES, TONE_CHOICES, describe
from .conversations import max_question_length
from .tools import TOOLS, describe_source

TOOL_CHOICES = [(name, name) for name in TOOLS]
DEFAULT_MAX_QUESTION_LENGTH = 1000


def _question_field(max_length: int) -> serializers.CharField:
    return serializers.CharField(
        max_length=max_length,
        help_text=f"The user's question (max {max_length} characters by default; `max_question_length` of GET /api/assistant/ says).",
    )


class QuestionSerializer(serializers.Serializer):
    """Only the text: who asks comes from the signed-in user, never from the request body
    (a `user_id` or similar in it is ignored)."""

    message = _question_field(DEFAULT_MAX_QUESTION_LENGTH)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # The limit is a setting (AI_ASSISTANT_MAX_QUESTION_LENGTH), read per request.
        self.fields["message"] = _question_field(max_question_length())


class DataSourceSerializer(serializers.Serializer):
    """One backend tool an answer is based on."""

    tool = serializers.ChoiceField(choices=TOOL_CHOICES)
    label = serializers.CharField(help_text="What to show, e.g. `Spending by category`.")
    detail = serializers.CharField(
        allow_null=True, help_text="The period or name it was about, e.g. `September 2026 vs August 2026`; or `null`."
    )

    def to_representation(self, source):
        label, detail = describe_source(source)
        return {"tool": source.get("tool", ""), "label": label, "detail": detail}


class AssistantInsightSerializer(serializers.Serializer):
    """A small card computed by the backend from the figures the answer rests on (never by the model)."""

    type = serializers.ChoiceField(choices=CARD_TYPES)
    label = serializers.CharField(help_text="What the card is about, e.g. `Largest category`.")
    detail = serializers.CharField(
        allow_null=True, help_text="Which category, goal or period it is about, e.g. `Food`; or `null`."
    )
    amount = serializers.CharField(
        allow_null=True,
        help_text="The card's main amount as a decimal string in `currency` (signed for changes); or `null`.",
    )
    currency = serializers.CharField(allow_null=True, help_text="ISO code of `amount`; `null` without an amount.")
    percentage = serializers.FloatField(
        allow_null=True, help_text="A share, change or progress in percent; or `null` (e.g. no earlier value)."
    )
    tone = serializers.ChoiceField(choices=TONE_CHOICES, help_text="How to colour the card; never the only signal.")

    def to_representation(self, card):
        return describe(card)


class AssistantMessageSerializer(serializers.ModelSerializer):
    role = serializers.ChoiceField(choices=AssistantRole.choices)
    content = serializers.CharField(
        help_text="The question, or the answer as plain text with light Markdown (`**bold**`, `- ` list items)."
    )
    sources = DataSourceSerializer(
        many=True, help_text="Answers: the backend data the answer is based on (empty for questions and refusals)."
    )
    insights = AssistantInsightSerializer(
        many=True, help_text="Answers: up to 3 cards with the key figures (empty for questions and refusals)."
    )
    suggested_questions = serializers.ListField(
        child=serializers.CharField(),
        help_text="Answers: up to 3 follow-up questions to offer (show them under the latest answer only).",
    )

    class Meta:
        model = AssistantMessage
        fields = ["id", "role", "content", "sources", "insights", "suggested_questions", "created_at"]
        read_only_fields = fields


class ConversationSerializer(serializers.ModelSerializer):
    title = serializers.CharField(help_text="The first question, shortened.")

    class Meta:
        model = AssistantConversation
        fields = ["id", "title", "created_at", "updated_at"]
        read_only_fields = fields


class ConversationDetailSerializer(ConversationSerializer):
    messages = AssistantMessageSerializer(many=True, help_text="Oldest first.")

    class Meta(ConversationSerializer.Meta):
        fields = [*ConversationSerializer.Meta.fields, "messages"]
        read_only_fields = fields


class AssistantUsageSerializer(serializers.Serializer):
    input_tokens = serializers.IntegerField(help_text="Tokens sent to the model, all calls of this answer together.")
    output_tokens = serializers.IntegerField(help_text="Tokens the model wrote (thinking included).")


class ExchangeSerializer(serializers.Serializer):
    """A question and its answer, just stored."""

    conversation = ConversationSerializer()
    messages = AssistantMessageSerializer(many=True, help_text="The question, then the answer.")
    usage = AssistantUsageSerializer(help_text="What this answer cost in model tokens (not stored).")

    def to_representation(self, exchange):
        return super().to_representation(
            {
                "conversation": exchange.conversation,
                "messages": [exchange.question, exchange.answer],
                "usage": {
                    "input_tokens": exchange.usage.input_tokens,
                    "output_tokens": exchange.usage.output_tokens,
                },
            }
        )
