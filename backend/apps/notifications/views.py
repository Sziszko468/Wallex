from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.pagination import StandardPagination
from apps.common.permissions import IsOwner

from . import services
from .filters import NotificationFilter
from .models import Device, Notification
from .openapi import (
    DEVICE_VIEWSET_SCHEMA,
    MARK_ALL_READ_SCHEMA,
    NOTIFICATION_PREFERENCES_SCHEMA,
    NOTIFICATION_VIEWSET_SCHEMA,
    UNREAD_COUNT_SCHEMA,
)
from .serializers import DeviceSerializer, NotificationPreferenceSerializer, NotificationSerializer


@DEVICE_VIEWSET_SCHEMA
class DeviceViewSet(
    mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    """The signed-in user's push-capable devices.

    POST registers (or refreshes) the calling device and is idempotent on the
    push token; DELETE is called by the app on logout.
    """

    # Only the model matters here (schema tooling); requests always go through get_queryset().
    queryset = Device.objects.none()
    serializer_class = DeviceSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        return Device.objects.filter(user=self.request.user)

    def create(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        device, created = services.register_device(request.user, **serializer.validated_data)
        return Response(
            self.get_serializer(device).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


@NOTIFICATION_VIEWSET_SCHEMA
class NotificationViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    """The signed-in user's in-app notifications, newest first.

    Read-only apart from the read state: notifications are only ever created by the
    server's rules (apps/notifications/rules.py). No DELETE: the stored row is also what
    stops the same event from notifying again.
    """

    # Only the model matters here (schema tooling); requests always go through get_queryset().
    queryset = Notification.objects.none()
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    pagination_class = StandardPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = NotificationFilter
    http_method_names = ["get", "post", "patch", "head", "options"]
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        return services.inbox(self.request.user)

    @UNREAD_COUNT_SCHEMA
    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"unread_count": services.unread_count(request.user)})

    @MARK_ALL_READ_SCHEMA
    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        return Response({"marked": services.mark_all_read(request.user)})


@NOTIFICATION_PREFERENCES_SCHEMA
class NotificationPreferenceView(generics.RetrieveUpdateAPIView):
    serializer_class = NotificationPreferenceSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return services.get_preferences(self.request.user)
