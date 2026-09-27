"""Currency conversion with ECB reference rates.

The ECB quotes every currency against the euro (1 EUR = r units), so the rate between
two supported currencies is a cross rate: 1 unit of X is worth r(B) / r(X) units of B,
with r(EUR) = 1.

A transaction is converted with the rate of its own date, or of the latest earlier ECB
publication (weekends, holidays, today before 16:00 CET) as long as that is at most
MAX_RATE_AGE old. The rate is stored with the transaction and never changes afterwards,
like the rate on a bank statement.
"""

from bisect import bisect_right
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.utils import timezone

from .models import DECIMALS, ECB_BASE, Currency, ExchangeRate

ONE = Decimal(1)
# Stored precision of Transaction.exchange_rate (decimal_places=10).
RATE_QUANTUM = Decimal("1e-10")
# base_amount is kept in cents whatever the base currency, exactly like the database's
# ROUND(amount * exchange_rate, 2) (half away from zero == ROUND_HALF_UP for positives).
BASE_AMOUNT_QUANTUM = Decimal("0.01")
MAX_BASE_AMOUNT = Decimal("9999999999999.99")  # Transaction.base_amount: numeric(15, 2)
MAX_AMOUNT = Decimal("9999999999.99")  # every user-entered amount: numeric(12, 2)
MAX_RATE_AGE = timedelta(days=7)


class ConversionError(Exception):
    """A conversion can't be done. The message is safe to show to the user."""


class MissingExchangeRateError(ConversionError):
    """No recent enough ECB rate for a currency on a date."""

    def __init__(self, currency: str, day: date):
        self.currency = currency
        self.day = day
        super().__init__(f"No {currency} exchange rate is available for {day.isoformat()}.")


def minor_unit(currency: str) -> Decimal:
    """The smallest amount in `currency`: 0.01 for EUR, 1 for HUF."""
    return ONE.scaleb(-DECIMALS[currency])


def has_valid_precision(amount: Decimal, currency: str) -> bool:
    """False for a fractional forint or yen amount. Judged by value: "1500.00" HUF is fine."""
    return amount == amount.quantize(minor_unit(currency))


def base_amount_for(amount: Decimal, exchange_rate: Decimal) -> Decimal:
    """The base amount the database will compute for a transaction."""
    return (amount * exchange_rate).quantize(BASE_AMOUNT_QUANTUM, rounding=ROUND_HALF_UP)


def to_currency(amount: Decimal, rate: Decimal, currency: str) -> Decimal:
    """`amount` converted with `rate`, rounded to `currency`'s unit and never below it."""
    unit = minor_unit(currency)
    return max((amount * rate).quantize(unit, rounding=ROUND_HALF_UP), unit)


@dataclass(frozen=True)
class Rate:
    value: Decimal  # value of 1 unit of the source currency in the target currency
    published_on: date | None  # the ECB publication used; None when no rate was needed


class RateTable:
    """ECB rates of a few currencies over a date range, loaded with one query."""

    def __init__(self, rows: Iterable[tuple[str, date, Decimal]] = ()):
        self._days: dict[str, list[date]] = defaultdict(list)
        self._rates: dict[str, list[Decimal]] = defaultdict(list)
        for currency, day, rate in sorted(rows):
            self._days[currency].append(day)
            self._rates[currency].append(rate)

    @classmethod
    def load(cls, currencies: Iterable[str], first_day: date, last_day: date) -> "RateTable":
        """Everything needed to convert between `currencies` on any day from `first_day` to `last_day`."""
        needed = set(currencies) - {ECB_BASE}
        if not needed:
            return cls()
        # A future day falls back to today's latest rate, so the window must reach back from today too.
        earliest = min(first_day, timezone.localdate()) - MAX_RATE_AGE
        rows = ExchangeRate.objects.filter(
            currency__in=needed, date__gte=earliest, date__lte=last_day
        ).values_list("currency", "date", "rate")
        return cls(rows)

    def _per_euro(self, currency: str, day: date) -> tuple[Decimal, date | None]:
        """Units of `currency` per 1 EUR on `day`: the latest publication on or before it."""
        if currency == ECB_BASE:
            return ONE, None
        days = self._days.get(currency, [])
        index = bisect_right(days, day) - 1
        # For a future day the freshest possible rate is today's, so judge its age from today.
        reference_day = min(day, timezone.localdate())
        if index < 0 or reference_day - days[index] > MAX_RATE_AGE:
            raise MissingExchangeRateError(currency, day)
        return self._rates[currency][index], days[index]

    def rate(self, source: str, target: str, day: date) -> Rate:
        """Value of 1 unit of `source` in `target` on `day`."""
        if source == target:
            return Rate(ONE, None)
        source_per_euro, source_day = self._per_euro(source, day)
        target_per_euro, target_day = self._per_euro(target, day)
        value = (target_per_euro / source_per_euro).quantize(RATE_QUANTUM, rounding=ROUND_HALF_UP)
        # At least one side isn't the euro, so at least one publication date exists.
        return Rate(value, max(published for published in (source_day, target_day) if published))


class Converter:
    """Converts into one base currency at one day's rates, for values shown next to amounts
    kept in their own currency (subscription costs, savings goals). The rates are loaded
    with a single query on the first conversion that needs them; none for the base currency.
    A currency without a rate of the last MAX_RATE_AGE converts to None — never a guess."""

    def __init__(self, base_currency: str, day: date):
        self.base_currency = base_currency
        self.day = day
        self._rates: RateTable | None = None

    def rate(self, currency: str) -> Decimal | None:
        """Value of 1 unit of `currency` in the base currency; None when no recent rate exists."""
        if currency == self.base_currency:
            return ONE
        if self._rates is None:
            self._rates = RateTable.load(Currency.values, self.day, self.day)
        try:
            return self._rates.rate(currency, self.base_currency, self.day).value
        except MissingExchangeRateError:
            return None

    def to_base(self, amount: Decimal, currency: str) -> Decimal | None:
        """`amount` in the base currency, in cents like every base amount; None without a rate."""
        rate = self.rate(currency)
        return None if rate is None else base_amount_for(amount, rate)


def exchange_rate(source: str, target: str, day: date) -> Rate:
    """One lookup: at most one query, none when the currencies are the same."""
    if source == target:
        return Rate(ONE, None)
    return RateTable.load({source, target}, day, day).rate(source, target, day)


@dataclass(frozen=True)
class Conversion:
    exchange_rate: Decimal
    base_amount: Decimal
    rate_date: date | None


def convert(amount: Decimal, currency: str, base_currency: str, day: date) -> Conversion:
    """What a transaction of `amount` `currency` on `day` is worth in `base_currency`."""
    rate = exchange_rate(currency, base_currency, day)
    return Conversion(rate.value, base_amount_for(amount, rate.value), rate.published_on)
