from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.concurrency import ConditionalWriteMixin
from apps.common.permissions import IsOwner

from . import services
from .models import Subscription
from .openapi import SUBSCRIPTION_VIEWSET_SCHEMA, SUMMARY_SCHEMA
from .serializers import SubscriptionSerializer, SubscriptionSummarySerializer

STATUS_ORDER = {services.Status.ACTIVE: 0, services.Status.PAUSED: 1, services.Status.ENDED: 2}


@SUBSCRIPTION_VIEWSET_SCHEMA
class SubscriptionViewSet(ConditionalWriteMixin, viewsets.ModelViewSet):
    # Only the model matters here (schema tooling); requests always go through get_queryset().
    queryset = Subscription.objects.none()
    serializer_class = SubscriptionSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        return Subscription.objects.filter(user=self.request.user).select_related("category")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        user = getattr(self.request, "user", None)
        if user is not None and user.is_authenticated:
            # One date and one set of exchange rates for every subscription in the response.
            today = timezone.localdate()
            context["today"] = today
            context["converter"] = services.Converter(user.base_currency, today)
        return context

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        # "Ended" is computed, so the database can't sort by it: stable re-sort keeps name order per group.
        response.data = sorted(response.data, key=lambda item: STATUS_ORDER[item["status"]])
        return response

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @SUMMARY_SCHEMA
    @action(detail=False, methods=["get"])
    def summary(self, request):
        summary = services.get_summary(request.user, timezone.localdate())
        return Response(SubscriptionSummarySerializer(summary).data)
