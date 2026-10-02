"""Client for the ECB's euro foreign exchange reference rates.

https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/
Free, no API key; one set of rates per TARGET working day, published around 16:00 CET.
Standard library only (like apps/notifications/expo.py).
"""

import urllib.error
import urllib.request
import xml.etree.ElementTree as ElementTree
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation

from .models import ECB_BASE, Currency

PERIOD_URLS = {
    "latest": "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
    "90d": "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml",
    "all": "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml",
}
REQUEST_TIMEOUT_SECONDS = 30
# The whole history since 1999 is a few MB; anything much bigger isn't the ECB file.
MAX_RESPONSE_BYTES = 32 * 1024 * 1024

_NAMESPACE = "{http://www.ecb.int/vocabulary/2002-08-01/eurofxref}"
_SUPPORTED = {currency.value for currency in Currency} - {ECB_BASE}


class EcbError(Exception):
    """The rates couldn't be downloaded or understood. Safe to retry later."""


@dataclass(frozen=True)
class EcbRate:
    day: date
    currency: str
    rate: Decimal  # units of `currency` per 1 EUR


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"Accept": "application/xml", "User-Agent": "WALLEX"})
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            body = response.read(MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as error:
        raise EcbError(f"The ECB answered HTTP {error.code}.") from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise EcbError(f"Could not reach the ECB: {error}") from error
    if len(body) > MAX_RESPONSE_BYTES:
        raise EcbError("The ECB response is unexpectedly large.")
    return body


def parse(document: bytes) -> list[EcbRate]:
    """The rates of the supported currencies in an ECB `eurofxref` XML document.

    Layout: <Cube><Cube time="2026-09-25"><Cube currency="USD" rate="1.1711"/>…</Cube>…</Cube>.
    The document comes from a trusted HTTPS source, and Python's expat parser refuses
    entity-expansion bombs, so the standard library parser is fine here.
    """
    try:
        root = ElementTree.fromstring(document)
    except ElementTree.ParseError as error:
        raise EcbError(f"The ECB response is not valid XML ({error}).") from error

    rates = []
    for day_cube in root.iter(f"{_NAMESPACE}Cube"):
        published = day_cube.get("time")
        if published is None:
            continue  # the outer wrapper or a rate element
        try:
            day = date.fromisoformat(published)
        except ValueError as error:
            raise EcbError(f"Unexpected date in the ECB response: {published!r}.") from error
        for rate_cube in day_cube:
            currency = rate_cube.get("currency")
            if currency not in _SUPPORTED:
                continue
            try:
                rate = Decimal(rate_cube.get("rate", ""))
            except InvalidOperation as error:
                raise EcbError(f"Unexpected {currency} rate in the ECB response.") from error
            if not rate.is_finite() or rate <= 0:
                raise EcbError(f"Unexpected {currency} rate in the ECB response: {rate}.")
            rates.append(EcbRate(day, currency, rate))

    if not rates:
        raise EcbError("The ECB response contained no rates for the supported currencies.")
    return rates


def fetch(period: str = "latest") -> list[EcbRate]:
    """`latest` (the last publication), `90d` or `all` (since 1999)."""
    return parse(download(PERIOD_URLS[period]))
