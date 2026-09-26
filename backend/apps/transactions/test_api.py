from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework import status

from apps.transactions.models import Transaction


def _create_transaction(user, category, **overrides):
    defaults = {
        "user": user,
        "category": category,
        "type": category.type,
        "amount": Decimal("25.00"),
        "date": date.today(),
        "description": "",
    }
    defaults.update(overrides)
    return Transaction.objects.create(**defaults)


@pytest.mark.django_db
def test_list_returns_only_own_transactions(
    auth_client, other_auth_client, user, other_user, expense_category, other_user_expense_category
):
    _create_transaction(user, expense_category, description="mine")
    _create_transaction(other_user, other_user_expense_category, description="not mine")

    response = auth_client.get(reverse("transaction-list"))

    assert response.status_code == status.HTTP_200_OK
    assert response.data["count"] == 1
    assert response.data["results"][0]["description"] == "mine"


@pytest.mark.django_db
def test_retrieve_own_transaction(auth_client, user, expense_category):
    transaction = _create_transaction(user, expense_category)

    response = auth_client.get(reverse("transaction-detail", args=[transaction.id]))

    assert response.status_code == status.HTTP_200_OK
    assert response.data["id"] == transaction.id


@pytest.mark.django_db
def test_retrieve_other_users_transaction_returns_404(
    auth_client, other_user, other_user_expense_category
):
    other_transaction = _create_transaction(other_user, other_user_expense_category)

    response = auth_client.get(reverse("transaction-detail", args=[other_transaction.id]))

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_retrieve_nonexistent_transaction_returns_404(auth_client):
    response = auth_client.get(reverse("transaction-detail", args=[999999]))
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_non_numeric_id_returns_404_not_500(auth_client):
    response = auth_client.get("/api/transactions/not-a-number/")
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_create_transaction_success(auth_client, user, expense_category):
    payload = {
        "category": expense_category.id,
        "type": "expense",
        "amount": "49.99",
        "date": "2026-09-15",
        "description": "Weekly groceries",
    }
    response = auth_client.post(reverse("transaction-list"), payload)

    assert response.status_code == status.HTTP_201_CREATED
    transaction = Transaction.objects.get(id=response.data["id"])
    assert transaction.user == user
    assert transaction.amount == Decimal("49.99")


@pytest.mark.django_db
def test_create_transaction_ignores_client_supplied_user(
    auth_client, user, other_user, expense_category
):
    payload = {
        "category": expense_category.id,
        "type": "expense",
        "amount": "10.00",
        "date": "2026-09-15",
        "user": other_user.id,
    }
    response = auth_client.post(reverse("transaction-list"), payload)

    assert response.status_code == status.HTTP_201_CREATED
    transaction = Transaction.objects.get(id=response.data["id"])
    assert transaction.user == user


@pytest.mark.django_db
def test_create_transaction_negative_amount_rejected(auth_client, expense_category):
    payload = {
        "category": expense_category.id,
        "type": "expense",
        "amount": "-10.00",
        "date": "2026-09-15",
    }
    response = auth_client.post(reverse("transaction-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "amount" in response.data


@pytest.mark.django_db
def test_create_transaction_zero_amount_rejected(auth_client, expense_category):
    payload = {
        "category": expense_category.id,
        "type": "expense",
        "amount": "0",
        "date": "2026-09-15",
    }
    response = auth_client.post(reverse("transaction-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "amount" in response.data


@pytest.mark.django_db
def test_create_transaction_non_numeric_amount_rejected(auth_client, expense_category):
    payload = {
        "category": expense_category.id,
        "type": "expense",
        "amount": "not-a-number",
        "date": "2026-09-15",
    }
    response = auth_client.post(reverse("transaction-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "amount" in response.data


@pytest.mark.django_db
def test_create_transaction_type_category_mismatch_rejected(auth_client, expense_category):
    payload = {
        "category": expense_category.id,
        "type": "income",
        "amount": "10.00",
        "date": "2026-09-15",
    }
    response = auth_client.post(reverse("transaction-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "type" in response.data


@pytest.mark.django_db
def test_create_transaction_with_other_users_category_rejected(
    auth_client, other_user_expense_category
):
    payload = {
        "category": other_user_expense_category.id,
        "type": "expense",
        "amount": "10.00",
        "date": "2026-09-15",
    }
    response = auth_client.post(reverse("transaction-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "category" in response.data


@pytest.mark.django_db
def test_create_transaction_missing_date_rejected(auth_client, expense_category):
    payload = {"category": expense_category.id, "type": "expense", "amount": "10.00"}
    response = auth_client.post(reverse("transaction-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "date" in response.data


@pytest.mark.django_db
def test_create_transaction_unauthenticated_rejected(api_client, expense_category):
    payload = {
        "category": expense_category.id,
        "type": "expense",
        "amount": "10.00",
        "date": "2026-09-15",
    }
    response = api_client.post(reverse("transaction-list"), payload)

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_list_unauthenticated_rejected(api_client):
    response = api_client.get(reverse("transaction-list"))
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_update_transaction_put_success(auth_client, user, expense_category):
    transaction = _create_transaction(user, expense_category, amount=Decimal("20.00"))
    payload = {
        "category": expense_category.id,
        "type": "expense",
        "amount": "35.00",
        "date": "2026-09-20",
        "description": "Updated",
    }

    response = auth_client.put(reverse("transaction-detail", args=[transaction.id]), payload)

    assert response.status_code == status.HTTP_200_OK
    transaction.refresh_from_db()
    assert transaction.amount == Decimal("35.00")
    assert transaction.description == "Updated"


@pytest.mark.django_db
def test_update_other_users_transaction_returns_404(
    auth_client, other_user, other_user_expense_category
):
    other_transaction = _create_transaction(other_user, other_user_expense_category)
    payload = {
        "category": other_user_expense_category.id,
        "type": "expense",
        "amount": "99.00",
        "date": "2026-09-20",
    }

    response = auth_client.put(
        reverse("transaction-detail", args=[other_transaction.id]), payload
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    other_transaction.refresh_from_db()
    assert other_transaction.amount != Decimal("99.00")


@pytest.mark.django_db
def test_partial_update_transaction_patch_success(auth_client, user, expense_category):
    transaction = _create_transaction(user, expense_category, description="Original")

    response = auth_client.patch(
        reverse("transaction-detail", args=[transaction.id]), {"description": "Patched"}
    )

    assert response.status_code == status.HTTP_200_OK
    transaction.refresh_from_db()
    assert transaction.description == "Patched"


@pytest.mark.django_db
def test_delete_transaction_success(auth_client, user, expense_category):
    transaction = _create_transaction(user, expense_category)

    response = auth_client.delete(reverse("transaction-detail", args=[transaction.id]))

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not Transaction.objects.filter(id=transaction.id).exists()


@pytest.mark.django_db
def test_delete_other_users_transaction_returns_404_and_is_not_deleted(
    auth_client, other_user, other_user_expense_category
):
    other_transaction = _create_transaction(other_user, other_user_expense_category)

    response = auth_client.delete(reverse("transaction-detail", args=[other_transaction.id]))

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert Transaction.objects.filter(id=other_transaction.id).exists()


@pytest.mark.django_db
def test_delete_nonexistent_transaction_returns_404(auth_client):
    response = auth_client.delete(reverse("transaction-detail", args=[999999]))
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_filter_by_type(auth_client, user, expense_category, income_category):
    _create_transaction(user, expense_category, type="expense")
    _create_transaction(user, income_category, type="income")

    response = auth_client.get(reverse("transaction-list"), {"type": "income"})

    assert response.status_code == status.HTTP_200_OK
    assert response.data["count"] == 1
    assert response.data["results"][0]["type"] == "income"


@pytest.mark.django_db
def test_filter_by_category_id(auth_client, user, expense_category, income_category):
    _create_transaction(user, expense_category, type="expense")
    _create_transaction(user, income_category, type="income")

    response = auth_client.get(reverse("transaction-list"), {"category": expense_category.id})

    assert response.status_code == status.HTTP_200_OK
    assert response.data["count"] == 1
    assert response.data["results"][0]["category"] == expense_category.id


@pytest.mark.django_db
def test_filter_by_category_name(auth_client, user, expense_category, income_category):
    _create_transaction(user, expense_category, type="expense")
    _create_transaction(user, income_category, type="income")

    response = auth_client.get(reverse("transaction-list"), {"category_name": "salary"})

    assert response.status_code == status.HTTP_200_OK
    assert response.data["count"] == 1
    assert response.data["results"][0]["category"] == income_category.id


@pytest.mark.django_db
def test_filter_by_date_range(auth_client, user, expense_category):
    _create_transaction(user, expense_category, date=date(2026, 8, 15), description="august")
    _create_transaction(user, expense_category, date=date(2026, 9, 15), description="september")
    _create_transaction(user, expense_category, date=date(2026, 10, 15), description="october")

    response = auth_client.get(
        reverse("transaction-list"), {"date_from": "2026-09-01", "date_to": "2026-09-30"}
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["count"] == 1
    assert response.data["results"][0]["description"] == "september"


@pytest.mark.django_db
def test_search_by_description(auth_client, user, expense_category):
    _create_transaction(user, expense_category, description="Netflix subscription")
    _create_transaction(user, expense_category, description="Groceries run")

    response = auth_client.get(reverse("transaction-list"), {"search": "netflix"})

    assert response.status_code == status.HTTP_200_OK
    assert response.data["count"] == 1
    assert "Netflix" in response.data["results"][0]["description"]


@pytest.mark.django_db
def test_ordering_by_amount(auth_client, user, expense_category):
    _create_transaction(user, expense_category, amount=Decimal("5.00"))
    _create_transaction(user, expense_category, amount=Decimal("50.00"))
    _create_transaction(user, expense_category, amount=Decimal("25.00"))

    response = auth_client.get(reverse("transaction-list"), {"ordering": "amount"})

    assert response.status_code == status.HTTP_200_OK
    amounts = [Decimal(item["amount"]) for item in response.data["results"]]
    assert amounts == sorted(amounts)


@pytest.mark.django_db
def test_pagination_page_size_and_next_page(auth_client, user, expense_category):
    for i in range(3):
        _create_transaction(user, expense_category, description=f"tx-{i}", date=date.today() - timedelta(days=i))

    response = auth_client.get(reverse("transaction-list"), {"page_size": 2})

    assert response.status_code == status.HTTP_200_OK
    assert response.data["count"] == 3
    assert len(response.data["results"]) == 2
    assert response.data["next"] is not None

    second_page = auth_client.get(reverse("transaction-list"), {"page_size": 2, "page": 2})
    assert second_page.status_code == status.HTTP_200_OK
    assert len(second_page.data["results"]) == 1
    assert second_page.data["next"] is None


@pytest.mark.django_db
@pytest.mark.parametrize("ordering", ["-date", "date", "amount", "-amount", "created_at"])
def test_pagination_shows_every_transaction_exactly_once(auth_client, user, expense_category, ordering):
    """Regression: `?ordering=-date` alone left ties on the same date in arbitrary order per query,
    so page boundaries repeated some transactions and skipped others."""
    first_day = date(2026, 9, 1)
    for index in range(45):
        _create_transaction(
            user, expense_category,
            date=first_day + timedelta(days=index % 3),
            amount=Decimal("10.00") + index % 2,
        )
    Transaction.objects.update(created_at=Transaction.objects.first().created_at)  # ties on every sort field

    seen = []
    for page in (1, 2, 3):
        response = auth_client.get(reverse("transaction-list"), {"ordering": ordering, "page_size": 20, "page": page})
        assert response.status_code == status.HTTP_200_OK
        seen += [item["id"] for item in response.data["results"]]

    assert sorted(seen) == sorted(Transaction.objects.values_list("id", flat=True))
