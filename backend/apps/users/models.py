import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.currencies.models import Currency


class User(AbstractUser):
    email = models.EmailField(unique=True)
    # Every total (analytics, budgets, subscription totals) is in this currency. Changed only
    # through apps.currencies.services.change_base_currency, which re-expresses the user's data.
    base_currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.EUR)
    # The language of the apps, and of every text the server writes for this user outside a request
    # (notifications, the assistant). Kept in step by the apps: PATCH /api/auth/me/.
    language = models.CharField(max_length=8, choices=settings.LANGUAGES, default=settings.LANGUAGE_CODE)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    class Meta:
        constraints = [
            # "Anna@x.com" and "anna@x.com" are the same mailbox: never two accounts.
            models.UniqueConstraint(Lower("email"), name="user_email_case_insensitive_unique"),
        ]


# --- Sessions: one per signed-in device ----------------------------------------------------


class ClientPlatform(models.TextChoices):
    WEB = "web", "Web"
    IOS = "ios", "iOS"
    ANDROID = "android", "Android"
    UNKNOWN = "unknown", "Unknown"


class RevokeReason(models.TextChoices):
    LOGOUT = "logout", "Logged out"
    LOGOUT_ALL = "logout_all", "Logged out everywhere"
    REVOKED = "revoked", "Signed out from another device"
    PASSWORD_CHANGED = "password_changed", "Password changed"
    TOKEN_REUSE = "token_reuse", "Refresh token reused (possible theft)"
    EXPIRED = "expired", "Session too old"


class UserSession(models.Model):
    """One login on one device, for as long as it lasts.

    Every token pair carries the session's `key` (the `sid` claim), so the session can be
    ended at any time and every token of it stops working at once — also access tokens that
    haven't expired yet (apps/users/authentication.py). The session also remembers which
    refresh token is the current one: presenting an older one means it was copied, and the
    whole session is revoked (apps/users/sessions.py).
    """

    key = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sessions")
    platform = models.CharField(max_length=10, choices=ClientPlatform.choices, default=ClientPlatform.UNKNOWN)
    user_agent = models.CharField(max_length=255, blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)  # at the last token refresh
    # The only refresh token (jti) that may be used next, and the one it replaced.
    refresh_jti = models.CharField(max_length=64)
    previous_refresh_jti = models.CharField(max_length=64, blank=True, default="")
    rotated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(default=timezone.now)
    # Absolute limit: after this the user must sign in again, however active the session is.
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_reason = models.CharField(max_length=20, choices=RevokeReason.choices, blank=True, default="")

    class Meta:
        ordering = ["-last_used_at", "-id"]
        indexes = [models.Index(fields=["user", "revoked_at"], name="session_user_active_idx")]

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None and self.expires_at > timezone.now()

    def __str__(self):
        return f"{self.get_platform_display()} session of {self.user}"


# --- Audit log -----------------------------------------------------------------------------


class AuditAction(models.TextChoices):
    ACCOUNT_CREATED = "account_created", _("Account created")
    LOGIN_SUCCEEDED = "login_succeeded", _("Signed in")
    LOGIN_FAILED = "login_failed", _("Wrong email or password")
    LOGIN_BLOCKED = "login_blocked", _("Sign-in blocked after too many failures")
    MFA_FAILED = "mfa_failed", _("Wrong two-factor code")
    LOGOUT = "logout", _("Signed out")
    LOGOUT_ALL = "logout_all", _("Signed out everywhere")
    SESSION_REVOKED = "session_revoked", _("Device signed out")
    REFRESH_TOKEN_REUSED = "refresh_token_reused", _("Stolen session blocked")
    PASSWORD_CHANGED = "password_changed", _("Password changed")
    MFA_ENABLED = "mfa_enabled", _("Two-factor authentication turned on")
    MFA_DISABLED = "mfa_disabled", _("Two-factor authentication turned off")
    RECOVERY_CODE_USED = "recovery_code_used", _("Recovery code used")
    RECOVERY_CODES_REGENERATED = "recovery_codes_regenerated", _("New recovery codes")
    BASE_CURRENCY_CHANGED = "base_currency_changed", _("Base currency changed")
    TRANSACTIONS_IMPORTED = "transactions_imported", _("Transactions imported")
    OBJECT_DELETED = "object_deleted", _("Deleted")
    DATA_EXPORTED = "data_exported", _("Personal data downloaded")


class AuditCategory(models.TextChoices):
    LOGIN = "login", _("Sign-in attempts")
    ACCOUNT = "account", _("Account and security changes")
    DATA = "data", _("Bulk and destructive data changes")


AUDIT_CATEGORIES: dict[str, set[str]] = {
    AuditCategory.LOGIN: {
        AuditAction.LOGIN_SUCCEEDED,
        AuditAction.LOGIN_FAILED,
        AuditAction.LOGIN_BLOCKED,
        AuditAction.MFA_FAILED,
    },
    AuditCategory.DATA: {
        AuditAction.BASE_CURRENCY_CHANGED,
        AuditAction.TRANSACTIONS_IMPORTED,
        AuditAction.OBJECT_DELETED,
    },
}
AUDIT_CATEGORIES[AuditCategory.ACCOUNT] = (
    set(AuditAction.values) - AUDIT_CATEGORIES[AuditCategory.LOGIN] - AUDIT_CATEGORIES[AuditCategory.DATA]
)


class AuditEvent(models.Model):
    """Append-only record of a security-relevant event: sign-ins (also failed ones), session and
    account changes, and bulk or destructive data changes. Written by apps/users/audit.py."""

    # Null for a failed sign-in with an address that has no account.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name="audit_events"
    )
    action = models.CharField(max_length=30, choices=AuditAction.choices)
    # For sign-in attempts: the address that was tried (lower-cased) — the per-account lockout counts by it.
    email = models.CharField(max_length=254, blank=True, default="")
    session_key = models.UUIDField(null=True, blank=True)  # the device it happened on
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["user", "-created_at"], name="audit_user_created_idx"),
            models.Index(fields=["email", "action", "created_at"], name="audit_login_attempts_idx"),
        ]

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise ValueError("Audit events are append-only.")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_action_display()} — {self.user or self.email or 'unknown'} at {self.created_at}"


# --- Two-factor authentication (TOTP) -----------------------------------------------------------


class TotpDevice(models.Model):
    """The authenticator app of a user. Two-factor sign-in is on once it is confirmed."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="totp_device")
    # Base32 secret, encrypted with FIELD_ENCRYPTION_KEY (apps/users/crypto.py): a copy of the
    # database alone can't generate codes.
    encrypted_secret = models.TextField()
    confirmed_at = models.DateTimeField(null=True, blank=True)
    # The last 30-second step a code was accepted for: every code works only once.
    last_used_step = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Authenticator of {self.user} ({'on' if self.confirmed_at else 'pending'})"


class RecoveryCode(models.Model):
    """Single-use code for signing in without the authenticator (lost phone). Only a keyed hash is stored."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="recovery_codes")
    code_hash = models.CharField(max_length=64)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["user", "code_hash"], name="recovery_code_lookup_idx")]
