from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework import status

from apps.transactions.models import Frequency, RecurringTransaction


def _create_recurring(user, category, **overrides):
    defaults = {
        "user": user,
        "category": category,
        "name": "Netflix",
        "type": category.type,
        "amount": Decimal("15.99"),
        "frequency": Frequency.MONTHLY,
        "start_date": date(2026, 9, 1),
        "next_occurrence_date": date(2026, 9, 1),
    }
    defaults.update(overrides)
    return RecurringTransaction.objects.create(**defaults)


@pytest.mark.django_db
def test_list_returns_only_own_recurring_transactions(
    auth_client, user, other_user, expense_category, other_user_expense_category
):
    _create_recurring(user, expense_category, name="mine")
    _create_recurring(other_user, other_user_expense_category, name="not mine")

    response = auth_client.get(reverse("recurringtransaction-list"))

    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]["name"] == "mine"


@pytest.mark.django_db
def test_retrieve_own_recurring_transaction(auth_client, user, expense_category):
    recurring = _create_recurring(user, expense_category)

    response = auth_client.get(reverse("recurringtransaction-detail", args=[recurring.id]))

    assert response.status_code == status.HTTP_200_OK
    assert response.data["id"] == recurring.id


@pytest.mark.django_db
def test_retrieve_other_users_recurring_transaction_returns_404(
    auth_client, other_user, other_user_expense_category
):
    other_recurring = _create_recurring(other_user, other_user_expense_category)

    response = auth_client.get(
        reverse("recurringtransaction-detail", args=[other_recurring.id])
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_non_numeric_id_returns_404_not_500(auth_client):
    response = auth_client.get("/api/recurring-transactions/not-a-number/")
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_create_recurring_transaction_success(auth_client, user, expense_category):
    payload = {
        "name": "Rent",
        "category": expense_category.id,
        "type": "expense",
        "amount": "1200.00",
        "frequency": "monthly",
        "start_date": "2026-09-01",
    }
    response = auth_client.post(reverse("recurringtransaction-list"), payload, format="json")

    assert response.status_code == status.HTTP_201_CREATED
    recurring = RecurringTransaction.objects.get(id=response.data["id"])
    assert recurring.user == user
    assert recurring.amount == Decimal("1200.00")
    # is_active isn't in the payload at all — a real (JSON) client omitting
    # it should get the model's default, not an HTML-checkbox-style False.
    assert recurring.is_active is True


@pytest.mark.django_db
def test_create_recurring_transaction_sets_next_occurrence_to_start_date(
    auth_client, expense_category
):
    payload = {
        "name": "Rent",
        "category": expense_category.id,
        "type": "expense",
        "amount": "1200.00",
        "frequency": "monthly",
        "start_date": "2026-09-01",
    }
    response = auth_client.post(reverse("recurringtransaction-list"), payload)

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["next_occurrence_date"] == "2026-09-01"


@pytest.mark.django_db
def test_create_recurring_transaction_ignores_client_supplied_next_occurrence_date(
    auth_client, expense_category
):
    payload = {
        "name": "Rent",
        "category": expense_category.id,
        "type": "expense",
        "amount": "1200.00",
        "frequency": "monthly",
        "start_date": "2026-09-01",
        "next_occurrence_date": "2099-01-01",
    }
    response = auth_client.post(reverse("recurringtransaction-list"), payload)

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["next_occurrence_date"] == "2026-09-01"


@pytest.mark.django_db
def test_create_recurring_transaction_ignores_client_supplied_user(
    auth_client, user, other_user, expense_category
):
    payload = {
        "name": "Rent",
        "category": expense_category.id,
        "type": "expense",
        "amount": "1200.00",
        "frequency": "monthly",
        "start_date": "2026-09-01",
        "user": other_user.id,
    }
    response = auth_client.post(reverse("recurringtransaction-list"), payload)

    assert response.status_code == status.HTTP_201_CREATED
    recurring = RecurringTransaction.objects.get(id=response.data["id"])
    assert recurring.user == user


@pytest.mark.parametrize("frequency", ["weekly", "monthly", "yearly"])
@pytest.mark.django_db
def test_create_recurring_transaction_supports_all_frequencies(
    auth_client, expense_category, frequency
):
    payload = {
        "name": "Subscription",
        "category": expense_category.id,
        "type": "expense",
        "amount": "9.99",
        "frequency": frequency,
        "start_date": "2026-09-01",
    }
    response = auth_client.post(reverse("recurringtransaction-list"), payload)

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["frequency"] == frequency


@pytest.mark.django_db
def test_create_recurring_transaction_invalid_frequency_rejected(auth_client, expense_category):
    payload = {
        "name": "Subscription",
        "category": expense_category.id,
        "type": "expense",
        "amount": "9.99",
        "frequency": "daily",
        "start_date": "2026-09-01",
    }
    response = auth_client.post(reverse("recurringtransaction-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "frequency" in response.data


@pytest.mark.django_db
def test_create_recurring_transaction_negative_amount_rejected(auth_client, expense_category):
    payload = {
        "name": "Broken",
        "category": expense_category.id,
        "type": "expense",
        "amount": "-10.00",
        "frequency": "monthly",
        "start_date": "2026-09-01",
    }
    response = auth_client.post(reverse("recurringtransaction-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "amount" in response.data


@pytest.mark.django_db
def test_create_recurring_transaction_type_category_mismatch_rejected(
    auth_client, expense_category
):
    payload = {
        "name": "Broken",
        "category": expense_category.id,
        "type": "income",
        "amount": "10.00",
        "frequency": "monthly",
        "start_date": "2026-09-01",
    }
    response = auth_client.post(reverse("recurringtransaction-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "type" in response.data


@pytest.mark.django_db
def test_create_recurring_transaction_with_other_users_category_rejected(
    auth_client, other_user_expense_category
):
    payload = {
        "name": "Broken",
        "category": other_user_expense_category.id,
        "type": "expense",
        "amount": "10.00",
        "frequency": "monthly",
        "start_date": "2026-09-01",
    }
    response = auth_client.post(reverse("recurringtransaction-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "category" in response.data


@pytest.mark.django_db
def test_create_recurring_transaction_end_date_before_start_date_rejected(
    auth_client, expense_category
):
    payload = {
        "name": "Insurance",
        "category": expense_category.id,
        "type": "expense",
        "amount": "100.00",
        "frequency": "yearly",
        "start_date": "2026-09-01",
        "end_date": "2026-08-01",
    }
    response = auth_client.post(reverse("recurringtransaction-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "end_date" in response.data


@pytest.mark.django_db
def test_create_recurring_transaction_missing_name_rejected(auth_client, expense_category):
    payload = {
        "category": expense_category.id,
        "type": "expense",
        "amount": "10.00",
        "frequency": "monthly",
        "start_date": "2026-09-01",
    }
    response = auth_client.post(reverse("recurringtransaction-list"), payload)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "name" in response.data


@pytest.mark.django_db
def test_create_recurring_transaction_unauthenticated_rejected(api_client, expense_category):
    payload = {
        "name": "Rent",
        "category": expense_category.id,
        "type": "expense",
        "amount": "1200.00",
        "frequency": "monthly",
        "start_date": "2026-09-01",
    }
    response = api_client.post(reverse("recurringtransaction-list"), payload)

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_partial_update_recurring_transaction_patch_success(
    auth_client, user, expense_category
):
    recurring = _create_recurring(user, expense_category, amount=Decimal("15.99"))

    response = auth_client.patch(
        reverse("recurringtransaction-detail", args=[recurring.id]), {"amount": "17.99"}
    )

    assert response.status_code == status.HTTP_200_OK
    recurring.refresh_from_db()
    assert recurring.amount == Decimal("17.99")


@pytest.mark.django_db
def test_update_start_date_advances_next_occurrence_date(auth_client, user, expense_category):
    recurring = _create_recurring(
        user,
        expense_category,
        start_date=date(2026, 9, 1),
        next_occurrence_date=date(2026, 9, 1),
    )

    response = auth_client.patch(
        reverse("recurringtransaction-detail", args=[recurring.id]),
        {"start_date": "2026-10-01"},
    )

    assert response.status_code == status.HTTP_200_OK
    recurring.refresh_from_db()
    assert recurring.next_occurrence_date == date(2026, 10, 1)


@pytest.mark.django_db
def test_update_without_start_date_change_keeps_next_occurrence_date(
    auth_client, user, expense_category
):
    recurring = _create_recurring(
        user,
        expense_category,
        start_date=date(2026, 9, 1),
        next_occurrence_date=date(2026, 9, 1),
    )

    response = auth_client.patch(
        reverse("recurringtransaction-detail", args=[recurring.id]),
        {"description": "Updated note"},
    )

    assert response.status_code == status.HTTP_200_OK
    recurring.refresh_from_db()
    assert recurring.next_occurrence_date == date(2026, 9, 1)


@pytest.mark.django_db
def test_deactivate_recurring_transaction(auth_client, user, expense_category):
    recurring = _create_recurring(user, expense_category, is_active=True)

    response = auth_client.patch(
        reverse("recurringtransaction-detail", args=[recurring.id]), {"is_active": False}
    )

    assert response.status_code == status.HTTP_200_OK
    recurring.refresh_from_db()
    assert recurring.is_active is False


@pytest.mark.django_db
def test_update_other_users_recurring_transaction_returns_404(
    auth_client, other_user, other_user_expense_category
):
    other_recurring = _create_recurring(other_user, other_user_expense_category)

    response = auth_client.patch(
        reverse("recurringtransaction-detail", args=[other_recurring.id]),
        {"amount": "99.00"},
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    other_recurring.refresh_from_db()
    assert other_recurring.amount != Decimal("99.00")


@pytest.mark.django_db
def test_delete_recurring_transaction_success(auth_client, user, expense_category):
    recurring = _create_recurring(user, expense_category)

    response = auth_client.delete(
        reverse("recurringtransaction-detail", args=[recurring.id])
    )

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not RecurringTransaction.objects.filter(id=recurring.id).exists()


@pytest.mark.django_db
def test_delete_other_users_recurring_transaction_returns_404_and_is_not_deleted(
    auth_client, other_user, other_user_expense_category
):
    other_recurring = _create_recurring(other_user, other_user_expense_category)

    response = auth_client.delete(
        reverse("recurringtransaction-detail", args=[other_recurring.id])
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert RecurringTransaction.objects.filter(id=other_recurring.id).exists()


@pytest.mark.django_db
def test_delete_nonexistent_recurring_transaction_returns_404(auth_client):
    response = auth_client.delete(
        reverse("recurringtransaction-detail", args=[999999])
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_list_unauthenticated_rejected(api_client):
    response = api_client.get(reverse("recurringtransaction-list"))
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_list_ordered_by_next_occurrence_date(auth_client, user, expense_category):
    later = _create_recurring(
        user,
        expense_category,
        name="Insurance",
        start_date=date(2026, 12, 1),
        next_occurrence_date=date(2026, 12, 1),
    )
    sooner = _create_recurring(
        user,
        expense_category,
        name="Rent",
        start_date=date(2026, 9, 1),
        next_occurrence_date=date(2026, 9, 1),
    )

    response = auth_client.get(reverse("recurringtransaction-list"))

    assert response.status_code == status.HTTP_200_OK
    names = [item["name"] for item in response.data]
    assert names == [sooner.name, later.name]


@pytest.mark.django_db
def test_end_date_can_be_null(auth_client, expense_category):
    payload = {
        "name": "Ongoing subscription",
        "category": expense_category.id,
        "type": "expense",
        "amount": "9.99",
        "frequency": "monthly",
        "start_date": "2026-09-01",
    }
    response = auth_client.post(reverse("recurringtransaction-list"), payload)

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["end_date"] is None


@pytest.mark.django_db
def test_end_date_equal_to_start_date_accepted(auth_client, expense_category):
    payload = {
        "name": "One-off-ish",
        "category": expense_category.id,
        "type": "expense",
        "amount": "9.99",
        "frequency": "yearly",
        "start_date": "2026-09-01",
        "end_date": "2026-09-01",
    }
    response = auth_client.post(reverse("recurringtransaction-list"), payload)

    assert response.status_code == status.HTTP_201_CREATED
