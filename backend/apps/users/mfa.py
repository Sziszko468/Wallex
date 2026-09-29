"""Two-factor authentication with an authenticator app (TOTP, RFC 6238) and recovery codes.

TOTP is small and fully specified, so it is implemented here with the standard library
(checked against the RFC's test vectors) rather than with another dependency. Any
authenticator app works: Google Authenticator, Microsoft Authenticator, 1Password, …

- The secret is stored encrypted (apps/users/crypto.py) and shown only during setup.
- A code is accepted for the current 30-second step or one step either side (clock drift),
  and every step only once, so an intercepted code can't be replayed.
- Ten single-use recovery codes are issued when 2FA is turned on; only keyed hashes are kept.
- Signing in with 2FA is two requests: the password answers with a short-lived signed
  challenge (5 minutes) instead of tokens; the code plus the challenge gives the tokens.
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote, urlencode

from django.contrib.auth import get_user_model
from django.core import signing
from django.db import transaction
from django.utils import timezone

from . import crypto
from .models import RecoveryCode, TotpDevice

ISSUER = "Spendly"
DIGITS = 6
PERIOD = 30  # seconds
DRIFT_STEPS = 1
RECOVERY_CODE_COUNT = 10
CHALLENGE_MAX_AGE = 300  # seconds
_CHALLENGE_SALT = "spendly.users.mfa-challenge"


class MfaError(Exception):
    """The request can't be done (wrong state). The message is safe to show to the user."""


# --- TOTP (RFC 6238) ----------------------------------------------------------------------


def generate_secret() -> str:
    """160 random bits, base32 without padding (what authenticator apps expect)."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _key(secret: str) -> bytes:
    return base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)


def hotp(key: bytes, counter: int, digits: int = DIGITS) -> str:
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(number % 10**digits).zfill(digits)


def _now() -> float:
    """The clock codes are checked against (tests replace it)."""
    return time.time()


def current_step(now: float | None = None) -> int:
    return int((_now() if now is None else now) // PERIOD)


def matching_step(secret: str, code: str, now: float | None = None) -> int | None:
    """The time step `code` belongs to (±DRIFT_STEPS around now), or None."""
    code = "".join(code.split())
    if not (code.isdigit() and len(code) == DIGITS):
        return None
    key, step = _key(secret), current_step(now)
    for candidate in range(step - DRIFT_STEPS, step + DRIFT_STEPS + 1):
        if hmac.compare_digest(hotp(key, candidate), code):
            return candidate
    return None


def provisioning_uri(secret: str, email: str) -> str:
    """otpauth:// link: opens (or is scanned into) an authenticator app."""
    query = urlencode({"secret": secret, "issuer": ISSUER, "algorithm": "SHA1", "digits": DIGITS, "period": PERIOD})
    return f"otpauth://totp/{quote(ISSUER)}:{quote(email)}?{query}"


# --- Recovery codes -----------------------------------------------------------------------


def _normalize_recovery_code(code: str) -> str:
    return "".join(code.split()).replace("-", "").lower()


def _new_recovery_code() -> str:
    raw = base64.b32encode(secrets.token_bytes(5)).decode().lower()  # 8 chars, 40 bits
    return f"{raw[:4]}-{raw[4:]}"


def _issue_recovery_codes(user) -> list[str]:
    RecoveryCode.objects.filter(user=user).delete()
    codes = [_new_recovery_code() for _ in range(RECOVERY_CODE_COUNT)]
    RecoveryCode.objects.bulk_create(
        RecoveryCode(user=user, code_hash=crypto.keyed_hash(_normalize_recovery_code(code))) for code in codes
    )
    return codes


def recovery_codes_left(user) -> int:
    return RecoveryCode.objects.filter(user=user, used_at__isnull=True).count()


# --- Turning 2FA on and off ----------------------------------------------------------------


def confirmed_device(user) -> TotpDevice | None:
    return TotpDevice.objects.filter(user=user, confirmed_at__isnull=False).first()


def is_enabled(user) -> bool:
    return TotpDevice.objects.filter(user=user, confirmed_at__isnull=False).exists()


def start_setup(user) -> tuple[str, str]:
    """A new secret, not active until confirmed with a code. Returns (secret, otpauth URI)."""
    if is_enabled(user):
        raise MfaError("Two-factor authentication is already on. Turn it off first to set up a new authenticator.")
    secret = generate_secret()
    TotpDevice.objects.update_or_create(
        user=user, defaults={"encrypted_secret": crypto.encrypt(secret), "confirmed_at": None, "last_used_step": None}
    )
    return secret, provisioning_uri(secret, user.email)


@transaction.atomic
def confirm_setup(user, code: str) -> list[str]:
    """Turns 2FA on when `code` comes from the new authenticator. Returns the recovery codes."""
    device = TotpDevice.objects.select_for_update().filter(user=user, confirmed_at__isnull=True).first()
    if device is None:
        raise MfaError("Start the setup first.")
    step = matching_step(crypto.decrypt(device.encrypted_secret), code)
    if step is None:
        raise MfaError("That code isn't right. Check the time on your phone and try the newest code.")
    device.confirmed_at = timezone.now()
    device.last_used_step = step
    device.save(update_fields=["confirmed_at", "last_used_step"])
    return _issue_recovery_codes(user)


@transaction.atomic
def disable(user) -> None:
    TotpDevice.objects.filter(user=user).delete()
    RecoveryCode.objects.filter(user=user).delete()


@transaction.atomic
def regenerate_recovery_codes(user) -> list[str]:
    if not is_enabled(user):
        raise MfaError("Two-factor authentication is off.")
    return _issue_recovery_codes(user)


# --- Verifying a second factor ---------------------------------------------------------------


class Method:
    TOTP = "totp"
    RECOVERY_CODE = "recovery_code"


@transaction.atomic
def verify(user, code: str) -> str | None:
    """Checks an authenticator code or an unused recovery code. Returns the method used, or None.
    Either kind works once only."""
    device = TotpDevice.objects.select_for_update().filter(user=user, confirmed_at__isnull=False).first()
    if device is None:
        return None
    step = matching_step(crypto.decrypt(device.encrypted_secret), code)
    if step is not None:
        if device.last_used_step is not None and step <= device.last_used_step:
            return None  # replayed (or older than one already used)
        device.last_used_step = step
        device.save(update_fields=["last_used_step"])
        return Method.TOTP

    normalized = _normalize_recovery_code(code)
    if len(normalized) != 8:
        return None
    used = RecoveryCode.objects.filter(
        user=user, code_hash=crypto.keyed_hash(normalized), used_at__isnull=True
    ).update(used_at=timezone.now())
    return Method.RECOVERY_CODE if used else None


# --- The sign-in challenge (between the password and the code) --------------------------------------


def create_challenge(user) -> str:
    return signing.dumps({"uid": user.pk}, salt=_CHALLENGE_SALT, compress=True)


def read_challenge(token: str):
    """The user the challenge was issued to, or None when it is invalid or older than 5 minutes."""
    try:
        payload = signing.loads(token, salt=_CHALLENGE_SALT, max_age=CHALLENGE_MAX_AGE)
    except signing.BadSignature:  # SignatureExpired is a subclass
        return None
    return get_user_model().objects.filter(pk=payload.get("uid"), is_active=True).first()
