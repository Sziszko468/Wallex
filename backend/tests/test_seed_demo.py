"""The demo-data command: complete, repeatable, and never run by accident."""

from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.urls import reverse
from rest_framework.test import APIClient

from apps.budgets.models import Budget, SavingsGoal
from apps.subscriptions.models import Subscription
from apps.transactions.models import RecurringTransaction, Transaction

User = get_user_model()
EMAIL = "demo@example.com"


def seed(*args, **kwargs) -> str:
    out = StringIO()
    call_command("seed_demo", *args, stdout=out, **kwargs)
    return out.getvalue()


@pytest.fixture(autouse=True)
def development(settings):
    settings.DEBUG = True


@pytest.mark.django_db
def test_it_creates_a_signed_in_ready_account_with_data_everywhere(settings):
    output = seed(password="Demo!Password-2026")

    assert f"{EMAIL} / Demo!Password-2026" in output
    user = User.objects.get(email=EMAIL)
    assert user.check_password("Demo!Password-2026")
    assert Transaction.objects.filter(user=user).count() > 100
    assert Budget.objects.filter(user=user).count() == 7  # six categories and the overall budget
    assert Subscription.objects.filter(user=user).count() == 3
    assert RecurringTransaction.objects.filter(user=user, is_subscription=False).count() == 2
    assert SavingsGoal.objects.filter(user=user).count() == 3


@pytest.mark.django_db
def test_it_prints_a_random_password_that_works_when_none_is_given():
    output = seed()
    password = output.strip().rsplit(" / ", 1)[1]

    client = APIClient()
    response = client.post(reverse("auth-login"), {"email": EMAIL, "password": password}, format="json")

    assert response.status_code == 200
    assert len(password) >= 12


@pytest.mark.django_db
def test_the_data_runs_through_the_real_rules_so_the_dashboard_has_something_to_show():
    seed(password="Demo!Password-2026")
    user = User.objects.get(email=EMAIL)
    client = APIClient()
    client.force_authenticate(user)
    from django.utils import timezone

    from apps.analytics.services import shift_month

    today = timezone.localdate()
    year, month = shift_month(today.year, today.month, -1)

    dashboard = client.get(reverse("analytics-dashboard"), {"year": year, "month": month}).json()
    insights = client.get(reverse("analytics-insights"), {"year": year, "month": month}).json()["insights"]

    assert float(dashboard["total_income"]) > 0 and float(dashboard["total_expenses"]) > 0
    assert any(entry["status"] == "over_budget" for entry in dashboard["budget_usage"])  # the exceeded one
    assert len(insights) >= 3
    assert any(row["unlocked_at"] for row in client.get(reverse("achievement-list")).json())


@pytest.mark.django_db
def test_the_same_seed_gives_the_same_amounts_every_time():
    seed(password="Demo!Password-2026")
    first = sorted(Transaction.objects.filter(user__email=EMAIL).values_list("amount", flat=True))
    seed("--reset", password="Demo!Password-2026")
    second = sorted(Transaction.objects.filter(user__email=EMAIL).values_list("amount", flat=True))

    assert first == second


@pytest.mark.django_db
def test_running_it_twice_needs_reset():
    seed()

    with pytest.raises(CommandError, match="already exists"):
        seed()
    seed("--reset")

    assert User.objects.filter(email=EMAIL).count() == 1


@pytest.mark.django_db
def test_reset_replaces_instead_of_adding():
    seed()
    before = Transaction.objects.filter(user__email=EMAIL).count()

    seed("--reset")

    assert Transaction.objects.filter(user__email=EMAIL).count() == before


@pytest.mark.django_db
def test_it_refuses_to_run_in_production_unless_forced(settings):
    settings.DEBUG = False

    with pytest.raises(CommandError, match="only runs in development"):
        seed()
    assert not User.objects.filter(email=EMAIL).exists()
    seed("--force")
    assert User.objects.filter(email=EMAIL).exists()


@pytest.mark.django_db
def test_the_language_and_history_length_are_options():
    seed("--language", "hu", "--months", "3")

    user = User.objects.get(email=EMAIL)
    assert user.language == "hu"
    months = {(row.date.year, row.date.month) for row in Transaction.objects.filter(user=user)}
    assert len(months) == 3


@pytest.mark.django_db
def test_another_email_can_be_used():
    seed("--email", "reviewer@example.com", "--months", "2")

    assert User.objects.filter(email="reviewer@example.com").exists()
    assert not User.objects.filter(email=EMAIL).exists()
