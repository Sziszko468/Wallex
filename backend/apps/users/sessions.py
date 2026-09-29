"""Sessions: every sign-in on a device is a session holding one chain of rotating refresh tokens.

Every token pair carries the session's key (the `sid` claim):

- Access tokens are accepted only while their session is active (apps/users/authentication.py),
  so signing a device out — or out everywhere — takes effect on its very next request, not
  when its access token happens to expire.
- A refresh token works once. The session remembers which one is current; presenting an
  older one means somebody kept a copy (a stolen token racing the real device), so the whole
  session is revoked and both parties must sign in again. The one exception: the token that
  was replaced less than REUSE_GRACE ago — the answer to the previous refresh was probably
  lost on a flaky mobile connection, and refusing it would sign an honest user out.
- Refreshing keeps a session alive for up to SESSION_MAX_AGE; after that the user must sign
  in again, however active the device is.
"""

import uuid
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from . import audit
from .models import AuditAction, ClientPlatform, RevokeReason, UserSession

SESSION_MAX_AGE = timedelta(days=30)
REUSE_GRACE = timedelta(seconds=30)
PLATFORM_HEADER = "X-Client-Platform"
SESSION_CLAIM = "sid"


class SessionRejected(Exception):
    """The refresh token can't be used: the client must sign in again. `message` is safe to show."""

    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.message = message
        self.code = code


_ENDED = "Your session has ended. Please sign in again."


def platform_of(request) -> str:
    value = (request.headers.get(PLATFORM_HEADER, "") if request is not None else "").strip().lower()
    return value if value in ClientPlatform.values else ClientPlatform.UNKNOWN


def _new_refresh_token(session: UserSession) -> RefreshToken:
    """A refresh token for `session`, recorded as its only valid one (the access token derives from it)."""
    refresh = RefreshToken.for_user(session.user)
    refresh[SESSION_CLAIM] = str(session.key)
    session.previous_refresh_jti = session.refresh_jti
    session.refresh_jti = refresh["jti"]
    session.rotated_at = timezone.now()
    return refresh


def start_session(user, request=None) -> tuple[UserSession, RefreshToken]:
    now = timezone.now()
    session = UserSession(
        user=user,
        platform=platform_of(request),
        user_agent=audit.user_agent(request),
        ip_address=audit.client_ip(request),
        last_used_at=now,
        expires_at=now + SESSION_MAX_AGE,
    )
    refresh = _new_refresh_token(session)
    session.save()
    return session, refresh


def _problem(session: UserSession | None, token: RefreshToken) -> str | None:
    now = timezone.now()
    if session is None or str(session.user_id) != str(token.get("user_id")):
        return "unknown"
    if session.revoked_at is not None:
        return "revoked"
    if session.expires_at <= now:
        return "expired"
    if not session.user.is_active:
        return "inactive"
    if token["jti"] == session.refresh_jti:
        return None
    retried_in_time = session.rotated_at is not None and now - session.rotated_at <= REUSE_GRACE
    if token["jti"] == session.previous_refresh_jti and retried_in_time:
        return None
    return "reused"


def rotate(raw_refresh: str, request=None) -> tuple[UserSession, RefreshToken]:
    """Exchanges a refresh token for a new pair of the same session. Raises SessionRejected."""
    try:
        token = RefreshToken(raw_refresh)  # signature, expiry, type, audience, issuer
    except TokenError as error:
        raise SessionRejected(_ENDED, "token_not_valid") from error
    try:
        key = uuid.UUID(str(token.get(SESSION_CLAIM)))
    except ValueError as error:  # issued before sessions existed
        raise SessionRejected(_ENDED, "token_not_valid") from error

    with transaction.atomic():
        session = UserSession.objects.select_for_update().select_related("user").filter(key=key).first()
        problem = _problem(session, token)
        if problem is None:
            refresh = _new_refresh_token(session)
            session.last_used_at = timezone.now()
            session.ip_address = audit.client_ip(request)
            session.user_agent = audit.user_agent(request) or session.user_agent
            session.save()
            return session, refresh
        if problem == "reused":
            revoke(session, RevokeReason.TOKEN_REUSE)
            audit.record(
                AuditAction.REFRESH_TOKEN_REUSED, request=request, user=session.user, session_key=session.key
            )
        elif problem == "expired":
            revoke(session, RevokeReason.EXPIRED)
    # Raised after the block, so the revocation above is committed.
    raise SessionRejected(_ENDED, "session_ended")


def revoke(session: UserSession, reason: str) -> bool:
    """Ends one session; every token of it stops working immediately. False if it had already ended."""
    if session.revoked_at is not None:
        return False
    session.revoked_at = timezone.now()
    session.revoked_reason = reason
    session.save(update_fields=["revoked_at", "revoked_reason"])
    return True


def revoke_all(user, reason: str, keep_key=None) -> int:
    """Ends every session of the user (except `keep_key`, e.g. the device changing the password)."""
    sessions = UserSession.objects.filter(user=user, revoked_at__isnull=True)
    if keep_key is not None:
        sessions = sessions.exclude(key=keep_key)
    return sessions.update(revoked_at=timezone.now(), revoked_reason=reason)


def active_sessions(user):
    return UserSession.objects.filter(user=user, revoked_at__isnull=True, expires_at__gt=timezone.now())


def find_active(user, key) -> UserSession | None:
    try:
        return active_sessions(user).filter(key=uuid.UUID(str(key))).first()
    except ValueError:
        return None
