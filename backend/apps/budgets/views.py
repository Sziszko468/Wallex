from django.db.models import Case, F, Value, When
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.concurrency import ConditionalWriteMixin
from apps.common.permissions import IsOwner
from apps.currencies.rates import Converter
from apps.notifications.rules import check_budget_thresholds, check_savings_goal

from . import savings
from .models import Budget, SavingsGoal, SavingsGoalStatus
from .openapi import (
    BUDGET_VIEWSET_SCHEMA,
    DEPOSIT_SCHEMA,
    SAVINGS_GOAL_VIEWSET_SCHEMA,
    SAVINGS_SUMMARY_SCHEMA,
    WITHDRAW_SCHEMA,
)
from .serializers import BudgetSerializer, MoneyMovementSerializer, SavingsGoalSerializer, SavingsSummarySerializer


@BUDGET_VIEWSET_SCHEMA
class BudgetViewSet(ConditionalWriteMixin, viewsets.ModelViewSet):
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


def _progress(goal: SavingsGoal):
    return savings.progress_percentage(goal.current_amount, goal.target_amount)


@SAVINGS_GOAL_VIEWSET_SCHEMA
class SavingsGoalViewSet(ConditionalWriteMixin, viewsets.ModelViewSet):
    # Only the model matters here (schema tooling); requests always go through get_queryset().
    queryset = SavingsGoal.objects.none()
    serializer_class = SavingsGoalSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        # Active goals first, then completed, then archived; the nearest deadline first within each.
        status_rank = Case(
            When(status=SavingsGoalStatus.ACTIVE, then=Value(0)),
            When(status=SavingsGoalStatus.COMPLETED, then=Value(1)),
            default=Value(2),
        )
        return (
            SavingsGoal.objects.filter(user=self.request.user)
            .alias(status_rank=status_rank)
            .order_by("status_rank", F("target_date").asc(nulls_last=True), "name", "id")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        user = getattr(self.request, "user", None)
        if user is not None and user.is_authenticated:
            # One date and one set of exchange rates for every goal in the response.
            today = timezone.localdate()
            context["today"] = today
            context["converter"] = Converter(user.base_currency, today)
        return context

    def perform_create(self, serializer):
        # No progress notification for a new goal: the user just entered its amounts.
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        before = _progress(serializer.instance)
        # A corrected saved amount or a lowered target can cross a milestone.
        check_savings_goal(self.request.user, serializer.save(), before)

    @DEPOSIT_SCHEMA
    @action(detail=True, methods=["post"])
    def deposit(self, request, pk=None):
        return self._move_money(request, savings.Direction.DEPOSIT)

    @WITHDRAW_SCHEMA
    @action(detail=True, methods=["post"])
    def withdraw(self, request, pk=None):
        return self._move_money(request, savings.Direction.WITHDRAWAL)

    def _move_money(self, request, direction):
        goal = self.get_object()  # 404 for another user's goal
        movement = MoneyMovementSerializer(data=request.data, context={"goal": goal})
        movement.is_valid(raise_exception=True)
        before = _progress(goal)
        try:
            goal = savings.move_money(goal.pk, movement.validated_data["amount"], direction)
        except savings.MoneyMovementError as error:
            return Response({error.field: [str(error)]}, status=status.HTTP_400_BAD_REQUEST)
        check_savings_goal(request.user, goal, before)  # a withdrawal never crosses a milestone upwards
        return Response(self.get_serializer(goal).data)

    @SAVINGS_SUMMARY_SCHEMA
    @action(detail=False, methods=["get"])
    def summary(self, request):
        return Response(SavingsSummarySerializer(savings.get_summary(request.user, timezone.localdate())).data)
