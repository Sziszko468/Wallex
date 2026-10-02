"""Account security: sessions and devices, token theft detection, signing out everywhere,
per-account brute-force lock, the browser cookie transport, the password, and the audit log."""

from datetime import timedelta
from decimal import Decimal

import jwt
import pytest
from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.categories.models import Category, TransactionType
from apps.transactions.models import Transaction
from apps.users import lockout
from apps.users.models import AuditAction, AuditEvent, RevokeReason, UserSession

PASSWORD = "testpass123"  # the `user` fixture's password
STRONG = "a sturdy passphrase 2026"


def _sign_in(user, platform="web", agent="Mozilla/5.0 (Macintosh) Firefox/135.0", **headers) -> APIClient:
    """A device: its own client and session, like a real browser or phone."""
    client = APIClient(HTTP_USER_AGENT=agent)
    response = client.post(
        reverse("auth-login"), {"email": user.email, "password": PASSWORD}, HTTP_X_CLIENT_PLATFORM=platform, **headers
    )
    assert response.status_code == 200, response.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
    client.refresh_token = response.data.get("refresh")
    return client


def _refresh(token: str):
    return APIClient().post(reverse("auth-refresh"), {"refresh": token})


def _me(client) -> int:
    return client.get(reverse("auth-me")).status_code


# --- Sessions: one per device ---------------------------------------------------------------


@pytest.mark.django_db
def test_every_sign_in_is_a_session_listed_with_its_device(user):
    laptop = _sign_in(user, "web")
    _sign_in(user, "ios", agent="WALLEX/1.0 CFNetwork Darwin")

    rows = laptop.get(reverse("session-list")).data

    assert [(row["platform"], row["current"]) for row in rows] == [("ios", False), ("web", True)]
    assert rows[1]["user_agent"].startswith("Mozilla/5.0") and rows[1]["ip_address"] == "127.0.0.1"


@pytest.mark.django_db
def test_signing_a_lost_phone_out_stops_its_tokens_at_once(user):
    laptop = _sign_in(user, "web")
    phone = _sign_in(user, "android")
    phone_session = next(row for row in laptop.get(reverse("session-list")).data if row["platform"] == "android")

    assert laptop.delete(reverse("session-detail", args=[phone_session["id"]])).status_code == 204

    assert _me(phone) == 401  # its access token hasn't expired, and still doesn't work
    assert _refresh(phone.refresh_token).status_code == 401
    assert _me(laptop) == 200
    assert AuditEvent.objects.filter(user=user, action=AuditAction.SESSION_REVOKED).exists()


@pytest.mark.django_db
def test_someone_elses_session_cannot_be_signed_out(user, other_user):
    mine = _sign_in(user)
    _sign_in(other_user)
    theirs = UserSession.objects.get(user=other_user)

    assert mine.delete(reverse("session-detail", args=[theirs.pk])).status_code == 404
    theirs.refresh_from_db()
    assert theirs.revoked_at is None


@pytest.mark.django_db
def test_sign_out_everywhere(user):
    devices = [_sign_in(user, platform) for platform in ("web", "ios", "android")]

    response = devices[0].post(reverse("auth-logout-all"))

    assert response.data == {"revoked_sessions": 3}
    assert [_me(device) for device in devices] == [401, 401, 401]
    assert [_refresh(device.refresh_token).status_code for device in devices] == [401, 401, 401]
    assert AuditEvent.objects.get(user=user, action=AuditAction.LOGOUT_ALL).metadata == {"sessions": 3}


@pytest.mark.django_db
def test_refreshing_stays_in_the_same_session(user):
    device = _sign_in(user)
    session = UserSession.objects.get(user=user)

    rotated = _refresh(device.refresh_token)

    assert rotated.status_code == 200
    claims = jwt.decode(rotated.data["refresh"], options={"verify_signature": False})
    assert claims["sid"] == str(session.key)
    assert UserSession.objects.count() == 1


@pytest.mark.django_db
def test_a_reused_refresh_token_revokes_the_whole_session(user):
    """A copied refresh token racing the real device: both lose the session, the event is logged."""
    device = _sign_in(user)
    stolen = device.refresh_token
    new_pair = _refresh(stolen).data  # the real device refreshes
    UserSession.objects.update(rotated_at=timezone.now() - timedelta(minutes=1))

    thief = _refresh(stolen)

    assert thief.status_code == 401
    session = UserSession.objects.get(user=user)
    assert session.revoked_reason == RevokeReason.TOKEN_REUSE
    assert _refresh(new_pair["refresh"]).status_code == 401  # the real device must sign in again too
    assert AuditEvent.objects.filter(user=user, action=AuditAction.REFRESH_TOKEN_REUSED).exists()


@pytest.mark.django_db
def test_a_quick_retry_after_a_lost_response_is_not_theft(user):
    device = _sign_in(user)
    _refresh(device.refresh_token)  # the answer never reached the phone

    retry = _refresh(device.refresh_token)

    assert retry.status_code == 200
    assert UserSession.objects.get(user=user).revoked_at is None


@pytest.mark.django_db
def test_a_session_ends_after_30_days_however_active(user):
    device = _sign_in(user)
    UserSession.objects.update(expires_at=timezone.now() - timedelta(seconds=1))

    assert _refresh(device.refresh_token).status_code == 401
    assert _me(device) == 401
    assert UserSession.objects.get(user=user).revoked_reason == RevokeReason.EXPIRED


@pytest.mark.django_db
def test_tokens_without_a_session_are_refused(api_client, user):
    from rest_framework_simplejwt.tokens import RefreshToken

    legacy = RefreshToken.for_user(user)  # what the API issued before sessions existed
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {legacy.access_token}")

    assert api_client.get(reverse("auth-me")).status_code == 401
    assert _refresh(str(legacy)).status_code == 401


@pytest.mark.django_db
def test_tokens_for_another_audience_are_refused(api_client, user):
    device = _sign_in(user)
    claims = jwt.decode(device._credentials["HTTP_AUTHORIZATION"].split()[1], options={"verify_signature": False})
    foreign = jwt.encode({**claims, "aud": "another-api"}, settings.SIMPLE_JWT["SIGNING_KEY"], algorithm="HS256")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {foreign}")

    assert claims["iss"] == "wallex" and claims["aud"] == "wallex-api"
    assert api_client.get(reverse("auth-me")).status_code == 401


# --- Brute force: the per-account lock ----------------------------------------------------------


def _attempt(email, password, ip):
    return APIClient().post(reverse("auth-login"), {"email": email, "password": password}, REMOTE_ADDR=ip)


@pytest.mark.django_db
def test_five_wrong_passwords_lock_the_account_even_from_other_addresses(user):
    codes = [_attempt(user.email, "wrong", f"10.0.0.{i}").status_code for i in range(5)]

    locked = _attempt(user.email, PASSWORD, "10.0.0.99")  # right password, fresh address

    assert codes == [401] * 5
    assert locked.status_code == 429
    assert locked.data["code"] == "account_locked"
    assert 0 < int(locked["Retry-After"]) <= 15 * 60
    assert AuditEvent.objects.filter(user=user, action=AuditAction.LOGIN_BLOCKED).count() == 1


@pytest.mark.django_db
def test_an_unknown_address_is_locked_the_same_way(db):
    for i in range(5):
        _attempt("nobody@example.com", "wrong", f"10.0.1.{i}")

    assert _attempt("nobody@example.com", "wrong", "10.0.1.99").data["code"] == "account_locked"


@pytest.mark.django_db
def test_the_lock_ends_after_15_minutes(user):
    for i in range(5):
        _attempt(user.email, "wrong", f"10.0.2.{i}")
    AuditEvent.objects.filter(action=AuditAction.LOGIN_FAILED).update(created_at=timezone.now() - timedelta(minutes=16))

    assert _attempt(user.email, PASSWORD, "10.0.2.99").status_code == 200


@pytest.mark.django_db
def test_a_successful_sign_in_resets_the_count(user):
    for i in range(4):
        _attempt(user.email, "wrong", f"10.0.3.{i}")
    assert _attempt(user.email, PASSWORD, "10.0.3.50").status_code == 200
    for i in range(4):
        _attempt(user.email, "wrong", f"10.0.3.{10 + i}")

    assert lockout.retry_after(user.email) == 0


# --- Browser transport: HttpOnly cookie ---------------------------------------------------


COOKIE = settings.AUTH_REFRESH_COOKIE["NAME"]


@pytest.mark.django_db
def test_browsers_get_the_refresh_token_only_as_an_httponly_cookie(user):
    browser = APIClient()

    response = browser.post(
        reverse("auth-login"), {"email": user.email, "password": PASSWORD}, HTTP_X_AUTH_TRANSPORT="cookie"
    )

    assert set(response.data) == {"access"}  # page scripts never see the refresh token
    cookie = response.cookies[COOKIE]
    assert cookie["httponly"] and cookie["samesite"] == "Strict" and cookie["path"] == "/api/auth/"
    assert int(cookie["max-age"]) == int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())


@pytest.mark.django_db
def test_the_cookie_refreshes_and_rotates(user):
    browser = APIClient()
    browser.post(reverse("auth-login"), {"email": user.email, "password": PASSWORD}, HTTP_X_AUTH_TRANSPORT="cookie")
    first = browser.cookies[COOKIE].value

    response = browser.post(reverse("auth-refresh"), HTTP_X_AUTH_TRANSPORT="cookie")

    assert response.status_code == 200 and set(response.data) == {"access"}
    assert browser.cookies[COOKIE].value != first


@pytest.mark.django_db
def test_the_cookie_is_ignored_without_the_header(user):
    """CSRF: a cross-site request can't add the custom header, so the cookie alone does nothing."""
    browser = APIClient()
    browser.post(reverse("auth-login"), {"email": user.email, "password": PASSWORD}, HTTP_X_AUTH_TRANSPORT="cookie")

    response = browser.post(reverse("auth-refresh"))

    assert response.status_code == 400


@pytest.mark.django_db
def test_signing_out_clears_the_cookie(user):
    browser = APIClient()
    login = browser.post(
        reverse("auth-login"), {"email": user.email, "password": PASSWORD}, HTTP_X_AUTH_TRANSPORT="cookie"
    )
    browser.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    response = browser.post(reverse("auth-logout"), HTTP_X_AUTH_TRANSPORT="cookie")

    assert response.cookies[COOKIE].value == "" and response.cookies[COOKIE]["max-age"] == 0
    browser.credentials()
    assert browser.post(reverse("auth-refresh"), HTTP_X_AUTH_TRANSPORT="cookie").status_code == 401


# --- The password -------------------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("password", "accepted"),
    [("short-pass1", False), ("x" * 129, False), ("123456789012", False), ("password1234", False), (STRONG, True)],
)
def test_password_policy_at_registration(api_client, password, accepted):
    response = api_client.post(
        reverse("auth-register"), {"email": "new@example.com", "password": password, "password_confirm": password}
    )
    assert (response.status_code == 201) is accepted, response.data


@pytest.mark.django_db
def test_changing_the_password_signs_the_other_devices_out(user):
    laptop = _sign_in(user, "web")
    phone = _sign_in(user, "ios")

    response = laptop.post(reverse("auth-password"), {"current_password": PASSWORD, "new_password": STRONG})

    assert response.status_code == 200 and response.data["revoked_sessions"] == 1
    assert (_me(laptop), _me(phone)) == (200, 401)
    assert _attempt(user.email, PASSWORD, "10.9.9.1").status_code == 401
    assert _attempt(user.email, STRONG, "10.9.9.2").status_code == 200
    assert AuditEvent.objects.filter(user=user, action=AuditAction.PASSWORD_CHANGED).exists()


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"current_password": "wrong", "new_password": STRONG}, "current_password"),
        ({"current_password": PASSWORD, "new_password": "too-short"}, "new_password"),
        ({"current_password": PASSWORD, "new_password": PASSWORD}, "new_password"),
    ],
)
def test_password_change_is_validated(user, body, field):
    response = _sign_in(user).post(reverse("auth-password"), body)

    assert response.status_code == 400 and field in response.data


# --- The audit log ------------------------------------------------------------------------------


@pytest.mark.django_db
def test_sign_ins_are_logged_with_device_and_address(user):
    _attempt(user.email, "wrong", "203.0.113.7")
    device = _sign_in(user, "ios", agent="WALLEX/1.0 iPhone")

    history = device.get(reverse("auth-security-events"), {"category": "login"}).data["results"]

    assert [event["action"] for event in history] == ["login_succeeded", "login_failed"]
    assert history[1]["ip_address"] == "203.0.113.7"
    assert history[0]["user_agent"] == "WALLEX/1.0 iPhone" and history[0]["category"] == "login"
    assert history[0]["metadata"] == {"method": "password", "platform": "ios"}


@pytest.mark.django_db
def test_the_security_log_shows_only_your_own_events(user, other_user):
    _attempt(other_user.email, "wrong", "198.51.100.1")
    _sign_in(other_user)
    mine = _sign_in(user)

    events = mine.get(reverse("auth-security-events")).data["results"]

    assert {event["action"] for event in events} == {"login_succeeded"}
    assert len(events) == 1


@pytest.mark.django_db
def test_imports_deletions_and_currency_changes_are_logged(user, add_rates):
    device = _sign_in(user)
    food = Category.objects.create(user=user, name="Food", type=TransactionType.EXPENSE)
    doomed = Transaction.objects.create(
        user=user, category=food, type="expense", amount=Decimal("5.00"), date=timezone.localdate()
    )
    csv = SimpleUploadedFile("bank.csv", f"date,description,amount\n{timezone.localdate()},Tesco,-3.00\n".encode())
    add_rates(timezone.localdate(), HUF="390.00")

    device.post(reverse("transaction-import-csv"), {"file": csv}, format="multipart")
    device.delete(reverse("transaction-detail", args=[doomed.pk]))
    device.patch(reverse("auth-me"), {"base_currency": "HUF"}, format="json")

    data = {
        event["action"]: event["metadata"]
        for event in device.get(reverse("auth-security-events"), {"category": "data"}).data["results"]
    }
    assert data["transactions_imported"] == {"imported": 1, "skipped": 0, "failed": 0}
    assert data["object_deleted"] == {"object_type": "transaction", "object_id": doomed.pk}
    assert data["base_currency_changed"] == {"previous": "EUR", "current": "HUF"}
    session = UserSession.objects.get(user=user)
    assert set(AuditEvent.objects.filter(action=AuditAction.OBJECT_DELETED).values_list("session_key", flat=True)) == {
        session.key
    }


@pytest.mark.django_db
def test_an_unknown_category_is_rejected(user):
    assert _sign_in(user).get(reverse("auth-security-events"), {"category": "everything"}).status_code == 400


@pytest.mark.django_db
def test_audit_events_cannot_be_edited(user):
    event = AuditEvent.objects.create(user=user, action=AuditAction.LOGIN_SUCCEEDED)
    event.action = AuditAction.LOGOUT

    with pytest.raises(ValueError, match="append-only"):
        event.save()


@pytest.mark.django_db
def test_old_security_records_are_pruned(user):
    _sign_in(user)
    old = timezone.now() - timedelta(days=400)
    AuditEvent.objects.create(user=user, action=AuditAction.LOGOUT)
    AuditEvent.objects.create(action=AuditAction.LOGIN_FAILED, email="ghost@example.com")
    AuditEvent.objects.filter(action=AuditAction.LOGOUT).update(created_at=old)
    AuditEvent.objects.filter(email="ghost@example.com").update(created_at=timezone.now() - timedelta(days=31))
    UserSession.objects.update(revoked_at=old, revoked_reason=RevokeReason.LOGOUT)

    call_command("prune_security_data", stdout=None)

    assert list(AuditEvent.objects.values_list("action", flat=True)) == ["login_succeeded"]
    assert not UserSession.objects.exists()
