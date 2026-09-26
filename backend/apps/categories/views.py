from django.db.models import RestrictedError
from rest_framework import permissions, status, viewsets
from rest_framework.response import Response

from apps.common.permissions import IsOwner

from .models import Category
from .openapi import CATEGORY_VIEWSET_SCHEMA
from .permissions import IsNotSystemCategory
from .serializers import CategorySerializer


@CATEGORY_VIEWSET_SCHEMA
class CategoryViewSet(viewsets.ModelViewSet):
    # Only the model matters here (schema tooling); requests always go through get_queryset().
    queryset = Category.objects.none()
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner, IsNotSystemCategory]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        return Category.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
        except RestrictedError:
            return Response(
                {"detail": "This category is used by existing transactions and cannot be deleted."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
