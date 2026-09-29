"""Account security endpoints: signed-in devices, signing out everywhere, the password,
two-factor authentication and the security log. All of them only ever touch the caller's
own account; sensitive changes also ask for the password again."""

from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.common.pagination import StandardPagination

from . import audit, cookies, mfa, sessions
from .models import AUDIT_CATEGORIES, AuditAction, AuditCategory, AuditEvent, RevokeReason, UserSession
from .openapi import (
    LOGOUT_ALL_SCHEMA,
    MFA_CONFIRM_SCHEMA,
    MFA_DISABLE_SCHEMA,
    MFA_RECOVERY_CODES_SCHEMA,
    MFA_SETUP_SCHEMA,
    MFA_STATUS_SCHEMA,
    PASSWORD_CHANGE_SCHEMA,
    SECURITY_EVENTS_SCHEMA,
    SESSION_VIEWSET_SCHEMA,
)
from .serializers import (
    AuditEventSerializer,
    MfaCodeSerializer,
    PasswordAndCodeSerializer,
    PasswordChangeSerializer,
    PasswordConfirmationSerializer,
    SessionSerializer,
)


class SensitiveActionView(APIView):
    """Changes that could lock the owner out or keep an intruder in: few attempts per hour."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_sensitive"


@SESSION_VIEWSET_SCHEMA
class SessionViewSet(mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """The devices the user is signed in on. DELETE signs one out (e.g. a lost phone)."""

    queryset = UserSession.objects.none()  # schema tooling; requests use get_queryset()
    serializer_class = SessionSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        return sessions.active_sessions(self.request.user)

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "current_session_key": audit.session_key_of(self.request)}

    def perform_destroy(self, session):
        sessions.revoke(session, RevokeReason.REVOKED)
        audit.record(
            AuditAction.SESSION_REVOKED, request=self.request, revoked_session=session.pk, platform=session.platform
        )


@LOGOUT_ALL_SCHEMA
class LogoutAllView(APIView):
    """Signs the user out on every device, this one included."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        count = sessions.revoke_all(request.user, RevokeReason.LOGOUT_ALL)
        audit.record(AuditAction.LOGOUT_ALL, request=request, sessions=count)
        response = Response({"revoked_sessions": count})
        cookies.clear_refresh_cookie(response)
        return response


@PASSWORD_CHANGE_SCHEMA
class PasswordChangeView(SensitiveActionView):
    """A new password signs every other device out: whoever knew the old one loses access."""

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        count = sessions.revoke_all(user, RevokeReason.PASSWORD_CHANGED, keep_key=audit.session_key_of(request))
        audit.record(AuditAction.PASSWORD_CHANGED, request=request, other_sessions_revoked=count)
        return Response({"detail": "Password changed. Your other devices were signed out.", "revoked_sessions": count})


# --- Two-factor authentication ---------------------------------------------------------------


@MFA_STATUS_SCHEMA
class MfaStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        device = mfa.confirmed_device(request.user)
        return Response(
            {
                "enabled": device is not None,
                "enabled_at": device.confirmed_at if device else None,
                "recovery_codes_left": mfa.recovery_codes_left(request.user) if device else 0,
            }
        )


@MFA_SETUP_SCHEMA
class MfaSetupView(SensitiveActionView):
    def post(self, request):
        PasswordConfirmationSerializer(data=request.data, context={"request": request}).is_valid(raise_exception=True)
        try:
            secret, uri = mfa.start_setup(request.user)
        except mfa.MfaError as error:
            return Response({"non_field_errors": [str(error)]}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"secret": secret, "otpauth_uri": uri})


@MFA_CONFIRM_SCHEMA
class MfaConfirmView(SensitiveActionView):
    def post(self, request):
        serializer = MfaCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            codes = mfa.confirm_setup(request.user, serializer.validated_data["code"])
        except mfa.MfaError as error:
            return Response({"code": [str(error)]}, status=status.HTTP_400_BAD_REQUEST)
        audit.record(AuditAction.MFA_ENABLED, request=request)
        return Response({"recovery_codes": codes})


def _check_second_factor(request, serializer):
    """Password and a current code (or recovery code) — returns an error response or None."""
    serializer.is_valid(raise_exception=True)
    if not mfa.is_enabled(request.user):
        return Response({"non_field_errors": ["Two-factor authentication is off."]}, status=status.HTTP_400_BAD_REQUEST)
    method = mfa.verify(request.user, serializer.validated_data["code"])
    if method is None:
        return Response({"code": ["That code isn't right."]}, status=status.HTTP_400_BAD_REQUEST)
    if method == mfa.Method.RECOVERY_CODE:
        audit.record(AuditAction.RECOVERY_CODE_USED, request=request, remaining=mfa.recovery_codes_left(request.user))
    return None


@MFA_DISABLE_SCHEMA
class MfaDisableView(SensitiveActionView):
    def post(self, request):
        problem = _check_second_factor(request, PasswordAndCodeSerializer(data=request.data, context={"request": request}))
        if problem is not None:
            return problem
        mfa.disable(request.user)
        audit.record(AuditAction.MFA_DISABLED, request=request)
        return Response({"detail": "Two-factor authentication is off."})


@MFA_RECOVERY_CODES_SCHEMA
class RecoveryCodesView(SensitiveActionView):
    def post(self, request):
        problem = _check_second_factor(request, PasswordAndCodeSerializer(data=request.data, context={"request": request}))
        if problem is not None:
            return problem
        codes = mfa.regenerate_recovery_codes(request.user)
        audit.record(AuditAction.RECOVERY_CODES_REGENERATED, request=request)
        return Response({"recovery_codes": codes})


# --- Security log ---------------------------------------------------------------------------


@SECURITY_EVENTS_SCHEMA
class SecurityEventsView(generics.ListAPIView):
    """The user's own security log, newest first. `?category=login` is the login history."""

    serializer_class = AuditEventSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardPagination

    def get_queryset(self):
        events = AuditEvent.objects.filter(user=self.request.user)
        category = self.request.query_params.get("category")
        if category:
            events = events.filter(action__in=AUDIT_CATEGORIES[category])
        return events

    def list(self, request, *args, **kwargs):
        category = request.query_params.get("category")
        if category and category not in AuditCategory.values:
            return Response(
                {"category": [f'"{category}" is not one of: {", ".join(AuditCategory.values)}.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().list(request, *args, **kwargs)
