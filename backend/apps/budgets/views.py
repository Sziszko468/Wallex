from rest_framework import permissions, viewsets

from apps.common.permissions import IsOwner
from apps.notifications.services import check_budget_thresholds

from .models import Budget
from .openapi import BUDGET_VIEWSET_SCHEMA
from .serializers import BudgetSerializer


@BUDGET_VIEWSET_SCHEMA
class BudgetViewSet(viewsets.ModelViewSet):
    # Only the model matters here (schema tooling); requests always go through get_queryset().
    queryset = Budget.objects.none()
    serializer_class = BudgetSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        return Budget.objects.filter(user=self.request.user).with_spent()

    def perform_create(self, serializer):
        self._saved(serializer, serializer.save(user=self.request.user))

    def perform_update(self, serializer):
        self._saved(serializer, serializer.save())

    def _saved(self, serializer, budget):
        self._check_thresholds(budget)
        # Answer with the computed figures (spent, remaining, usage) of the stored budget.
        serializer.instance = self.get_queryset().get(pk=budget.pk)

    def _check_thresholds(self, budget):
        # A new or lowered budget can already be over the limit.
        check_budget_thresholds(self.request.user, budget.year, budget.month)
