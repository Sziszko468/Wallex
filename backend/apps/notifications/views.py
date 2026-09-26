from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.response import Response

from apps.common.permissions import IsOwner

from . import services
from .models import Device
from .openapi import DEVICE_VIEWSET_SCHEMA, NOTIFICATION_PREFERENCES_SCHEMA
from .serializers import DeviceSerializer, NotificationPreferenceSerializer


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


@NOTIFICATION_PREFERENCES_SCHEMA
class NotificationPreferenceView(generics.RetrieveUpdateAPIView):
    serializer_class = NotificationPreferenceSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return services.get_preferences(self.request.user)
