from django.utils import timezone
from rest_framework import serializers

from apps.categories.models import TransactionType
from apps.currencies.models import Currency
from apps.transactions.serializers import RecurringScheduleSerializer

from . import services
from .models import Subscription


def _money(help_text: str, **kwargs) -> serializers.DecimalField:
    # Derived values (yearly cost of a weekly payment, converted to yen…) can outgrow numeric(12, 2).
    return serializers.DecimalField(max_digits=20, decimal_places=2, read_only=True, help_text=help_text, **kwargs)


class SubscriptionSerializer(RecurringScheduleSerializer):
    active = serializers.BooleanField(
        source="is_active",
        required=False,
        help_text="`false` pauses the subscription: no payments ahead, left out of the totals. Default `true`.",
    )
    status = serializers.ChoiceField(
        choices=services.Status.CHOICES,
        read_only=True,
        help_text="`active`: has payments ahead. `paused`: `active` is `false`. `ended`: past its `end_date`.",
    )
    next_payment_date = serializers.DateField(
        read_only=True,
        allow_null=True,
        help_text="The next payment on or after today, from `start_date` and `frequency`; `null` when paused or ended.",
    )
    upcoming_payments = serializers.ListField(
        child=serializers.DateField(),
        read_only=True,
        help_text=f"The next {services.SCHEDULE_PREVIEW} payment dates (fewer near `end_date`); empty when paused or ended.",
    )
    monthly_cost = _money("Average cost per month in `currency` (weekly × 52 / 12, yearly / 12).")
    yearly_cost = _money("Cost per year in `currency` (weekly × 52, monthly × 12).")
    base_monthly_cost = _money(
        "`monthly_cost` in the user's base currency at the latest ECB rate; `null` if no rate of the last 7 days.",
        allow_null=True,
    )
    base_yearly_cost = _money(
        "`yearly_cost` in the user's base currency at the latest ECB rate; `null` if no rate of the last 7 days.",
        allow_null=True,
    )

    class Meta:
        model = Subscription
        fields = [
            "id",
            "name",
            "merchant",
            "amount",
            "currency",
            "category",
            "frequency",
            "start_date",
            "end_date",
            "next_payment_date",
            "active",
            "status",
            "upcoming_payments",
            "monthly_cost",
            "yearly_cost",
            "base_monthly_cost",
            "base_yearly_cost",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {
            "name": {"help_text": "What the user calls it, e.g. `Netflix`, `Gym`, `Home insurance`."},
            "merchant": {"help_text": "Optional: who bills it, e.g. `Netflix International B.V.`."},
            "amount": {
                "help_text": "Price of one payment in `currency`: positive, max 2 decimals (whole for HUF/JPY)."
            },
            "currency": {
                "help_text": "Currency the subscription is billed in. Default: the user's base currency. Never converted."
            },
            "category": {"help_text": "Id of one of the user's **expense** categories."},
            "frequency": {"help_text": "Billing period, counted from `start_date`."},
            "start_date": {"help_text": "First payment; every later payment follows from it."},
            "end_date": {"help_text": "Last possible payment (inclusive), e.g. a cancelled plan; `null` = open-ended."},
            "description": {"help_text": "Optional free text (plan, account, notes)."},
        }

    def validate(self, attrs):
        category = attrs.get("category", getattr(self.instance, "category", None))
        if category is not None and category.type != TransactionType.EXPENSE:
            raise serializers.ValidationError(
                {"category": ["Subscriptions are expenses: choose an expense category."]}
            )
        return self.validate_schedule_and_amount(attrs)

    def to_representation(self, instance):
        # The view shares one `today` and one Converter (one rate query at most) across a list.
        today = self.context.get("today") or timezone.localdate()
        converter = self.context.get("converter") or services.Converter(
            self.context["request"].user.base_currency, today
        )
        cost = services.cost_of(instance, converter)
        instance.monthly_cost = cost.monthly
        instance.yearly_cost = cost.yearly
        instance.base_monthly_cost = cost.base_monthly
        instance.base_yearly_cost = cost.base_yearly
        instance.next_payment_date = services.next_payment_date(instance, today)
        instance.status = services.status_of(instance, today)
        instance.upcoming_payments = services.payment_schedule(instance, today)
        return super().to_representation(instance)


# --- GET /api/subscriptions/summary/ (output only) -------------------------------------------


class CategoryCostSerializer(serializers.Serializer):
    category_id = serializers.IntegerField()
    category_name = serializers.CharField()
    monthly_total = _money("What the category's active subscriptions cost per month, in the base currency.")
    subscription_count = serializers.IntegerField()
    percentage = serializers.FloatField(
        allow_null=True, help_text="Share of the summary's `monthly_total`, 0–100; `null` when that is 0."
    )


class UpcomingPaymentSerializer(serializers.Serializer):
    subscription_id = serializers.IntegerField(source="subscription.id")
    name = serializers.CharField(source="subscription.name")
    date = serializers.DateField(help_text="Due date.")
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, source="subscription.amount", help_text="As billed, in `currency`."
    )
    currency = serializers.ChoiceField(choices=Currency.choices, source="subscription.currency")
    base_amount = _money("`amount` in the base currency; `null` without a recent exchange rate.", allow_null=True)


class SubscriptionSummarySerializer(serializers.Serializer):
    currency = serializers.ChoiceField(choices=Currency.choices, help_text="The user's base currency: every total is in it.")
    active_count = serializers.IntegerField(help_text="Subscriptions with payments ahead.")
    paused_count = serializers.IntegerField()
    ended_count = serializers.IntegerField(help_text="Active, but past their `end_date`.")
    monthly_total = _money("What the active subscriptions cost per month, e.g. `95.96`.")
    yearly_total = _money("Yearly projection: what the active subscriptions cost per year, e.g. `1151.52`.")
    by_category = CategoryCostSerializer(many=True, help_text="Categories of the active subscriptions, costliest first.")
    upcoming = UpcomingPaymentSerializer(
        many=True, help_text=f"Payments due in the next {services.UPCOMING_DAYS} days (today included), soonest first."
    )
    unconverted_currencies = serializers.ListField(
        child=serializers.ChoiceField(choices=Currency.choices),
        help_text="Currencies without an ECB rate of the last 7 days: subscriptions billed in them are left out of the totals.",
    )
