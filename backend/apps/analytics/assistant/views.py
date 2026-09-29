from django.conf import settings
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.common.pagination import StandardPagination
from apps.common.permissions import IsOwner

from ..models import AssistantConversation
from . import conversations, suggestions
from .client import AssistantError
from .openapi import ASSISTANT_CONVERSATION_SCHEMA, ASSISTANT_STATUS_SCHEMA
from .serializers import ConversationDetailSerializer, ConversationSerializer, ExchangeSerializer, QuestionSerializer

NOT_CONFIGURED = "The AI assistant isn't set up on this server."


@ASSISTANT_STATUS_SCHEMA
class AssistantStatusView(APIView):
    """GET /api/assistant/ — whether the assistant can be used, and questions to suggest."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        available = settings.AI_ASSISTANT["ENABLED"]
        return Response(
            {
                "available": available,
                "suggested_questions": (
                    suggestions.suggested_questions(request.user, timezone.localdate()) if available else []
                ),
                "max_question_length": conversations.MAX_QUESTION_LENGTH,
            }
        )


@ASSISTANT_CONVERSATION_SCHEMA
class AssistantConversationViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    """The user's conversations. POST (a new conversation) and POST {id}/messages/ ask a question;
    the answer comes back in the same response. Conversations can't be edited, only deleted."""

    permission_classes = [permissions.IsAuthenticated, IsOwner]
    pagination_class = StandardPagination
    lookup_value_regex = r"\d+"
    queryset = AssistantConversation.objects.none()  # for schema generation; see get_queryset
    # Applied to asking only (see get_throttles): every question is a paid model call.
    throttle_scope = "assistant"

    def get_queryset(self):
        conversations_of_user = AssistantConversation.objects.filter(user=self.request.user)
        if self.action == "retrieve":
            return conversations_of_user.prefetch_related("messages")
        return conversations_of_user

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ConversationDetailSerializer
        if self.action in ("create", "messages"):
            return QuestionSerializer
        return ConversationSerializer

    def get_throttles(self):
        throttles = super().get_throttles()
        if self.action in ("create", "messages"):
            throttles.append(ScopedRateThrottle())
        return throttles

    def create(self, request):
        return self._ask(request, conversation=None)

    @action(detail=True, methods=["post"])
    def messages(self, request, pk=None):
        return self._ask(request, conversation=self.get_object())  # someone else's → 404 before anything runs

    def _ask(self, request, conversation):
        if not settings.AI_ASSISTANT["ENABLED"]:
            return Response(
                {"detail": NOT_CONFIGURED, "code": "assistant_not_configured"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        question = QuestionSerializer(data=request.data)
        question.is_valid(raise_exception=True)

        try:
            exchange = conversations.ask(request.user, question.validated_data["message"], conversation)
        except conversations.ConversationFullError:
            return Response(
                {"non_field_errors": ["This conversation is full. Start a new conversation to ask more."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except conversations.ConversationGoneError:
            raise NotFound
        except AssistantError as error:
            return Response(
                {"detail": str(error), "code": "assistant_unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        return Response(ExchangeSerializer(exchange).data, status=status.HTTP_201_CREATED)
