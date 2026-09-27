"""Per-account brute-force protection.

The login throttle limits guesses per IP address; an attacker with many addresses could still
try passwords for one account. So failed attempts are also counted per account (by the email
that was tried, whether or not it exists): after MAX_FAILURES wrong passwords or two-factor
codes within WINDOW, sign-in for that email is refused — even with the right password, so the
lock gives no hint — until the oldest of those failures is WINDOW old. A successful sign-in
resets the count.

The lock is temporary on purpose: a permanent one would let anyone lock a victim out.
The failures are read from the audit log, which every worker shares.
"""

from datetime import timedelta

from django.utils import timezone

from .models import AuditAction, AuditEvent

MAX_FAILURES = 5
WINDOW = timedelta(minutes=15)
_FAILURES = (AuditAction.LOGIN_FAILED, AuditAction.MFA_FAILED)


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _recent_failures(email: str) -> list:
    """Times of the failures that still count, newest first (at most MAX_FAILURES)."""
    now = timezone.now()
    last_success = (
        AuditEvent.objects.filter(email=email, action=AuditAction.LOGIN_SUCCEEDED, created_at__gte=now - WINDOW)
        .order_by("-created_at")
        .values_list("created_at", flat=True)
        .first()
    )
    since = max(filter(None, [now - WINDOW, last_success]))
    return list(
        AuditEvent.objects.filter(email=email, action__in=_FAILURES, created_at__gt=since)
        .order_by("-created_at")
        .values_list("created_at", flat=True)[:MAX_FAILURES]
    )


def retry_after(email: str) -> int:
    """Seconds until sign-in is allowed again for this email; 0 when it isn't locked."""
    failures = _recent_failures(normalize_email(email))
    if len(failures) < MAX_FAILURES:
        return 0
    unlocks_at = failures[-1] + WINDOW
    return max(1, int((unlocks_at - timezone.now()).total_seconds()) + 1)
