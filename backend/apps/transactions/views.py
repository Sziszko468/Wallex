import uuid

from django.conf import settings
from django.db import IntegrityError, transaction
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.categories.models import TransactionType
from apps.common.permissions import IsOwner
from apps.common.uploads import declared_body_exceeds, file_too_large
from apps.notifications.services import check_budget_thresholds

from .filters import StableOrderingFilter, TransactionFilter
from .models import RecurringTransaction, Transaction
from .openapi import CSV_IMPORT_SCHEMA, RECURRING_VIEWSET_SCHEMA, TRANSACTION_VIEWSET_SCHEMA
from .pagination import TransactionPagination
from .serializers import RecurringTransactionSerializer, TransactionSerializer
from .services import CsvValidationError, import_transactions_from_csv


@TRANSACTION_VIEWSET_SCHEMA
class TransactionViewSet(viewsets.ModelViewSet):
    # Only the model matters here (schema tooling); requests always go through get_queryset().
    queryset = Transaction.objects.none()
    serializer_class = TransactionSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    pagination_class = TransactionPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, StableOrderingFilter]
    filterset_class = TransactionFilter
    search_fields = ["description"]
    ordering_fields = ["date", "amount", "created_at"]
    ordering = ["-date", "-created_at"]
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        return Transaction.objects.filter(user=self.request.user).select_related("category")

    def create(self, request, *args, **kwargs):
        # Offline sync may re-send a transaction the server already stored (the
        # response was lost on the way back). Same client_id = same transaction:
        # answer 200 with the existing row instead of creating a duplicate.
        existing = self._find_by_client_id(request.data.get("client_id"))
        if existing is not None:
            return Response(self.get_serializer(existing).data, status=status.HTTP_200_OK)
        try:
            # Savepoint: if the unique constraint fires, only this insert is rolled
            # back and the lookup below can still run inside an outer transaction.
            with transaction.atomic():
                return super().create(request, *args, **kwargs)
        except IntegrityError:
            # Two concurrent requests with the same client_id: the other one won.
            existing = self._find_by_client_id(request.data.get("client_id"))
            if existing is None:
                raise
            return Response(self.get_serializer(existing).data, status=status.HTTP_200_OK)

    def _find_by_client_id(self, raw_client_id):
        if not raw_client_id:
            return None
        try:
            client_id = uuid.UUID(str(raw_client_id))
        except ValueError:
            return None  # the serializer reports the invalid value
        return self.get_queryset().filter(client_id=client_id).first()

    def perform_create(self, serializer):
        self._check_budgets(serializer.save(user=self.request.user))

    def perform_update(self, serializer):
        self._check_budgets(serializer.save())

    def _check_budgets(self, saved):
        if saved.type == TransactionType.EXPENSE:
            check_budget_thresholds(self.request.user, saved.date.year, saved.date.month)

    @CSV_IMPORT_SCHEMA
    @action(
        detail=False,
        methods=["post"],
        url_path="import",
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_csv(self, request):
        """POST /api/transactions/import/ — see apps/transactions/services.py
        for the full pipeline (file validation, parsing, dedup, category
        detection) and docs/api-contract.md for the expected CSV format."""
        limit = settings.CSV_IMPORT_MAX_BYTES
        if declared_body_exceeds(request, limit):
            return file_too_large("file", limit)

        uploaded_file = request.FILES.get("file")
        if uploaded_file is None:
            return Response({"file": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST)
        if uploaded_file.size > limit:
            return file_too_large("file", limit)
        if not uploaded_file.name.lower().endswith(".csv"):
            return Response(
                {"file": ["Please upload a .csv file."]}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            summary = import_transactions_from_csv(request.user, uploaded_file)
        except CsvValidationError as error:
            return Response({"file": [str(error)]}, status=status.HTTP_400_BAD_REQUEST)

        for year, month in sorted(summary.expense_months):
            check_budget_thresholds(request.user, year, month)

        return Response(
            {
                "imported": summary.imported,
                "skipped": summary.skipped,
                "failed": summary.failed,
                "details": [
                    {"row": item.row, "status": item.status, "reason": item.reason}
                    for item in summary.details
                ],
            },
            status=status.HTTP_200_OK,
        )


@RECURRING_VIEWSET_SCHEMA
class RecurringTransactionViewSet(viewsets.ModelViewSet):
    # Only the model matters here (schema tooling); requests always go through get_queryset().
    queryset = RecurringTransaction.objects.none()
    serializer_class = RecurringTransactionSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        return RecurringTransaction.objects.filter(user=self.request.user).select_related("category")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
