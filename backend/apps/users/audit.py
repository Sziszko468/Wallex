"""Writing the audit log (AuditEvent): who did what, from which device and address.

Callers pass the request when there is one; the client address is resolved exactly as the
rate limiter resolves it (NUM_PROXIES-aware), so a forged X-Forwarded-For can't disguise it.
"""

import ipaddress

from rest_framework.throttling import BaseThrottle

from .models import AuditAction, AuditEvent

USER_AGENT_MAX = 255


def client_ip(request) -> str | None:
    if request is None:
        return None
    ident = BaseThrottle().get_ident(request)
    try:
        return str(ipaddress.ip_address((ident or "").strip()))
    except ValueError:
        return None


def user_agent(request) -> str:
    if request is None:
        return ""
    return (request.META.get("HTTP_USER_AGENT") or "")[:USER_AGENT_MAX]


def session_key_of(request):
    """The `sid` claim of the access token the request was made with, if any."""
    token = getattr(request, "auth", None)
    try:
        return token.get("sid") if token is not None else None
    except AttributeError:
        return None


def record(action: str, *, request=None, user=None, email: str = "", session_key=None, **metadata) -> AuditEvent:
    if user is None and request is not None and getattr(request, "user", None) is not None:
        user = request.user if request.user.is_authenticated else None
    return AuditEvent.objects.create(
        user=user,
        action=action,
        email=email,
        session_key=session_key or session_key_of(request),
        ip_address=client_ip(request),
        user_agent=user_agent(request),
        metadata=metadata,
    )


class AuditedDeleteMixin:
    """For ModelViewSets of the user's financial data: every deletion lands in the audit log
    (which object, from which device), so "who deleted this?" has an answer across devices."""

    def perform_destroy(self, instance):
        label = instance._meta.model_name
        object_id = instance.pk
        super().perform_destroy(instance)
        record(AuditAction.OBJECT_DELETED, request=self.request, object_type=label, object_id=object_id)
