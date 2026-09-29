from rest_framework import serializers

from ..models import AssistantConversation, AssistantMessage, AssistantRole
from .conversations import MAX_QUESTION_LENGTH
from .tools import TOOLS, describe_source

TOOL_CHOICES = [(name, name) for name in TOOLS]


class QuestionSerializer(serializers.Serializer):
    message = serializers.CharField(
        max_length=MAX_QUESTION_LENGTH, help_text=f"The user's question (max {MAX_QUESTION_LENGTH} characters)."
    )


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


class AssistantMessageSerializer(serializers.ModelSerializer):
    role = serializers.ChoiceField(choices=AssistantRole.choices)
    content = serializers.CharField(
        help_text="The question, or the answer as plain text with light Markdown (`**bold**`, `- ` list items)."
    )
    sources = DataSourceSerializer(
        many=True, help_text="Answers: the backend data the answer is based on (empty for questions and refusals)."
    )

    class Meta:
        model = AssistantMessage
        fields = ["id", "role", "content", "sources", "created_at"]
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


class ExchangeSerializer(serializers.Serializer):
    """A question and its answer, just stored."""

    conversation = ConversationSerializer()
    messages = AssistantMessageSerializer(many=True, help_text="The question, then the answer.")

    def to_representation(self, exchange):
        return super().to_representation(
            {"conversation": exchange.conversation, "messages": [exchange.question, exchange.answer]}
        )
