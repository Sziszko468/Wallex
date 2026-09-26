"""Health probes: public, unthrottled, and honest about the dependencies they check."""

import pytest
from django.urls import reverse
from rest_framework.throttling import UserRateThrottle

from apps.common import health

pytestmark = pytest.mark.django_db


def test_liveness_answers_without_credentials(api_client):
    response = api_client.get(reverse("health-live"))

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_reports_every_dependency(api_client):
    response = api_client.get(reverse("health-ready"))

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"database": "ok", "cache": "ok"}}


def test_readiness_fails_with_503_without_leaking_the_reason(api_client, monkeypatch):
    def broken_database() -> None:
        raise RuntimeError('connection to "db.internal" failed: password authentication failed')

    monkeypatch.setitem(health.CHECKS, "database", broken_database)

    response = api_client.get(reverse("health-ready"))

    assert response.status_code == 503
    assert response.json() == {"status": "error", "checks": {"database": "error", "cache": "ok"}}
    assert "password" not in response.content.decode()
    assert "db.internal" not in response.content.decode()


def test_liveness_does_not_depend_on_the_database(api_client, monkeypatch):
    def broken_database() -> None:
        raise RuntimeError("database is down")

    monkeypatch.setitem(health.CHECKS, "database", broken_database)

    assert api_client.get(reverse("health-live")).status_code == 200


@pytest.mark.parametrize("route", ["health-live", "health-ready"])
def test_probes_ignore_an_invalid_bearer_token(api_client, route):
    api_client.credentials(HTTP_AUTHORIZATION="Bearer not-a-jwt")

    assert api_client.get(reverse(route)).status_code == 200


@pytest.mark.parametrize("route", ["health-live", "health-ready"])
def test_probes_are_never_rate_limited(api_client, monkeypatch, route):
    # DRF reads THROTTLE_RATES when the module is imported — patch the class attribute.
    monkeypatch.setattr(UserRateThrottle, "THROTTLE_RATES", {**UserRateThrottle.THROTTLE_RATES, "user": "1/hour"})

    statuses = [api_client.get(reverse(route)).status_code for _ in range(3)]

    assert statuses == [200, 200, 200]


@pytest.mark.parametrize("route", ["health-live", "health-ready"])
def test_probes_are_read_only(api_client, route):
    assert api_client.post(reverse(route)).status_code == 405
    assert api_client.delete(reverse(route)).status_code == 405
