from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework import status

from apps.categories.models import TransactionType
from apps.transactions.models import Transaction


def _expense(user, category, amount, day, month=9):
    return Transaction.objects.create(
        user=user, category=category, type=TransactionType.EXPENSE,
        amount=Decimal(amount), date=date(2026, month, day),
    )


@pytest.mark.django_db
def test_dashboard_requires_authentication(api_client):
    response = api_client.get(reverse("analytics-dashboard"))
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_dashboard_returns_data_for_authenticated_user(auth_client, user, food_category):
    _expense(user, food_category, "320.00", 10)

    response = auth_client.get(reverse("analytics-dashboard"), {"year": 2026, "month": 9})

    assert response.status_code == status.HTTP_200_OK
    assert response.data["total_expenses"] == "320.00"
    assert response.data["transaction_count"] == 1
    assert response.data["top_spending_category"]["category_name"] == "Food"


@pytest.mark.django_db
def test_dashboard_invalid_month_rejected(auth_client):
    response = auth_client.get(reverse("analytics-dashboard"), {"year": 2026, "month": 13})
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "month" in response.data


@pytest.mark.django_db
def test_dashboard_invalid_year_rejected(auth_client):
    response = auth_client.get(reverse("analytics-dashboard"), {"year": 1800, "month": 9})
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "year" in response.data


@pytest.mark.django_db
def test_dashboard_isolated_per_user(auth_client, other_auth_client, user, other_user, food_category):
    _expense(user, food_category, "320.00", 10)

    response = other_auth_client.get(reverse("analytics-dashboard"), {"year": 2026, "month": 9})

    assert response.status_code == status.HTTP_200_OK
    assert response.data["total_expenses"] == "0.00"
    assert response.data["transaction_count"] == 0


@pytest.mark.django_db
def test_monthly_requires_authentication(api_client):
    response = api_client.get(reverse("analytics-monthly"))
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_monthly_returns_12_months(auth_client, user, food_category):
    _expense(user, food_category, "100.00", 5)

    response = auth_client.get(reverse("analytics-monthly"), {"year": 2026})

    assert response.status_code == status.HTTP_200_OK
    assert response.data["year"] == 2026
    assert len(response.data["months"]) == 12
    assert response.data["months"][8]["month_name"] == "September"
    assert response.data["months"][8]["expenses"] == "100.00"


@pytest.mark.django_db
def test_monthly_invalid_year_rejected(auth_client):
    response = auth_client.get(reverse("analytics-monthly"), {"year": 1800})
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_categories_requires_authentication(api_client):
    response = api_client.get(reverse("analytics-categories"))
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_categories_returns_breakdown(auth_client, user, food_category, transport_category):
    _expense(user, food_category, "300.00", 5)
    _expense(user, transport_category, "100.00", 6)

    response = auth_client.get(reverse("analytics-categories"), {"year": 2026, "month": 9})

    assert response.status_code == status.HTTP_200_OK
    names = [c["category_name"] for c in response.data["categories"]]
    assert names == ["Food", "Transport"]


@pytest.mark.django_db
def test_categories_isolated_per_user(auth_client, other_auth_client, user, other_user, food_category):
    _expense(user, food_category, "300.00", 5)

    response = other_auth_client.get(reverse("analytics-categories"), {"year": 2026, "month": 9})

    assert response.status_code == status.HTTP_200_OK
    assert response.data["categories"] == []


@pytest.mark.django_db
def test_comparison_requires_authentication(api_client):
    response = api_client.get(reverse("analytics-comparison"))
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_comparison_returns_expected_structure(auth_client, user, food_category):
    _expense(user, food_category, "100.00", 5, month=9)
    _expense(user, food_category, "80.00", 5, month=8)

    response = auth_client.get(reverse("analytics-comparison"), {"year": 2026, "month": 9})

    assert response.status_code == status.HTTP_200_OK
    assert response.data["current_month"]["total_expenses"] == "100.00"
    assert response.data["previous_month"]["total_expenses"] == "80.00"
    assert response.data["difference"]["total_expenses"] == "20.00"
    assert response.data["percentage_difference"]["total_expenses"] == 25.0


@pytest.mark.django_db
def test_comparison_percentage_difference_null_when_previous_zero(auth_client, user, food_category):
    _expense(user, food_category, "100.00", 5, month=9)

    response = auth_client.get(reverse("analytics-comparison"), {"year": 2026, "month": 9})

    assert response.status_code == status.HTTP_200_OK
    assert response.data["percentage_difference"]["total_expenses"] is None
