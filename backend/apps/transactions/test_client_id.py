"""Idempotent creation via client_id — what makes offline sync from the mobile app safe to retry."""

import uuid

import pytest
from django.urls import reverse
from rest_framework import status

from apps.transactions.models import Transaction

CLIENT_ID = "3f1c2a9e-8b7d-4c6e-9f0a-1b2c3d4e5f60"


def _payload(category_obj, **overrides):
    payload = {
        "category": category_obj.id,
        "type": "expense",
        "amount": "12.50",
        "date": "2026-09-20",
        "description": "Coffee",
        "client_id": CLIENT_ID,
    }
    payload.update(overrides)
    return payload


@pytest.mark.django_db
def test_create_with_client_id(auth_client, expense_category):
    response = auth_client.post(reverse("transaction-list"), _payload(expense_category), format="json")

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["client_id"] == CLIENT_ID
    assert Transaction.objects.get().client_id == uuid.UUID(CLIENT_ID)


@pytest.mark.django_db
def test_resending_the_same_client_id_returns_the_existing_transaction(auth_client, expense_category):
    first = auth_client.post(reverse("transaction-list"), _payload(expense_category), format="json")

    retry = auth_client.post(reverse("transaction-list"), _payload(expense_category), format="json")

    assert retry.status_code == status.HTTP_200_OK
    assert retry.data["id"] == first.data["id"]
    assert Transaction.objects.count() == 1


@pytest.mark.django_db
def test_retry_succeeds_even_if_the_payload_would_no_longer_validate(auth_client, expense_category):
    # The first attempt reached the server; if the stored payload has since gone stale,
    # that must not turn an already-successful sync into a failure.
    auth_client.post(reverse("transaction-list"), _payload(expense_category), format="json")

    retry = auth_client.post(
        reverse("transaction-list"), _payload(expense_category, category=999999), format="json"
    )

    assert retry.status_code == status.HTTP_200_OK
    assert Transaction.objects.count() == 1


@pytest.mark.django_db
def test_same_client_id_for_different_users_are_independent(
    auth_client, other_auth_client, expense_category, other_user_expense_category
):
    auth_client.post(reverse("transaction-list"), _payload(expense_category), format="json")

    response = other_auth_client.post(
        reverse("transaction-list"), _payload(other_user_expense_category), format="json"
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert Transaction.objects.count() == 2


@pytest.mark.django_db
def test_client_id_is_optional(auth_client, expense_category):
    payload = _payload(expense_category)
    del payload["client_id"]

    response = auth_client.post(reverse("transaction-list"), payload, format="json")

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["client_id"] is None


@pytest.mark.django_db
def test_invalid_client_id_rejected(auth_client, expense_category):
    response = auth_client.post(
        reverse("transaction-list"), _payload(expense_category, client_id="not-a-uuid"), format="json"
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "client_id" in response.data


@pytest.mark.django_db
def test_client_id_cannot_be_changed_later(auth_client, expense_category):
    transaction_id = auth_client.post(
        reverse("transaction-list"), _payload(expense_category), format="json"
    ).data["id"]

    response = auth_client.patch(
        reverse("transaction-detail", args=[transaction_id]), {"client_id": str(uuid.uuid4())}, format="json"
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["client_id"] == CLIENT_ID
