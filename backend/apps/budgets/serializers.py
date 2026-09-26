from rest_framework import serializers

from apps.categories.models import Category, TransactionType

from .models import Budget


class BudgetSerializer(serializers.ModelSerializer):
    spent_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True, help_text="Expenses counted against this budget so far."
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
            "amount": {"help_text": "Monthly limit: positive, max 2 decimals."},
            "year": {"help_text": "2000–2100."},
            "month": {"help_text": "1–12."},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            self.fields["category"].queryset = Category.objects.filter(user=request.user)

    def to_representation(self, instance):
        spent = instance.get_spent_amount()
        instance.spent_amount = spent
        instance.remaining_amount = instance.amount - spent
        instance.usage_percentage = round((spent / instance.amount) * 100, 2)
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

        queryset = Budget.objects.filter(user=request.user, category=category, year=year, month=month)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("A budget for this category and month already exists.")

        return attrs
