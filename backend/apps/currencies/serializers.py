from decimal import Decimal

from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from .models import Currency
from .rates import has_valid_precision


def check_amount_precision(amount: Decimal | None, currency: str) -> None:
    """Rejects a fractional forint or yen amount (2 decimals are already enforced by the field)."""
    if amount is not None and not has_valid_precision(amount, currency):
        raise serializers.ValidationError(
            {"amount": [_("%(currency)s amounts can't have decimals.") % {"currency": currency}]}
        )


class ConvertQuerySerializer(serializers.Serializer):
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01"), help_text="Amount in `currency`, e.g. `15000`."
    )
    currency = serializers.ChoiceField(choices=Currency.choices, help_text="Currency of `amount`.")
    date = serializers.DateField(required=False, help_text="Transaction date. Default: today.")

    def validate(self, attrs):
        check_amount_precision(attrs["amount"], attrs["currency"])
        attrs.setdefault("date", timezone.localdate())
        return attrs


class ConversionSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, help_text="The amount sent.")
    currency = serializers.ChoiceField(choices=Currency.choices)
    base_currency = serializers.ChoiceField(choices=Currency.choices, help_text="The user's base currency.")
    exchange_rate = serializers.DecimalField(
        max_digits=20, decimal_places=10, help_text="Value of 1 unit of `currency` in `base_currency`."
    )
    base_amount = serializers.DecimalField(
        max_digits=15,
        decimal_places=2,
        help_text="`amount × exchange_rate`, rounded to cents — what a transaction would store.",
    )
    rate_date = serializers.DateField(
        allow_null=True,
        help_text="Date of the ECB publication used (the last one on or before `date`); `null` for the base currency.",
    )
