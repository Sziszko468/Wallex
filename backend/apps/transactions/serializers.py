from decimal import Decimal

from rest_framework import serializers

from apps.categories.models import Category
from apps.currencies.rates import (
    MAX_BASE_AMOUNT,
    ONE,
    MissingExchangeRateError,
    base_amount_for,
    exchange_rate,
)
from apps.currencies.serializers import check_amount_precision

from .models import RecurringTransaction, Transaction


class TransactionSerializer(serializers.ModelSerializer):
    # Optional idempotency key (see Transaction.client_id); settable on create only.
    client_id = serializers.UUIDField(
        required=False,
        allow_null=True,
        help_text="Optional idempotency key (UUID) chosen by the client. Only settable on create.",
    )
    exchange_rate = serializers.DecimalField(
        max_digits=20,
        decimal_places=10,
        min_value=Decimal("0.0000000001"),
        required=False,
        help_text=(
            "Value of 1 unit of `currency` in the user's base currency. Optional: when omitted it is the "
            "ECB reference rate of `date`. Always 1 when `currency` is the base currency."
        ),
    )
    base_amount = serializers.DecimalField(
        max_digits=15,
        decimal_places=2,
        read_only=True,
        help_text="`amount × exchange_rate` in the user's base currency, rounded to cents. Every total is a sum of these.",
    )

    class Meta:
        model = Transaction
        fields = [
            "id",
            "amount",
            "currency",
            "exchange_rate",
            "base_amount",
            "type",
            "category",
            "description",
            "date",
            "client_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {
            "amount": {
                "help_text": (
                    "Positive, in `currency`, as paid (decimal string, e.g. `\"45.90\"`). "
                    "Max 2 decimals; whole numbers for HUF and JPY."
                )
            },
            "currency": {"help_text": "Currency of `amount`. Default: the user's base currency."},
            "type": {"help_text": "Must equal the category's type."},
            "category": {"help_text": "Id of one of the user's categories."},
            "description": {"help_text": "Optional free text, max 255 characters."},
            "date": {"help_text": "Booking date (`YYYY-MM-DD`). Also picks the exchange rate."},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            self.fields["category"].queryset = Category.objects.filter(user=request.user)
        if self.instance is not None:
            self.fields["client_id"].read_only = True

    def validate(self, attrs):
        category = attrs.get("category", getattr(self.instance, "category", None))
        tx_type = attrs.get("type", getattr(self.instance, "type", None))
        if category is not None and tx_type is not None and category.type != tx_type:
            raise serializers.ValidationError(
                {"type": "Transaction type must match the selected category's type."}
            )
        return self._with_exchange_rate(attrs)

    def _with_exchange_rate(self, attrs):
        """Fixes `currency` and `exchange_rate` of the resulting transaction.

        The rate is looked up only when it can have changed — a new transaction, another
        currency or another date. Editing just the amount keeps the stored rate (the
        database recomputes base_amount), so an old transaction is never silently re-rated.
        """
        base_currency = self.context["request"].user.base_currency
        instance = self.instance
        currency = attrs.setdefault("currency", instance.currency if instance else base_currency)
        amount = attrs.get("amount", getattr(instance, "amount", None))
        day = attrs.get("date", getattr(instance, "date", None))
        check_amount_precision(amount, currency)

        if "exchange_rate" in attrs:
            if currency == base_currency and attrs["exchange_rate"] != ONE:
                raise serializers.ValidationError(
                    {"exchange_rate": ["Must be 1 when the currency is your base currency."]}
                )
        elif currency == base_currency:
            attrs["exchange_rate"] = ONE
        elif instance is None or currency != instance.currency or day != instance.date:
            try:
                attrs["exchange_rate"] = exchange_rate(currency, base_currency, day).value
            except MissingExchangeRateError as error:
                raise serializers.ValidationError(
                    {"exchange_rate": [f"{error} Enter the rate manually or try again later."]}
                ) from error

        rate = attrs.get("exchange_rate", getattr(instance, "exchange_rate", ONE))
        if amount is not None and base_amount_for(amount, rate) > MAX_BASE_AMOUNT:
            raise serializers.ValidationError({"amount": ["This amount is too large to convert to your base currency."]})
        return attrs


class RecurringTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecurringTransaction
        fields = [
            "id",
            "name",
            "category",
            "type",
            "amount",
            "frequency",
            "start_date",
            "end_date",
            "next_occurrence_date",
            "is_active",
            "description",
            "created_at",
            "updated_at",
        ]
        # next_occurrence_date is internal scheduling state, not a user input:
        # it's derived from start_date on create, and re-derived only when
        # start_date itself changes (see update() below). A future
        # generation job will be the other thing that ever advances it.
        read_only_fields = ["id", "next_occurrence_date", "created_at", "updated_at"]
        extra_kwargs = {
            "name": {"help_text": "Short label, e.g. `Rent`."},
            "category": {"help_text": "Id of one of the user's categories; its type must equal `type`."},
            "amount": {
                "help_text": "Amount per occurrence in the user's base currency: positive, max 2 decimals (whole for HUF/JPY)."
            },
            "frequency": {"help_text": "How often it repeats, counted from `start_date`."},
            "start_date": {"help_text": "First occurrence."},
            "end_date": {"help_text": "Last possible occurrence (inclusive); `null` = no end."},
            "next_occurrence_date": {"help_text": "Scheduling state: starts at `start_date`, reset when `start_date` changes."},
            "is_active": {"help_text": "`false` pauses reminders and excludes the template from insights."},
            "description": {"help_text": "Optional free text."},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            self.fields["category"].queryset = Category.objects.filter(user=request.user)

    def validate(self, attrs):
        category = attrs.get("category", getattr(self.instance, "category", None))
        tx_type = attrs.get("type", getattr(self.instance, "type", None))
        if category is not None and tx_type is not None and category.type != tx_type:
            raise serializers.ValidationError(
                {"type": "Recurring transaction type must match the selected category's type."}
            )

        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if end_date is not None and start_date is not None and end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": "End date must be on or after the start date."}
            )

        # The amount of a recurring transaction is in the user's base currency.
        check_amount_precision(attrs.get("amount"), self.context["request"].user.base_currency)
        return attrs

    def create(self, validated_data):
        validated_data["next_occurrence_date"] = validated_data["start_date"]
        return super().create(validated_data)

    def update(self, instance, validated_data):
        new_start_date = validated_data.get("start_date")
        if new_start_date is not None and new_start_date != instance.start_date:
            validated_data["next_occurrence_date"] = new_start_date
        return super().update(instance, validated_data)
