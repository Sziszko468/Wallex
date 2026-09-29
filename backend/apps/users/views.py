from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import update_last_login
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from . import audit, cookies, lockout, mfa, sessions
from .models import AuditAction, RevokeReason
from .openapi import (
    LOGIN_SCHEMA,
    LOGOUT_SCHEMA,
    ME_SCHEMA,
    MFA_LOGIN_SCHEMA,
    REFRESH_SCHEMA,
    REGISTER_SCHEMA,
)
from .serializers import (
    LoginSerializer,
    MfaLoginSerializer,
    RefreshRequestSerializer,
    RegisterSerializer,
    UserSerializer,
)

User = get_user_model()

# The same answer for an unknown email and a wrong password (no account enumeration).
_BAD_CREDENTIALS = {"detail": "No active account found with the given credentials", "code": "no_active_account"}


def _account(email: str):
    """The account a sign-in attempt was aimed at (for its login history), if it exists."""
    return User.objects.filter(email__iexact=email).first()


def _locked_response(seconds: int) -> Response:
    minutes = max(1, round(seconds / 60))
    response = Response(
        {
            "detail": f"Too many failed sign-in attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
            "code": "account_locked",
            "retry_after": seconds,
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )
    response["Retry-After"] = str(seconds)
    return response


def _sign_in(request, user, method: str) -> Response:
    """Starts a session for a fully verified user and answers with its tokens."""
    session, refresh = sessions.start_session(user, request)
    update_last_login(None, user)
    audit.record(
        AuditAction.LOGIN_SUCCEEDED,
        request=request,
        user=user,
        email=lockout.normalize_email(user.email),
        session_key=session.key,
        method=method,
        platform=session.platform,
    )
    return cookies.token_response(request, refresh)


# Public auth endpoints are rate-limited per client IP against brute force and credential
# stuffing (rates: DEFAULT_THROTTLE_RATES in settings); sign-in is also locked per account.
@REGISTER_SCHEMA
class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_register"

    def perform_create(self, serializer):
        user = serializer.save()
        audit.record(AuditAction.ACCOUNT_CREATED, request=self.request, user=user)


@LOGIN_SCHEMA
class LoginView(APIView):
    """Password step. With two-factor authentication on, it answers with a challenge instead of tokens."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []  # a stale Authorization header must not get in the way of signing in
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = lockout.normalize_email(serializer.validated_data["email"])

        wait = lockout.retry_after(email)
        if wait:
            audit.record(AuditAction.LOGIN_BLOCKED, request=request, user=_account(email), email=email)
            return _locked_response(wait)

        user = authenticate(request, email=email, password=serializer.validated_data["password"])
        if user is None:
            audit.record(AuditAction.LOGIN_FAILED, request=request, user=_account(email), email=email)
            return Response(_BAD_CREDENTIALS, status=status.HTTP_401_UNAUTHORIZED)

        if mfa.is_enabled(user):
            return Response(
                {"mfa_required": True, "mfa_token": mfa.create_challenge(user), "expires_in": mfa.CHALLENGE_MAX_AGE}
            )
        return _sign_in(request, user, method="password")


@MFA_LOGIN_SCHEMA
class MfaLoginView(APIView):
    """Second step: the challenge from the password step plus an authenticator or recovery code."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_mfa"

    def post(self, request):
        serializer = MfaLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = mfa.read_challenge(serializer.validated_data["mfa_token"])
        if user is None:
            return Response(
                {"detail": "This sign-in attempt has expired. Enter your password again.", "code": "mfa_challenge_invalid"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        email = lockout.normalize_email(user.email)

        wait = lockout.retry_after(email)
        if wait:
            audit.record(AuditAction.LOGIN_BLOCKED, request=request, user=user, email=email)
            return _locked_response(wait)

        method = mfa.verify(user, serializer.validated_data["code"])
        if method is None:
            audit.record(AuditAction.MFA_FAILED, request=request, user=user, email=email)
            return Response(
                {"detail": "That code isn't right. Try the newest code from your authenticator app.", "code": "mfa_code_invalid"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if method == mfa.Method.RECOVERY_CODE:
            audit.record(
                AuditAction.RECOVERY_CODE_USED, request=request, user=user, remaining=mfa.recovery_codes_left(user)
            )
        return _sign_in(request, user, method=method)


@REFRESH_SCHEMA
class RefreshView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_refresh"

    def post(self, request):
        RefreshRequestSerializer(data=request.data).is_valid(raise_exception=True)
        raw = cookies.refresh_token_of(request)
        if not raw:
            if cookies.uses_cookie(request):  # no cookie: this browser isn't signed in
                return Response(
                    {"detail": "You are not signed in.", "code": "session_ended"}, status=status.HTTP_401_UNAUTHORIZED
                )
            return Response({"refresh": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST)
        try:
            _, refresh = sessions.rotate(raw, request)
        except sessions.SessionRejected as error:
            response = Response({"detail": error.message, "code": error.code}, status=status.HTTP_401_UNAUTHORIZED)
            if cookies.uses_cookie(request):
                cookies.clear_refresh_cookie(response)
            return response
        return cookies.token_response(request, refresh)


@ME_SCHEMA
class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return self.request.user

    def perform_update(self, serializer):
        previous = serializer.instance.base_currency
        user = serializer.save()
        if user.base_currency != previous:
            audit.record(
                AuditAction.BASE_CURRENCY_CHANGED, request=self.request, previous=previous, current=user.base_currency
            )


@LOGOUT_SCHEMA
class LogoutView(APIView):
    """Signs this device out: its session ends, so its refresh and access tokens stop working."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        # Apps also send their refresh token (older versions required it); it must be the caller's own.
        raw = request.data.get("refresh") if hasattr(request.data, "get") else None
        if raw:
            try:
                token = RefreshToken(raw)
            except TokenError:
                return Response({"detail": "Invalid or expired refresh token."}, status=status.HTTP_400_BAD_REQUEST)
            # Same response as an invalid token, so it doesn't reveal whose token it was.
            if str(token.get("user_id")) != str(request.user.pk):
                return Response({"detail": "Invalid or expired refresh token."}, status=status.HTTP_400_BAD_REQUEST)

        session = sessions.find_active(request.user, audit.session_key_of(request))
        if session is not None:
            sessions.revoke(session, RevokeReason.LOGOUT)
        audit.record(AuditAction.LOGOUT, request=request)
        response = Response({"detail": "Logged out successfully."})
        cookies.clear_refresh_cookie(response)
        return response
