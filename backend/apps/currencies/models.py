from django.db import models


class Currency(models.TextChoices):
    """The currencies Spendly supports (ISO 4217 codes)."""

    EUR = "EUR", "Euro"
    HUF = "HUF", "Hungarian forint"
    USD = "USD", "US dollar"
    GBP = "GBP", "British pound"
    JPY = "JPY", "Japanese yen"
    CHF = "CHF", "Swiss franc"


# Digits after the decimal point an amount may have in each currency. Forint and yen
# amounts are whole numbers in practice (the fillér was withdrawn in 1999).
DECIMALS: dict[str, int] = {
    Currency.EUR: 2,
    Currency.HUF: 0,
    Currency.USD: 2,
    Currency.GBP: 2,
    Currency.JPY: 0,
    Currency.CHF: 2,
}

# The ECB quotes every rate against the euro.
ECB_BASE = Currency.EUR


class ExchangeRate(models.Model):
    """An ECB euro reference rate: on `date`, 1 EUR was worth `rate` units of `currency`.

    Shared by all users. Filled by `manage.py fetch_exchange_rates`; the ECB publishes
    one set of rates per TARGET working day, around 16:00 CET.
    """

    date = models.DateField()
    currency = models.CharField(max_length=3, choices=Currency.choices)
    rate = models.DecimalField(max_digits=18, decimal_places=6)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "currency"]
        constraints = [
            # Also the index behind every "latest rate on or before a date" lookup.
            models.UniqueConstraint(fields=["currency", "date"], name="exchange_rate_unique_currency_date"),
            models.CheckConstraint(condition=models.Q(rate__gt=0), name="exchange_rate_positive"),
            models.CheckConstraint(condition=~models.Q(currency="EUR"), name="exchange_rate_not_eur"),
        ]

    def __str__(self):
        return f"{self.date}: 1 EUR = {self.rate} {self.currency}"
