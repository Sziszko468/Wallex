import io
import urllib.error
from datetime import date
from decimal import Decimal

import pytest
from django.core.management import CommandError, call_command

from apps.currencies import ecb
from apps.currencies.models import ExchangeRate

# Captured at import time — the autouse `no_ecb_downloads` fixture replaces the module attribute.
REAL_DOWNLOAD = ecb.download

SAMPLE = b"""<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>
  <Cube>
    <Cube time="2026-09-25">
      <Cube currency="USD" rate="1.1711"/>
      <Cube currency="JPY" rate="173.21"/>
      <Cube currency="CZK" rate="24.301"/>
      <Cube currency="GBP" rate="0.87138"/>
      <Cube currency="HUF" rate="389.85"/>
      <Cube currency="CHF" rate="0.9345"/>
    </Cube>
    <Cube time="2026-09-24">
      <Cube currency="USD" rate="1.1702"/>
      <Cube currency="HUF" rate="390.10"/>
    </Cube>
  </Cube>
</gesmes:Envelope>"""


def _document(rates: str) -> bytes:
    return (
        '<Envelope xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">'
        f'<Cube><Cube time="2026-09-25">{rates}</Cube></Cube></Envelope>'
    ).encode()


def test_parse_keeps_only_the_supported_currencies():
    rates = ecb.parse(SAMPLE)

    assert {(rate.day, rate.currency, rate.rate) for rate in rates} == {
        (date(2026, 9, 25), "USD", Decimal("1.1711")),
        (date(2026, 9, 25), "JPY", Decimal("173.21")),
        (date(2026, 9, 25), "GBP", Decimal("0.87138")),
        (date(2026, 9, 25), "HUF", Decimal("389.85")),
        (date(2026, 9, 25), "CHF", Decimal("0.9345")),
        (date(2026, 9, 24), "USD", Decimal("1.1702")),
        (date(2026, 9, 24), "HUF", Decimal("390.10")),
    }


@pytest.mark.parametrize(
    "document",
    [
        b"<not xml",
        b"<html><body>Service unavailable</body></html>",  # valid XML, but no rates
        _document('<Cube currency="HUF" rate="abc"/>'),
        _document('<Cube currency="HUF" rate="-1"/>'),
        _document('<Cube currency="HUF" rate="Infinity"/>'),
        _document('<Cube currency="CZK" rate="24.3"/>'),  # only unsupported currencies
    ],
)
def test_unexpected_documents_are_rejected(document):
    with pytest.raises(ecb.EcbError):
        ecb.parse(document)


def test_fetch_downloads_the_file_of_the_period(monkeypatch):
    requested = []
    monkeypatch.setattr(ecb, "download", lambda url: requested.append(url) or SAMPLE)

    ecb.fetch("90d")

    assert requested == [ecb.PERIOD_URLS["90d"]]


class _FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_download_returns_the_body(monkeypatch):
    monkeypatch.setattr("urllib.request.urlopen", lambda request, timeout: _FakeResponse(SAMPLE))

    assert REAL_DOWNLOAD(ecb.PERIOD_URLS["latest"]) == SAMPLE


@pytest.mark.parametrize(
    "error",
    [
        urllib.error.HTTPError("https://ecb", 503, "Service Unavailable", {}, None),
        urllib.error.URLError("Name or service not known"),
        TimeoutError("timed out"),
    ],
)
def test_download_failures_become_ecb_errors(monkeypatch, error):
    def fail(request, timeout):
        raise error

    monkeypatch.setattr("urllib.request.urlopen", fail)

    with pytest.raises(ecb.EcbError):
        REAL_DOWNLOAD(ecb.PERIOD_URLS["latest"])


def test_download_refuses_an_oversized_response(monkeypatch):
    monkeypatch.setattr(ecb, "MAX_RESPONSE_BYTES", 10)
    monkeypatch.setattr("urllib.request.urlopen", lambda request, timeout: _FakeResponse(SAMPLE))

    with pytest.raises(ecb.EcbError, match="unexpectedly large"):
        REAL_DOWNLOAD(ecb.PERIOD_URLS["latest"])


@pytest.mark.django_db
def test_command_stores_the_rates_idempotently(monkeypatch):
    monkeypatch.setattr(ecb, "download", lambda url: SAMPLE)
    output = io.StringIO()

    call_command("fetch_exchange_rates", stdout=output)
    call_command("fetch_exchange_rates", stdout=io.StringIO())  # running again changes nothing

    assert ExchangeRate.objects.count() == 7
    assert ExchangeRate.objects.get(currency="HUF", date=date(2026, 9, 25)).rate == Decimal("389.85")
    assert "Stored 7 rate(s) for 2 day(s), 2026-09-24 to 2026-09-25." in output.getvalue()


@pytest.mark.django_db
def test_command_applies_a_corrected_rate(monkeypatch, add_rates):
    add_rates(date(2026, 9, 25), HUF="999")
    monkeypatch.setattr(ecb, "download", lambda url: SAMPLE)

    call_command("fetch_exchange_rates", stdout=io.StringIO())

    assert ExchangeRate.objects.get(currency="HUF", date=date(2026, 9, 25)).rate == Decimal("389.85")


@pytest.mark.django_db
def test_command_fails_cleanly_when_the_ecb_is_unreachable(monkeypatch):
    def unreachable(url):
        raise ecb.EcbError("Could not reach the ECB: timed out")

    monkeypatch.setattr(ecb, "download", unreachable)

    with pytest.raises(CommandError, match="Could not reach the ECB"):
        call_command("fetch_exchange_rates", "--period", "all")
    assert not ExchangeRate.objects.exists()
