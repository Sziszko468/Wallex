"""One person's whole journey through the API, in Hungarian and then in English.

Single endpoints are covered where they live; these tests follow the steps a real user takes —
sign up, sign in, budget, spend, read the alert, look at the figures, switch language — and
check that each step speaks the right language and that nothing stored changes underneath.
"""

from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone, translation
from django.utils.dates import MONTHS
from rest_framework import status
from rest_framework.test import APIClient

from apps.categories.models import Category
from apps.notifications.models import Notification
from apps.transactions.models import Transaction

User = get_user_model()
HU = {"HTTP_ACCEPT_LANGUAGE": "hu"}
EN = {"HTTP_ACCEPT_LANGUAGE": "en"}
EMAIL, PASSWORD = "bela@example.com", "StrongPass!2024"
TODAY = timezone.localdate()


def _sign_up_and_in(language_header: dict, **extra) -> APIClient:
    client = APIClient()
    created = client.post(
        reverse("auth-register"),
        {"email": EMAIL, "password": PASSWORD, "password_confirm": PASSWORD, **extra},
        format="json",
        **language_header,
    )
    assert created.status_code == status.HTTP_201_CREATED, created.data
    login = client.post(reverse("auth-login"), {"email": EMAIL, "password": PASSWORD}, format="json", **language_header)
    assert login.status_code == status.HTTP_200_OK, login.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
    return client


def _category_named(client, name, header):
    return next(row for row in client.get(reverse("category-list"), **header).data if row["name"] == name)


@pytest.mark.django_db
def test_a_hungarian_user_from_sign_up_to_alert(django_capture_on_commit_callbacks):
    client = _sign_up_and_in(HU)
    user = User.objects.get(email=EMAIL)
    assert user.language == "hu"  # taken from the request: no language was chosen explicitly

    # the ten default categories, in Hungarian
    food = _category_named(client, "Élelmiszer", HU)
    assert {row["name"] for row in client.get(reverse("category-list"), **HU).data} >= {"Lakhatás", "Fizetés", "Egyéb"}

    # a budget, then spending that crosses it
    budget = client.post(
        reverse("budget-list"),
        {"category": food["id"], "amount": "100.00", "year": TODAY.year, "month": TODAY.month},
        format="json",
        **HU,
    )
    assert budget.status_code == status.HTTP_201_CREATED, budget.data
    with django_capture_on_commit_callbacks(execute=True):
        for amount in ("60.00", "70.00"):
            response = client.post(
                reverse("transaction-list"),
                {"category": food["id"], "type": "expense", "amount": amount, "date": TODAY.isoformat()},
                format="json",
                **HU,
            )
            assert response.status_code == status.HTTP_201_CREATED, response.data

    # the alert is written in Hungarian, once
    [alert] = Notification.objects.filter(user=user)
    with translation.override("hu"):
        month = str(MONTHS[TODAY.month])
    assert alert.title == "Költségkeret túllépve"
    assert alert.body == f"{month} hónapban a(z) Élelmiszer költségkereted 130%-át elköltötted."

    # the figures name the category in Hungarian
    dashboard = client.get(reverse("analytics-dashboard"), {"year": TODAY.year, "month": TODAY.month}, **HU).data
    assert dashboard["top_spending_category"]["category_name"] == "Élelmiszer"
    assert dashboard["budget_usage"][0]["category_name"] == "Élelmiszer"
    assert dashboard["budget_usage"][0]["spent_amount"] == "130.00"  # money is never reformatted


@pytest.mark.django_db
def test_switching_language_changes_the_words_and_nothing_else(django_capture_on_commit_callbacks):
    client = _sign_up_and_in(EN)
    user = User.objects.get(email=EMAIL)
    food = _category_named(client, "Food", EN)
    client.post(
        reverse("budget-list"),
        {"category": food["id"], "amount": "100.00", "year": TODAY.year, "month": TODAY.month},
        format="json",
    )
    with django_capture_on_commit_callbacks(execute=True):
        client.post(
            reverse("transaction-list"),
            {"category": food["id"], "type": "expense", "amount": "130.00", "date": TODAY.isoformat()},
            format="json",
        )
    english_alert = Notification.objects.get(user=user)
    assert english_alert.title == "Budget exceeded"
    english_dashboard = client.get(
        reverse("analytics-dashboard"), {"year": TODAY.year, "month": TODAY.month}, **EN
    ).data

    # the user switches to Hungarian
    assert client.patch(reverse("auth-me"), {"language": "hu"}, format="json", **HU).status_code == 200
    hungarian_dashboard = client.get(
        reverse("analytics-dashboard"), {"year": TODAY.year, "month": TODAY.month}, **HU
    ).data

    # same figures, other words
    assert english_dashboard["top_spending_category"]["category_name"] == "Food"
    assert hungarian_dashboard["top_spending_category"]["category_name"] == "Élelmiszer"
    for key in ("total_income", "total_expenses", "balance"):
        assert english_dashboard[key] == hungarian_dashboard[key]
    assert (
        english_dashboard["budget_usage"][0]["usage_percentage"]
        == hungarian_dashboard["budget_usage"][0]["usage_percentage"]
    )
    # the stored data never changed
    assert Category.objects.get(pk=food["id"]).name == "Food"
    assert Transaction.objects.get(user=user).amount == Decimal("130.00")
    # a notification already written keeps the language it was written in
    english_alert.refresh_from_db()
    assert english_alert.title == "Budget exceeded"
    [row] = client.get(reverse("notification-list"), **HU).json()["results"]
    assert row["title"] == "Budget exceeded"


@pytest.mark.django_db
def test_after_switching_new_notifications_use_the_new_language(django_capture_on_commit_callbacks):
    client = _sign_up_and_in(EN)
    user = User.objects.get(email=EMAIL)
    food = _category_named(client, "Food", EN)
    shopping = _category_named(client, "Shopping", EN)
    for category in (food, shopping):
        client.post(
            reverse("budget-list"),
            {"category": category["id"], "amount": "100.00", "year": TODAY.year, "month": TODAY.month},
            format="json",
        )

    def overspend(category):
        with django_capture_on_commit_callbacks(execute=True):
            client.post(
                reverse("transaction-list"),
                {"category": category["id"], "type": "expense", "amount": "150.00", "date": TODAY.isoformat()},
                format="json",
            )

    overspend(food)
    client.patch(reverse("auth-me"), {"language": "hu"}, format="json")
    overspend(shopping)

    titles = list(Notification.objects.filter(user=user).order_by("id").values_list("title", flat=True))
    assert titles == ["Budget exceeded", "Költségkeret túllépve"]


@pytest.mark.django_db
def test_a_new_device_signs_in_to_the_language_of_the_account():
    _sign_up_and_in(HU)

    # a second device that sends no language at all: the account says which one it is
    phone = APIClient()
    login = phone.post(reverse("auth-login"), {"email": EMAIL, "password": PASSWORD}, format="json")
    phone.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    assert phone.get(reverse("auth-me")).data["language"] == "hu"


@pytest.mark.django_db
def test_validation_errors_follow_the_language_through_a_whole_form_round_trip():
    client = _sign_up_and_in(EN)
    food = _category_named(client, "Food", EN)
    bad = {"category": food["id"], "type": "income", "amount": "10.00", "date": date(2026, 9, 1).isoformat()}

    english = client.post(reverse("transaction-list"), bad, format="json", **EN)
    hungarian = client.post(reverse("transaction-list"), bad, format="json", **HU)

    assert english.status_code == hungarian.status_code == status.HTTP_400_BAD_REQUEST
    assert english.data.keys() == hungarian.data.keys() == {"type"}  # same field, same status, other words
    assert str(english.data["type"][0]) == "Transaction type must match the selected category's type."
    assert str(hungarian.data["type"][0]) == "A tranzakció típusának egyeznie kell a kiválasztott kategória típusával."
    assert not Transaction.objects.exists()
