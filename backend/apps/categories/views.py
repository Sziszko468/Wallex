import unicodedata

from django.db.models import RestrictedError
from django.utils.translation import gettext_lazy as _
from rest_framework import permissions, status, viewsets
from rest_framework.response import Response

from apps.common.concurrency import ConditionalWriteMixin
from apps.common.permissions import IsOwner
from apps.users.audit import AuditedDeleteMixin

from .models import Category
from .openapi import CATEGORY_VIEWSET_SCHEMA
from .permissions import IsNotSystemCategory
from .serializers import CategorySerializer


def alphabetical_key(name: str) -> str:
    """Sorts ignoring case and accents, so "Élelmiszer" sits among the E's of a Hungarian list."""
    decomposed = unicodedata.normalize("NFKD", name.casefold())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


@CATEGORY_VIEWSET_SCHEMA
class CategoryViewSet(AuditedDeleteMixin, ConditionalWriteMixin, viewsets.ModelViewSet):
    # Only the model matters here (schema tooling); requests always go through get_queryset().
    queryset = Category.objects.none()
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner, IsNotSystemCategory]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        return Category.objects.filter(user=self.request.user)

    def list(self, request, *args, **kwargs):
        # The defaults are stored in English but shown translated: order what the person reads.
        response = super().list(request, *args, **kwargs)
        response.data = sorted(response.data, key=lambda category: alphabetical_key(category["name"]))
        return response

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
        except RestrictedError:
            return Response(
                {"detail": _("This category is used by existing transactions and cannot be deleted.")},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
