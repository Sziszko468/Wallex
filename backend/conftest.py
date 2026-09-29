import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="testuser", email="testuser@example.com", password="testpass123"
    )


@pytest.fixture
def other_user(db):
    return User.objects.create_user(
        username="otheruser", email="otheruser@example.com", password="testpass123"
    )


@pytest.fixture
def api_client():
    return APIClient()


def issue_tokens(django_user):
    """A signed-in device: a real session and its token pair (tokens without a session are refused)."""
    from apps.users.sessions import start_session

    _, refresh = start_session(django_user)
    return refresh.access_token, refresh


def _authenticated_client(django_user):
    client = APIClient()
    access, _ = issue_tokens(django_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


@pytest.fixture
def auth_client(user):
    return _authenticated_client(user)


@pytest.fixture
def other_auth_client(other_user):
    return _authenticated_client(other_user)


@pytest.fixture(autouse=True)
def push_outbox(monkeypatch):
    """No test may reach the real Expo push service: every push is recorded here instead."""
    from apps.notifications import expo

    sent: list[dict] = []

    def fake_send(messages):
        sent.extend(messages)
        return [expo.PushTicket(ok=True, ticket_id=f"ticket-{len(sent)}-{i}") for i, _ in enumerate(messages)]

    monkeypatch.setattr(expo, "send_push_messages", fake_send)
    return sent


@pytest.fixture(autouse=True)
def no_ecb_downloads(monkeypatch):
    """No test may reach the real ECB: tests that need a download replace `ecb.download` themselves."""
    from apps.currencies import ecb

    def refuse(url):
        raise AssertionError(f"Tests must not download exchange rates ({url}); patch apps.currencies.ecb.download.")

    monkeypatch.setattr(ecb, "download", refuse)


@pytest.fixture
def add_rates(db):
    """add_rates(day, HUF="400", USD="1.25"): ECB rates for `day` (1 EUR = … units)."""
    from decimal import Decimal

    from apps.currencies.models import ExchangeRate

    def _add(day, **rates):
        for currency, rate in rates.items():
            ExchangeRate.objects.update_or_create(currency=currency, date=day, defaults={"rate": Decimal(rate)})

    return _add


@pytest.fixture(autouse=True)
def reset_throttle_counters():
    """Rate-limit counters live in the cache; never let one test's requests throttle another's."""
    from django.core.cache import cache

    cache.clear()


def refuse_model_client():
    raise AssertionError("Tests must not call the real model API; use the `fake_model` fixture (apps/analytics/conftest.py).")


@pytest.fixture(autouse=True)
def no_model_calls(settings):
    """No test may reach the Anthropic API, even when an ANTHROPIC_API_KEY is configured locally."""
    settings.AI_ASSISTANT = {**settings.AI_ASSISTANT, "CLIENT": "conftest.refuse_model_client"}
