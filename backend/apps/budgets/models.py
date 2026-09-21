from calendar import monthrange
from datetime import date
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Sum

from apps.categories.models import Category, TransactionType


class Budget(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="budgets"
    )
    category = models.ForeignKey(
        Category, on_delete=models.CASCADE, related_name="budgets", null=True, blank=True
    )
    amount = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))]
    )
    year = models.PositiveIntegerField(validators=[MinValueValidator(2000), MaxValueValidator(2100)])
    month = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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

    def get_spent_amount(self):
        from apps.transactions.models import Transaction

        start_date = date(self.year, self.month, 1)
        end_date = date(self.year, self.month, monthrange(self.year, self.month)[1])

        queryset = Transaction.objects.filter(
            user_id=self.user_id,
            type=TransactionType.EXPENSE,
            date__gte=start_date,
            date__lte=end_date,
        )
        if self.category_id:
            queryset = queryset.filter(category_id=self.category_id)

        return queryset.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
