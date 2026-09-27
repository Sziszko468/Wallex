from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from apps.categories.models import Category, TransactionType
from apps.currencies.models import Currency
from apps.currencies.rates import Converter, has_valid_precision
from apps.currencies.serializers import check_amount_precision

from . import savings
from .models import ZERO, Budget, SavingsGoal, SavingsGoalStatus, usage_figures


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


# --- Savings goals ---------------------------------------------------------------------------


def _money(help_text: str, **kwargs) -> serializers.DecimalField:
    return serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True, help_text=help_text, **kwargs)


class SavingsGoalSerializer(serializers.ModelSerializer):
    status = serializers.ChoiceField(
        choices=SavingsGoalStatus.choices,
        required=False,
        help_text=(
            "`active`: still saving. `completed`: set by the server once `current_amount` reaches "
            "`target_amount` (and back to `active` if it drops below). `archived`: put away by the user. "
            "Send `archived` to archive and `active` to restore; `completed` can't be sent."
        ),
    )
    progress_percentage = serializers.FloatField(
        read_only=True, help_text="`current_amount / target_amount × 100`, 2 decimals; above 100 when over-saved."
    )
    remaining_amount = _money("Still to save, in `currency`; `0` once the target is reached.")
    days_left = serializers.IntegerField(
        read_only=True,
        allow_null=True,
        help_text="Days until `target_date`; negative when it has passed, `null` without one.",
    )
    monthly_needed = _money(
        "What to save each month to reach the target by `target_date`, in `currency`, rounded up. "
        "`null` without a target date, once the date has passed, or when the goal isn't `active`.",
        allow_null=True,
    )
    base_current_amount = _money(
        "`current_amount` in the user's base currency at the latest ECB rate; `null` without a rate of the last 7 days.",
        allow_null=True,
    )
    base_target_amount = _money(
        "`target_amount` in the user's base currency at the latest ECB rate; `null` without a rate of the last 7 days.",
        allow_null=True,
    )

    class Meta:
        model = SavingsGoal
        fields = [
            "id",
            "name",
            "currency",
            "target_amount",
            "current_amount",
            "target_date",
            "status",
            "progress_percentage",
            "remaining_amount",
            "days_left",
            "monthly_needed",
            "base_current_amount",
            "base_target_amount",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {
            "name": {"help_text": "What you're saving for, e.g. `Japan trip`."},
            "currency": {
                "help_text": (
                    "Currency the money is saved in; both amounts are in it and never converted. Default: the "
                    "user's base currency. Can only change while `current_amount` is 0."
                )
            },
            "target_amount": {"help_text": "How much to save: positive, max 2 decimals (whole for HUF/JPY)."},
            "current_amount": {
                "help_text": (
                    "Saved so far (default 0). Set it directly to correct it, or use the `deposit` / `withdraw` "
                    "actions to add or remove money."
                )
            },
            "target_date": {"help_text": "Optional deadline (`YYYY-MM-DD`); can't be set to a past date."},
        }

    def validate_status(self, value):
        if value == SavingsGoalStatus.COMPLETED:
            raise serializers.ValidationError(
                "A goal is completed automatically when the saved amount reaches the target."
            )
        return value

    def validate_target_date(self, value):
        unchanged = self.instance is not None and value == self.instance.target_date
        if value is not None and not unchanged and value < timezone.localdate():
            raise serializers.ValidationError("The target date can't be in the past.")
        return value

    def validate(self, attrs):
        instance = self.instance
        currency = attrs.setdefault(
            "currency", instance.currency if instance else self.context["request"].user.base_currency
        )
        if instance is not None and currency != instance.currency and instance.current_amount > 0:
            raise serializers.ValidationError(
                {"currency": ["The currency can't change once money is saved in the goal."]}
            )
        for field in ("target_amount", "current_amount"):
            amount = attrs.get(field, getattr(instance, field, None))
            if amount is not None and not has_valid_precision(amount, currency):
                raise serializers.ValidationError({field: [f"{currency} amounts can't have decimals."]})
        return attrs

    def create(self, validated_data):
        goal = SavingsGoal(**validated_data)
        goal.sync_status()
        goal.save()
        return goal

    def update(self, instance, validated_data):
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.sync_status()
        instance.save()
        return instance

    def to_representation(self, instance):
        # The view shares one `today` and one Converter (one rate query at most) across a list.
        today = self.context.get("today") or timezone.localdate()
        converter = self.context.get("converter") or Converter(self.context["request"].user.base_currency, today)
        figures = savings.figures_of(instance, today, converter)
        for field, value in vars(figures).items():
            setattr(instance, field, value)
        return super().to_representation(instance)


class MoneyMovementSerializer(serializers.Serializer):
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
        help_text="How much to add or remove, in the goal's `currency` (whole numbers for HUF and JPY).",
    )

    def validate_amount(self, value):
        currency = self.context["goal"].currency
        if not has_valid_precision(value, currency):
            raise serializers.ValidationError(f"{currency} amounts can't have decimals.")
        return value


class SavingsSummarySerializer(serializers.Serializer):
    currency = serializers.ChoiceField(
        choices=Currency.choices, help_text="The user's base currency: every total is in it."
    )
    active_count = serializers.IntegerField()
    completed_count = serializers.IntegerField()
    archived_count = serializers.IntegerField()
    total_saved = _money("Saved in the goals that aren't archived, in the base currency.")
    total_target = _money("Their targets added up, in the base currency.")
    progress_percentage = serializers.FloatField(
        allow_null=True, help_text="`total_saved / total_target × 100`; `null` without such goals."
    )
    unconverted_currencies = serializers.ListField(
        child=serializers.ChoiceField(choices=Currency.choices),
        help_text="Currencies without an ECB rate of the last 7 days: goals saved in them are left out of the totals.",
    )
