from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework import status

from apps.transactions.models import Transaction

from .models import Budget


@pytest.mark.django_db
def test_list_returns_only_own_budgets(auth_client, user, other_user, expense_category, other_user_expense_category):
    Budget.objects.create(user=user, category=expense_category, amount=Decimal("400.00"), year=2026, month=9)
    Budget.objects.create(
        user=other_user, category=other_user_expense_category, amount=Decimal("100.00"), year=2026, month=9
    )

    response = auth_client.get(reverse("budget-list"))

    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]["category"] == expense_category.id


@pytest.mark.django_db
def test_list_unauthenticated_rejected(api_client):
    response = api_client.get(reverse("budget-list"))
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_retrieve_budget_includes_computed_fields(auth_client, user, expense_category):
    budget = Budget.objects.create(
        user=user, category=expense_category, amount=Decimal("400.00"), year=2026, month=9
    )
    Transaction.objects.create(
        user=user, category=expense_category, type="expense",
        amount=Decimal("200.00"), date=date(2026, 9, 5),
    )
    Transaction.objects.create(
        user=user, category=expense_category, type="expense",
        amount=Decimal("120.00"), date=date(2026, 9, 20),
    )

    response = auth_client.get(reverse("budget-detail", args=[budget.id]))

    assert response.status_code == status.HTTP_200_OK
    assert response.data["amount"] == "400.00"
    assert response.data["spent_amount"] == "320.00"
    assert response.data["remaining_amount"] == "80.00"
    assert response.data["usage_percentage"] == 80.0


@pytest.mark.django_db
def test_retrieve_other_users_budget_returns_404(auth_client, other_user, other_user_expense_category):
    other_budget = Budget.objects.create(
        user=other_user, category=other_user_expense_category, amount=Decimal("100.00"), year=2026, month=9
    )
    response = auth_client.get(reverse("budget-detail", args=[other_budget.id]))
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_create_budget_success(auth_client, user, expense_category):
    payload = {"category": expense_category.id, "amount": "400.00", "year": 2026, "month": 9}
    response = auth_client.post(reverse("budget-list"), payload)

    assert response.status_code == status.HTTP_201_CREATED
    budget = Budget.objects.get(id=response.data["id"])
    assert budget.user == user
    assert response.data["spent_amount"] == "0.00"
    assert response.data["remaining_amount"] == "400.00"
    assert response.data["usage_percentage"] == 0.0


@pytest.mark.django_db
def test_create_budget_ignores_client_supplied_user(auth_client, user, other_user, expense_category):
    payload = {
        "category": expense_category.id, "amount": "400.00", "year": 2026, "month": 9, "user": other_user.id,
    }
    response = auth_client.post(reverse("budget-list"), payload)

    assert response.status_code == status.HTTP_201_CREATED
    budget = Budget.objects.get(id=response.data["id"])
    assert budget.user == user


@pytest.mark.django_db
def test_create_budget_with_other_users_category_rejected(auth_client, other_user_expense_category):
    payload = {"category": other_user_expense_category.id, "amount": "400.00", "year": 2026, "month": 9}
    response = auth_client.post(reverse("budget-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "category" in response.data


@pytest.mark.django_db
def test_create_budget_for_income_category_rejected(auth_client, income_category):
    payload = {"category": income_category.id, "amount": "1000.00", "year": 2026, "month": 9}
    response = auth_client.post(reverse("budget-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "category" in response.data


@pytest.mark.django_db
def test_create_duplicate_budget_same_category_month_rejected(auth_client, expense_category):
    payload = {"category": expense_category.id, "amount": "400.00", "year": 2026, "month": 9}
    first = auth_client.post(reverse("budget-list"), payload)
    assert first.status_code == status.HTTP_201_CREATED

    second = auth_client.post(reverse("budget-list"), payload)
    assert second.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_create_duplicate_overall_budget_same_month_rejected(auth_client):
    payload = {"amount": "2000.00", "year": 2026, "month": 9}
    first = auth_client.post(reverse("budget-list"), payload)
    assert first.status_code == status.HTTP_201_CREATED

    second = auth_client.post(reverse("budget-list"), payload)
    assert second.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_create_budget_category_and_overall_can_coexist(auth_client, expense_category):
    category_payload = {"category": expense_category.id, "amount": "400.00", "year": 2026, "month": 9}
    overall_payload = {"amount": "2000.00", "year": 2026, "month": 9}

    first = auth_client.post(reverse("budget-list"), category_payload)
    second = auth_client.post(reverse("budget-list"), overall_payload)

    assert first.status_code == status.HTTP_201_CREATED
    assert second.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
@pytest.mark.parametrize("invalid_month", [0, 13])
def test_create_budget_invalid_month_rejected(auth_client, expense_category, invalid_month):
    payload = {"category": expense_category.id, "amount": "400.00", "year": 2026, "month": invalid_month}
    response = auth_client.post(reverse("budget-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "month" in response.data


@pytest.mark.django_db
def test_create_budget_negative_amount_rejected(auth_client, expense_category):
    payload = {"category": expense_category.id, "amount": "-50.00", "year": 2026, "month": 9}
    response = auth_client.post(reverse("budget-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "amount" in response.data


@pytest.mark.django_db
def test_budget_zero_spent_gives_zero_usage_and_full_remaining(auth_client, expense_category):
    payload = {"category": expense_category.id, "amount": "400.00", "year": 2026, "month": 9}
    response = auth_client.post(reverse("budget-list"), payload)

    assert response.data["spent_amount"] == "0.00"
    assert response.data["remaining_amount"] == "400.00"
    assert response.data["usage_percentage"] == 0.0


@pytest.mark.django_db
def test_over_budget_shows_negative_remaining_and_over_100_percent(auth_client, user, expense_category):
    budget = Budget.objects.create(
        user=user, category=expense_category, amount=Decimal("400.00"), year=2026, month=9
    )
    Transaction.objects.create(
        user=user, category=expense_category, type="expense",
        amount=Decimal("500.00"), date=date(2026, 9, 10),
    )

    response = auth_client.get(reverse("budget-detail", args=[budget.id]))

    assert response.data["spent_amount"] == "500.00"
    assert response.data["remaining_amount"] == "-100.00"
    assert response.data["usage_percentage"] == 125.0


@pytest.mark.django_db
def test_patch_budget_amount_success(auth_client, user, expense_category):
    budget = Budget.objects.create(
        user=user, category=expense_category, amount=Decimal("400.00"), year=2026, month=9
    )
    response = auth_client.patch(reverse("budget-detail", args=[budget.id]), {"amount": "500.00"})

    assert response.status_code == status.HTTP_200_OK
    budget.refresh_from_db()
    assert budget.amount == Decimal("500.00")


@pytest.mark.django_db
def test_patch_other_users_budget_returns_404(auth_client, other_user, other_user_expense_category):
    other_budget = Budget.objects.create(
        user=other_user, category=other_user_expense_category, amount=Decimal("100.00"), year=2026, month=9
    )
    response = auth_client.patch(reverse("budget-detail", args=[other_budget.id]), {"amount": "999.00"})

    assert response.status_code == status.HTTP_404_NOT_FOUND
    other_budget.refresh_from_db()
    assert other_budget.amount == Decimal("100.00")


@pytest.mark.django_db
def test_put_method_not_allowed(auth_client, user, expense_category):
    budget = Budget.objects.create(
        user=user, category=expense_category, amount=Decimal("400.00"), year=2026, month=9
    )
    response = auth_client.put(
        reverse("budget-detail", args=[budget.id]),
        {"category": expense_category.id, "amount": "500.00", "year": 2026, "month": 9},
    )
    assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED


@pytest.mark.django_db
def test_delete_budget_success(auth_client, user, expense_category):
    budget = Budget.objects.create(
        user=user, category=expense_category, amount=Decimal("400.00"), year=2026, month=9
    )
    response = auth_client.delete(reverse("budget-detail", args=[budget.id]))

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not Budget.objects.filter(id=budget.id).exists()


@pytest.mark.django_db
def test_delete_other_users_budget_returns_404(auth_client, other_user, other_user_expense_category):
    other_budget = Budget.objects.create(
        user=other_user, category=other_user_expense_category, amount=Decimal("100.00"), year=2026, month=9
    )
    response = auth_client.delete(reverse("budget-detail", args=[other_budget.id]))

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert Budget.objects.filter(id=other_budget.id).exists()


@pytest.mark.django_db
def test_create_budget_unauthenticated_rejected(api_client, expense_category):
    payload = {"category": expense_category.id, "amount": "400.00", "year": 2026, "month": 9}
    response = api_client.post(reverse("budget-list"), payload)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
