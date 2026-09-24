from rest_framework import permissions, viewsets

from apps.common.permissions import IsOwner
from apps.notifications.services import check_budget_thresholds

from .models import Budget
from .serializers import BudgetSerializer


class BudgetViewSet(viewsets.ModelViewSet):
    serializer_class = BudgetSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        return Budget.objects.filter(user=self.request.user).select_related("category")

    def perform_create(self, serializer):
        self._check_thresholds(serializer.save(user=self.request.user))

    def perform_update(self, serializer):
        self._check_thresholds(serializer.save())

    def _check_thresholds(self, budget):
        # A new or lowered budget can already be over the limit.
        check_budget_thresholds(self.request.user, budget.year, budget.month)
