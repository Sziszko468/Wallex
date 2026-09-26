from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Case, DecimalField, OuterRef, Subquery, Sum, Value, When
from django.db.models.functions import Coalesce

from apps.categories.models import Category, TransactionType

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
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="budgets"
    )
    category = models.ForeignKey(
        Category, on_delete=models.CASCADE, related_name="budgets", null=True, blank=True
    )
    # In the user's base currency (converted when the base currency changes).
    amount = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))]
    )
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
