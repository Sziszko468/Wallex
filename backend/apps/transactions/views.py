from rest_framework import permissions, viewsets

from apps.common.permissions import IsOwner

from .filters import TransactionFilter
from .models import RecurringTransaction, Transaction
from .pagination import TransactionPagination
from .serializers import RecurringTransactionSerializer, TransactionSerializer


class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    pagination_class = TransactionPagination
    filterset_class = TransactionFilter
    search_fields = ["description"]
    ordering_fields = ["date", "amount", "created_at"]
    ordering = ["-date", "-created_at"]
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        return Transaction.objects.filter(user=self.request.user).select_related("category")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class RecurringTransactionViewSet(viewsets.ModelViewSet):
    serializer_class = RecurringTransactionSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        return RecurringTransaction.objects.filter(user=self.request.user).select_related("category")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
