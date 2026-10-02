"""Two-factor authentication: the TOTP algorithm, setup, sign-in, recovery codes, storage."""

import pytest
from django.urls import reverse

from apps.users import crypto, mfa
from apps.users.models import AuditAction, AuditEvent, RecoveryCode, TotpDevice

PASSWORD = "testpass123"  # the `user` fixture's password


# --- The algorithm against the RFCs ----------------------------------------------------------


def test_hotp_matches_rfc4226_test_vectors():
    key = b"12345678901234567890"
    expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"]
    assert [mfa.hotp(key, counter) for counter in range(10)] == expected


@pytest.mark.parametrize(
    ("unix_time", "code"),
    [
        (59, "94287082"),
        (1111111109, "07081804"),
        (1111111111, "14050471"),
        (1234567890, "89005924"),
        (2000000000, "69279037"),
    ],
)
def test_totp_matches_rfc6238_test_vectors(unix_time, code):
    assert mfa.hotp(b"12345678901234567890", mfa.current_step(unix_time), digits=8) == code


def test_codes_are_accepted_one_step_either_side_only():
    secret = mfa.generate_secret()
    now = 1_790_000_000
    key = mfa._key(secret)
    step = mfa.current_step(now)

    for offset in (-1, 0, 1):
        assert mfa.matching_step(secret, mfa.hotp(key, step + offset), now) == step + offset
    for offset in (-2, 2):
        assert mfa.matching_step(secret, mfa.hotp(key, step + offset), now) is None
    assert mfa.matching_step(secret, "12 34", now) is None
    assert mfa.matching_step(secret, "abcdef", now) is None


def test_secret_is_160_random_bits_in_base32():
    secrets = {mfa.generate_secret() for _ in range(20)}
    assert len(secrets) == 20
    assert all(len(secret) == 32 and secret.isalnum() and secret.isupper() for secret in secrets)


def test_provisioning_uri_for_authenticator_apps(user):
    uri = mfa.provisioning_uri("JBSWY3DPEHPK3PXP", user.email)
    assert uri.startswith("otpauth://totp/WALLEX:testuser%40example.com?")
    assert "secret=JBSWY3DPEHPK3PXP" in uri and "issuer=WALLEX" in uri


# --- Helpers -------------------------------------------------------------------------------


@pytest.fixture
def clock(monkeypatch):
    """Controls the time TOTP codes are checked against."""
    state = {"now": 1_790_000_000.0}
    monkeypatch.setattr(mfa, "_now", lambda: state["now"])
    return state


def _code(user, clock, offset=0) -> str:
    secret = crypto.decrypt(TotpDevice.objects.get(user=user).encrypted_secret)
    return mfa.hotp(mfa._key(secret), mfa.current_step(clock["now"]) + offset)


def _enable(auth_client, user, clock) -> list[str]:
    assert auth_client.post(reverse("auth-2fa-setup"), {"password": PASSWORD}).status_code == 200
    response = auth_client.post(reverse("auth-2fa-confirm"), {"code": _code(user, clock)})
    assert response.status_code == 200, response.data
    return response.data["recovery_codes"]


def _password_step(api_client, user):
    response = api_client.post(reverse("auth-login"), {"email": user.email, "password": PASSWORD})
    assert response.status_code == 200, response.data
    return response.data


# --- Turning it on and off ---------------------------------------------------------------------


@pytest.mark.django_db
def test_setup_needs_the_password(auth_client):
    response = auth_client.post(reverse("auth-2fa-setup"), {"password": "wrong"})

    assert response.status_code == 400
    assert response.data == {"password": ["Wrong password."]}


@pytest.mark.django_db
def test_setup_then_confirm_turns_it_on(auth_client, user, clock):
    setup = auth_client.post(reverse("auth-2fa-setup"), {"password": PASSWORD}).data
    assert setup["otpauth_uri"].startswith("otpauth://totp/WALLEX:")
    assert auth_client.get(reverse("auth-2fa")).data["enabled"] is False  # not before the code proves it works

    codes = _enable(auth_client, user, clock)

    status = auth_client.get(reverse("auth-2fa")).data
    assert status["enabled"] is True and status["recovery_codes_left"] == 10
    assert len(set(codes)) == 10
    assert AuditEvent.objects.filter(user=user, action=AuditAction.MFA_ENABLED).exists()


@pytest.mark.django_db
def test_a_wrong_code_does_not_turn_it_on(auth_client, clock):
    auth_client.post(reverse("auth-2fa-setup"), {"password": PASSWORD})

    response = auth_client.post(reverse("auth-2fa-confirm"), {"code": "000000"})

    assert response.status_code == 400
    assert auth_client.get(reverse("auth-2fa")).data["enabled"] is False


@pytest.mark.django_db
def test_the_secret_and_recovery_codes_are_unreadable_in_the_database(auth_client, user, clock):
    setup = auth_client.post(reverse("auth-2fa-setup"), {"password": PASSWORD}).data
    codes = auth_client.post(reverse("auth-2fa-confirm"), {"code": _code(user, clock)}).data["recovery_codes"]

    stored = TotpDevice.objects.get(user=user).encrypted_secret
    assert setup["secret"] not in stored
    assert crypto.decrypt(stored) == setup["secret"]
    hashes = set(RecoveryCode.objects.filter(user=user).values_list("code_hash", flat=True))
    assert not any(code.replace("-", "") in "".join(hashes) for code in codes)


@pytest.mark.django_db
def test_another_encryption_key_cannot_read_the_secret(auth_client, user, clock, settings):
    _enable(auth_client, user, clock)
    settings.FIELD_ENCRYPTION_KEY = "a-completely-different-key-" + "z" * 40

    with pytest.raises(crypto.DecryptionError):
        crypto.decrypt(TotpDevice.objects.get(user=user).encrypted_secret)


@pytest.mark.django_db
def test_setup_again_while_on_is_refused(auth_client, user, clock):
    _enable(auth_client, user, clock)

    response = auth_client.post(reverse("auth-2fa-setup"), {"password": PASSWORD})

    assert response.status_code == 400


@pytest.mark.django_db
def test_turning_it_off_needs_password_and_code(auth_client, api_client, user, clock):
    _enable(auth_client, user, clock)

    assert auth_client.post(reverse("auth-2fa-disable"), {"password": PASSWORD, "code": "000000"}).status_code == 400
    assert (
        auth_client.post(reverse("auth-2fa-disable"), {"password": "x", "code": _code(user, clock, 1)}).status_code
        == 400
    )
    response = auth_client.post(reverse("auth-2fa-disable"), {"password": PASSWORD, "code": _code(user, clock, 1)})

    assert response.status_code == 200
    assert "access" in _password_step(api_client, user)  # the password alone is enough again
    assert AuditEvent.objects.filter(user=user, action=AuditAction.MFA_DISABLED).exists()


# --- Signing in -------------------------------------------------------------------------------


@pytest.mark.django_db
def test_the_password_alone_gives_no_tokens(auth_client, api_client, user, clock):
    _enable(auth_client, user, clock)

    answer = _password_step(api_client, user)

    assert answer["mfa_required"] is True
    assert "access" not in answer and "refresh" not in answer


@pytest.mark.django_db
def test_signing_in_with_the_authenticator(auth_client, api_client, user, clock):
    _enable(auth_client, user, clock)
    challenge = _password_step(api_client, user)["mfa_token"]

    response = api_client.post(reverse("auth-login-verify"), {"mfa_token": challenge, "code": _code(user, clock, 1)})

    assert response.status_code == 200
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
    assert api_client.get(reverse("auth-me")).data["email"] == user.email
    event = AuditEvent.objects.filter(user=user, action=AuditAction.LOGIN_SUCCEEDED).latest("id")
    assert event.metadata["method"] == "totp"


@pytest.mark.django_db
def test_a_code_works_only_once(auth_client, api_client, user, clock):
    _enable(auth_client, user, clock)
    code = _code(user, clock, 1)
    first = api_client.post(
        reverse("auth-login-verify"), {"mfa_token": _password_step(api_client, user)["mfa_token"], "code": code}
    )

    replay = api_client.post(
        reverse("auth-login-verify"), {"mfa_token": _password_step(api_client, user)["mfa_token"], "code": code}
    )

    assert (first.status_code, replay.status_code) == (200, 401)


@pytest.mark.django_db
def test_a_wrong_code_is_refused_and_logged(auth_client, api_client, user, clock):
    _enable(auth_client, user, clock)

    response = api_client.post(
        reverse("auth-login-verify"), {"mfa_token": _password_step(api_client, user)["mfa_token"], "code": "000000"}
    )

    assert response.status_code == 401
    assert response.data["code"] == "mfa_code_invalid"
    assert AuditEvent.objects.filter(user=user, action=AuditAction.MFA_FAILED).count() == 1


@pytest.mark.django_db
def test_a_tampered_or_expired_challenge_is_refused(auth_client, api_client, user, clock, monkeypatch):
    _enable(auth_client, user, clock)
    challenge = _password_step(api_client, user)["mfa_token"]

    tampered = api_client.post(
        reverse("auth-login-verify"), {"mfa_token": challenge[:-2] + "xx", "code": _code(user, clock, 1)}
    )
    monkeypatch.setattr(mfa, "CHALLENGE_MAX_AGE", -1)
    expired = api_client.post(reverse("auth-login-verify"), {"mfa_token": challenge, "code": _code(user, clock, 1)})

    assert tampered.status_code == expired.status_code == 401
    assert expired.data["code"] == "mfa_challenge_invalid"


@pytest.mark.django_db
def test_wrong_codes_count_toward_the_account_lock(auth_client, api_client, user, clock):
    _enable(auth_client, user, clock)
    challenge = _password_step(api_client, user)["mfa_token"]
    for _ in range(5):
        api_client.post(reverse("auth-login-verify"), {"mfa_token": challenge, "code": "000000"})

    right_code = api_client.post(reverse("auth-login-verify"), {"mfa_token": challenge, "code": _code(user, clock, 1)})

    assert right_code.status_code == 429
    assert right_code.data["code"] == "account_locked"


@pytest.mark.django_db
def test_a_recovery_code_signs_in_once(auth_client, api_client, user, clock):
    codes = _enable(auth_client, user, clock)
    verify = lambda code: api_client.post(  # noqa: E731
        reverse("auth-login-verify"), {"mfa_token": _password_step(api_client, user)["mfa_token"], "code": code}
    )

    assert verify(codes[0].upper()).status_code == 200  # case and dashes don't matter
    assert verify(codes[0]).status_code == 401
    assert auth_client.get(reverse("auth-2fa")).data["recovery_codes_left"] == 9
    assert AuditEvent.objects.get(user=user, action=AuditAction.RECOVERY_CODE_USED).metadata == {"remaining": 9}


@pytest.mark.django_db
def test_new_recovery_codes_replace_the_old_ones(auth_client, api_client, user, clock):
    old = _enable(auth_client, user, clock)

    new = auth_client.post(
        reverse("auth-2fa-recovery-codes"), {"password": PASSWORD, "code": _code(user, clock, 1)}
    ).data["recovery_codes"]

    assert set(new).isdisjoint(old)
    response = api_client.post(
        reverse("auth-login-verify"), {"mfa_token": _password_step(api_client, user)["mfa_token"], "code": old[1]}
    )
    assert response.status_code == 401
