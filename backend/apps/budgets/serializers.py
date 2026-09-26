from rest_framework import serializers

from apps.categories.models import Category, TransactionType
from apps.currencies.serializers import check_amount_precision

from .models import ZERO, Budget, usage_figures


class BudgetSerializer(serializers.ModelSerializer):
    spent_amount = serializers.DecimalField(
        source="spent",
        max_digits=12,
        decimal_places=2,
        read_only=True,
        help_text="Expenses counted against this budget so far.",
    )
    remaining_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True, help_text="`amount - spent_amount`; negative when over budget."
    )
    usage_percentage = serializers.FloatField(
        read_only=True, help_text="`spent_amount / amount × 100`, rounded to 2 decimals; above 100 when over budget."
    )

    class Meta:
        model = Budget
        fields = [
            "id",
            "category",
            "amount",
            "year",
            "month",
            "spent_amount",
            "remaining_amount",
            "usage_percentage",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {
            "category": {"help_text": "Expense category id, or `null` for the overall budget of all expenses."},
            "amount": {
                "help_text": "Monthly limit in the user's base currency: positive, max 2 decimals (whole for HUF/JPY)."
            },
            "year": {"help_text": "2000–2100."},
            "month": {"help_text": "1–12."},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            self.fields["category"].queryset = Category.objects.filter(user=request.user)

    def to_representation(self, instance):
        # `spent` is annotated by Budget.objects.with_spent() (see BudgetViewSet.get_queryset):
        # one query for the whole list instead of one per budget.
        spent = getattr(instance, "spent", ZERO)
        instance.remaining_amount, instance.usage_percentage = usage_figures(instance.amount, spent)
        return super().to_representation(instance)

    def validate(self, attrs):
        request = self.context["request"]
        category = attrs.get("category", getattr(self.instance, "category", None))
        year = attrs.get("year", getattr(self.instance, "year", None))
        month = attrs.get("month", getattr(self.instance, "month", None))

        if category is not None and category.type != TransactionType.EXPENSE:
            raise serializers.ValidationError(
                {"category": "Budgets can only be set for expense categories."}
            )
        # A budget is in the user's base currency.
        check_amount_precision(attrs.get("amount"), request.user.base_currency)

        queryset = Budget.objects.filter(user=request.user, category=category, year=year, month=month)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("A budget for this category and month already exists.")

        return attrs
