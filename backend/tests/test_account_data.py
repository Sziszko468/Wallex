"""The person's rights over their data: download everything (access, portability) and erase it.

The export must hold all of the user's data and nothing of anyone else's, and none of the secrets
that would help an attacker holding the file. The erasure must remove everything the user owns,
leave every other account alone, and need more than a borrowed signed-in device.
"""

import json
from datetime import date
from decimal import Decimal

import pytest
from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from apps.analytics.models import AssistantConversation, AssistantMessage
from apps.budgets.models import Budget, SavingsGoal
from apps.categories.models import Category, TransactionType
from apps.notifications.models import Device, Notification, NotificationKind
from apps.transactions.models import Frequency, RecurringTransaction, Transaction
from apps.users import data_export, mfa
from apps.users.models import AuditAction, AuditEvent, UserSession

User = get_user_model()
PASSWORD = "testpass123"
EXPORT = "auth-export"
DELETE = "auth-delete-account"
HU = {"HTTP_ACCEPT_LANGUAGE": "hu"}


def _fill(user, tag: str) -> None:
    """A little of everything the user can own."""
    food = Category.objects.create(user=user, name=f"Food {tag}", type=TransactionType.EXPENSE)
    Transaction.objects.create(
        user=user, category=food, type=TransactionType.EXPENSE, amount=Decimal("12.50"), date=date(2026, 9, 1),
        description=f"lunch {tag}",
    )  # fmt: skip
    RecurringTransaction.objects.create(
        user=user, category=food, name=f"Rent {tag}", type=TransactionType.EXPENSE, amount=Decimal("800.00"),
        frequency=Frequency.MONTHLY, start_date=date(2026, 1, 1), next_occurrence_date=date(2026, 10, 1),
        is_subscription=True,
    )  # fmt: skip
    Budget.objects.create(user=user, category=food, amount=Decimal("100.00"), year=2026, month=9)
    SavingsGoal.objects.create(user=user, name=f"Trip {tag}", target_amount=Decimal("500.00"))
    Notification.objects.create(
        user=user, kind=NotificationKind.BUDGET_WARNING, title=f"title {tag}", body="body", dedupe_key=f"key-{tag}"
    )
    Device.objects.create(user=user, expo_push_token=f"ExponentPushToken[secret-{tag}]", platform="ios")
    conversation = AssistantConversation.objects.create(user=user, title=f"question {tag}")
    AssistantMessage.objects.create(conversation=conversation, role="user", content=f"hello {tag}")


def _export(client, password=PASSWORD, **extra):
    return client.post(reverse(EXPORT), {"password": password}, format="json", **extra)


def _enable_two_factor(client) -> list[str]:
    secret = client.post(reverse("auth-2fa-setup"), {"password": PASSWORD}, format="json").data["secret"]
    code = mfa.hotp(mfa._key(secret), mfa.current_step())
    return client.post(reverse("auth-2fa-confirm"), {"code": code}, format="json").data["recovery_codes"]


# =============================== download my data =================================================


@pytest.mark.django_db
def test_the_export_holds_everything_of_the_users_own(auth_client, user):
    _fill(user, "mine")

    response = _export(auth_client)

    assert response.status_code == status.HTTP_200_OK
    data = json.loads(response.content)
    assert data["format_version"] == data_export.EXPORT_FORMAT_VERSION
    assert data["account"]["email"] == user.email
    assert data["account"]["language"] == "en"
    assert data["account"]["two_factor_enabled"] is False
    assert [row["description"] for row in data["transactions"]] == ["lunch mine"]
    assert [row["name"] for row in data["categories"]] == ["Food mine"]
    assert [row["name"] for row in data["recurring_transactions"]] == ["Rent mine"]  # subscriptions are in here
    assert [row["name"] for row in data["savings_goals"]] == ["Trip mine"]
    assert len(data["budgets"]) == 1
    assert [row["title"] for row in data["notifications"]] == ["title mine"]
    assert [row["title"] for row in data["assistant_conversations"]] == ["question mine"]
    assert [row["content"] for row in data["assistant_messages"]] == ["hello mine"]
    assert [row["platform"] for row in data["devices"]] == ["ios"]
    assert data["sessions"] and data["security_events"] is not None


@pytest.mark.django_db
def test_money_and_dates_arrive_as_exact_text(auth_client, user):
    _fill(user, "mine")

    row = json.loads(_export(auth_client).content)["transactions"][0]

    assert row["amount"] == "12.50"  # a decimal string, never a float
    assert row["date"] == "2026-09-01"


@pytest.mark.django_db
def test_nothing_of_anyone_elses_is_in_it(auth_client, user, other_user):
    _fill(user, "mine")
    _fill(other_user, "theirs")

    text = _export(auth_client).content.decode()

    assert "mine" in text
    assert "theirs" not in text
    assert other_user.email not in text


@pytest.mark.django_db
def test_secrets_are_left_out(auth_client, user):
    _fill(user, "mine")
    _enable_two_factor(auth_client)

    text = _export(auth_client).content.decode()

    assert "ExponentPushToken" not in text  # push tokens
    assert user.password not in text  # the password hash
    assert "pbkdf2" not in text
    session = UserSession.objects.filter(user=user).first()
    assert str(session.key) not in text and session.refresh_jti not in text  # session keys
    assert "encrypted_secret" not in text and "code_hash" not in text  # two-factor secret and recovery codes
    assert json.loads(text)["account"]["two_factor_enabled"] is True


@pytest.mark.django_db
def test_every_table_with_a_user_is_in_the_export_or_deliberately_not():
    """A model added tomorrow must be added to the export (or to this list, with a reason)."""
    deliberately_left_out = {
        "users.RecoveryCode",  # hashes of codes: secrets, not data
        "users.TotpDevice",  # the secret itself; `two_factor_enabled` says whether it exists
        "token_blacklist.OutstandingToken",  # JWT bookkeeping
        "admin.LogEntry",  # what a staff member did in the admin; ordinary users have none
    }
    covered_labels = {rows(None).model._meta.label for rows, _left_out in data_export.SECTIONS.values()}
    user_owned = {
        model._meta.label
        for model in apps.get_models()
        if not model._meta.proxy and any(field.name == "user" for field in model._meta.concrete_fields)
    }

    assert user_owned - covered_labels - deliberately_left_out == set()


@pytest.mark.django_db
def test_the_export_is_a_download(auth_client):
    response = _export(auth_client)

    assert response["Content-Type"].startswith("application/json")
    assert response["Content-Disposition"] == f'attachment; filename="wallex-export-{timezone.localdate()}.json"'


@pytest.mark.django_db
def test_the_password_is_asked_again(auth_client, user):
    wrong = _export(auth_client, password="not my password")
    missing = auth_client.post(reverse(EXPORT), {}, format="json")

    assert wrong.status_code == missing.status_code == status.HTTP_400_BAD_REQUEST
    assert "password" in wrong.data
    assert not AuditEvent.objects.filter(user=user, action=AuditAction.DATA_EXPORTED).exists()


@pytest.mark.django_db
def test_the_wrong_password_is_explained_in_hungarian(auth_client):
    response = _export(auth_client, password="nope", **HU)

    assert str(response.data["password"][0]) == "Hibás jelszó."


@pytest.mark.django_db
def test_a_download_is_recorded_in_the_security_log(auth_client, user):
    _export(auth_client)

    event = AuditEvent.objects.get(user=user, action=AuditAction.DATA_EXPORTED)
    assert event.get_action_display() == "Personal data downloaded"
    assert event.ip_address is not None


@pytest.mark.django_db
def test_signed_out_callers_get_nothing(api_client):
    assert api_client.post(reverse(EXPORT), {"password": PASSWORD}, format="json").status_code == 401
    assert api_client.post(reverse(DELETE), {"password": PASSWORD}, format="json").status_code == 401


@pytest.mark.django_db
def test_exports_are_rate_limited_like_other_sensitive_actions(auth_client, monkeypatch):
    monkeypatch.setattr(
        ScopedRateThrottle, "THROTTLE_RATES", {**ScopedRateThrottle.THROTTLE_RATES, "auth_sensitive": "2/hour"}
    )

    codes = [_export(auth_client).status_code for _ in range(3)]

    assert codes == [200, 200, 429]


# =============================== delete my account ================================================


@pytest.mark.django_db
def test_deleting_removes_the_account_and_everything_it_owns(auth_client, user):
    _fill(user, "mine")
    user_id = user.id

    response = auth_client.post(reverse(DELETE), {"password": PASSWORD}, format="json")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not User.objects.filter(pk=user_id).exists()
    for model in (Category, Transaction, RecurringTransaction, Budget, SavingsGoal, Notification, Device,
                  AssistantConversation, UserSession, AuditEvent):  # fmt: skip
        assert not model.objects.filter(user_id=user_id).exists(), model
    assert not AssistantMessage.objects.filter(conversation__user_id=user_id).exists()


@pytest.mark.django_db
def test_other_accounts_are_untouched(auth_client, user, other_user):
    _fill(user, "mine")
    _fill(other_user, "theirs")
    before = Transaction.objects.filter(user=other_user).count()

    auth_client.post(reverse(DELETE), {"password": PASSWORD}, format="json")

    assert User.objects.filter(pk=other_user.pk).exists()
    assert Transaction.objects.filter(user=other_user).count() == before
    assert Category.objects.filter(user=other_user).exists()
    assert AssistantMessage.objects.filter(conversation__user=other_user).exists()


@pytest.mark.django_db
def test_the_wrong_password_deletes_nothing(auth_client, user):
    _fill(user, "mine")

    response = auth_client.post(reverse(DELETE), {"password": "not my password"}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert User.objects.filter(pk=user.pk).exists()
    assert Transaction.objects.filter(user=user).exists()


@pytest.mark.django_db
def test_no_body_no_deletion(auth_client, user):
    assert auth_client.post(reverse(DELETE), {}, format="json").status_code == 400
    assert User.objects.filter(pk=user.pk).exists()


@pytest.mark.django_db
def test_a_deleted_account_cannot_sign_in_or_refresh(user):
    client = APIClient()
    login = client.post(reverse("auth-login"), {"email": user.email, "password": PASSWORD}, format="json")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
    assert client.post(reverse(DELETE), {"password": PASSWORD}, format="json").status_code == 204

    assert client.get(reverse("auth-me")).status_code == status.HTTP_401_UNAUTHORIZED  # the token is dead at once
    again = APIClient().post(reverse("auth-login"), {"email": user.email, "password": PASSWORD}, format="json")
    refreshed = APIClient().post(reverse("auth-refresh"), {"refresh": login.data["refresh"]}, format="json")
    assert again.status_code == status.HTTP_401_UNAUTHORIZED
    assert refreshed.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_the_refresh_cookie_is_cleared(user):
    client = APIClient()
    login = client.post(
        reverse("auth-login"),
        {"email": user.email, "password": PASSWORD},
        format="json",
        HTTP_X_AUTH_TRANSPORT="cookie",
    )
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    response = client.post(reverse(DELETE), {"password": PASSWORD}, format="json", HTTP_X_AUTH_TRANSPORT="cookie")

    assert response.status_code == 204
    assert response.cookies[settings.AUTH_REFRESH_COOKIE["NAME"]]["max-age"] == 0


@pytest.mark.django_db
def test_with_two_factor_on_the_password_alone_is_not_enough(auth_client, user):
    _enable_two_factor(auth_client)

    without_code = auth_client.post(reverse(DELETE), {"password": PASSWORD}, format="json")
    wrong_code = auth_client.post(reverse(DELETE), {"password": PASSWORD, "code": "000000"}, format="json")

    assert without_code.status_code == wrong_code.status_code == status.HTTP_400_BAD_REQUEST
    assert "code" in without_code.data and "code" in wrong_code.data
    assert User.objects.filter(pk=user.pk).exists()


@pytest.mark.django_db
def test_with_two_factor_on_a_recovery_code_completes_it(auth_client, user):
    recovery_codes = _enable_two_factor(auth_client)

    response = auth_client.post(reverse(DELETE), {"password": PASSWORD, "code": recovery_codes[0]}, format="json")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not User.objects.filter(pk=user.pk).exists()


@pytest.mark.django_db
def test_a_user_with_data_in_every_table_can_be_erased(auth_client, user):
    """Categories restrict their transactions' deletion; erasing the whole account must still work."""
    from django.core.management import call_command

    other = "reviewer@example.com"
    call_command("seed_demo", "--force", "--email", other, "--months", "3", "--password", "Demo!Password-2026")
    demo = User.objects.get(email=other)
    client = APIClient()
    login = client.post(reverse("auth-login"), {"email": other, "password": "Demo!Password-2026"}, format="json")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
    assert Transaction.objects.filter(user=demo).count() > 50

    response = client.post(reverse(DELETE), {"password": "Demo!Password-2026"}, format="json")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not Transaction.objects.filter(user_id=demo.id).exists()
    assert User.objects.filter(pk=user.pk).exists()


@pytest.mark.django_db
def test_a_web_app_on_another_origin_can_read_the_file_name(auth_client):
    """Browsers hide Content-Disposition from other origins unless the server exposes it: without it
    the download would be named `wallex-export.json` instead of carrying the date."""
    response = auth_client.post(
        reverse(EXPORT), {"password": PASSWORD}, format="json", HTTP_ORIGIN="http://localhost:5173"
    )

    assert "Content-Disposition" in response["Access-Control-Expose-Headers"]
