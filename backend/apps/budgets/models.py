from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Case, DecimalField, OuterRef, Subquery, Sum, Value, When
from django.db.models.functions import Coalesce

from apps.categories.models import Category, TransactionType
from apps.currencies.models import Currency

_MONEY = DecimalField(max_digits=15, decimal_places=2)
ZERO = Decimal("0.00")


def usage_figures(amount: Decimal, spent: Decimal) -> tuple[Decimal, Decimal]:
    """(remaining, usage %) of a budget — the single place these numbers are computed."""
    return amount - spent, round(spent / amount * 100, 2)


class BudgetQuerySet(models.QuerySet):
    def with_spent(self) -> "BudgetQuerySet":
        """Annotates `spent`: the expenses counted against each budget, in the same query.

        A category budget counts that category's expenses of its month; an overall
        budget (category NULL) counts every expense of the month. Expenses count with
        their base_amount — like the budget itself, in the user's base currency.
        """
        from apps.transactions.models import Transaction  # budgets must not import transactions at load time

        month_expenses = Transaction.objects.filter(
            user_id=OuterRef("user_id"),
            type=TransactionType.EXPENSE,
            date__year=OuterRef("year"),
            date__month=OuterRef("month"),
        )

        def total(expenses):
            # order_by(): the model's default ordering would otherwise split the GROUP BY.
            summed = expenses.order_by().values("user_id").annotate(total=Sum("base_amount")).values("total")[:1]
            return Subquery(summed, output_field=_MONEY)

        return self.annotate(
            spent=Coalesce(
                Case(
                    When(category__isnull=True, then=total(month_expenses)),
                    default=total(month_expenses.filter(category_id=OuterRef("category_id"))),
                ),
                Value(ZERO),
                output_field=_MONEY,
            )
        )


class Budget(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="budgets")
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="budgets", null=True, blank=True)
    # In the user's base currency (converted when the base currency changes).
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    year = models.PositiveIntegerField(validators=[MinValueValidator(2000), MaxValueValidator(2100)])
    month = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = BudgetQuerySet.as_manager()

    class Meta:
        ordering = ["-year", "-month"]
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="budget_amount_positive"),
            models.CheckConstraint(
                condition=models.Q(month__gte=1) & models.Q(month__lte=12),
                name="budget_month_valid_range",
            ),
            models.UniqueConstraint(
                fields=["user", "category", "year", "month"],
                condition=models.Q(category__isnull=False),
                name="unique_budget_per_category_month",
            ),
            models.UniqueConstraint(
                fields=["user", "year", "month"],
                condition=models.Q(category__isnull=True),
                name="unique_overall_budget_per_month",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "year", "month"], name="budget_user_year_month_idx"),
        ]

    def __str__(self):
        label = self.category.name if self.category_id else "Overall"
        return f"{label} budget {self.year}-{self.month:02d}"


class SavingsGoalStatus(models.TextChoices):
    ACTIVE = "active", "Active"  # still saving
    COMPLETED = "completed", "Completed"  # set automatically once current_amount reaches target_amount
    ARCHIVED = "archived", "Archived"  # put away by the user; no deposits or withdrawals


class SavingsGoalQuerySet(models.QuerySet):
    def reached(self) -> "SavingsGoalQuerySet":
        """Goals whose saved amount reached the target — whatever their status (an archived goal
        may have been completed first). The database-side twin of SavingsGoal.sync_status()."""
        return self.filter(current_amount__gte=models.F("target_amount"))


class SavingsGoal(models.Model):
    """Money put aside for something (a trip, a laptop, an emergency fund).

    Both amounts are in the goal's own `currency` — the currency the money is actually
    saved in — and are never converted, not even when the user's base currency changes.
    Moving money into a goal is not an expense: goals don't touch transactions or budgets.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="savings_goals")
    name = models.CharField(max_length=100)
    target_amount = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))]
    )
    current_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(ZERO)]
    )
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.EUR)
    target_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=SavingsGoalStatus.choices, default=SavingsGoalStatus.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = SavingsGoalQuerySet.as_manager()

    class Meta:
        ordering = ["target_date", "name", "id"]
        constraints = [
            models.CheckConstraint(condition=models.Q(target_amount__gt=0), name="savings_goal_target_positive"),
            models.CheckConstraint(condition=models.Q(current_amount__gte=0), name="savings_goal_current_not_negative"),
        ]
        indexes = [models.Index(fields=["user", "status"], name="savings_goal_user_status_idx")]

    def sync_status(self) -> None:
        """Completed exactly when the target is reached — unless the user archived the goal."""
        if self.status != SavingsGoalStatus.ARCHIVED:
            reached = self.current_amount >= self.target_amount
            self.status = SavingsGoalStatus.COMPLETED if reached else SavingsGoalStatus.ACTIVE

    def __str__(self):
        return f"{self.name}: {self.current_amount} / {self.target_amount} {self.currency}"
