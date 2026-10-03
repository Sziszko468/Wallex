"""OpenAPI documentation for authentication, the user profile and account security."""

from drf_spectacular.contrib.rest_framework_simplejwt import SimpleJWTScheme
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiParameter,
    OpenApiResponse,
    PolymorphicProxySerializer,
    extend_schema,
    extend_schema_view,
    inline_serializer,
)
from rest_framework import serializers

from apps.common.openapi import error_response, message_response, throttled, validation_error

from .serializers import (
    AuditEventSerializer,
    LoginSerializer,
    MfaCodeSerializer,
    MfaLoginSerializer,
    PasswordAndCodeSerializer,
    PasswordChangeSerializer,
    PasswordConfirmationSerializer,
    RefreshRequestSerializer,
    RegisterSerializer,
    SessionSerializer,
    UserSerializer,
)


class SessionJWTScheme(SimpleJWTScheme):
    """Same `jwtAuth` bearer scheme as plain simplejwt: the session check is invisible to clients."""

    target_class = "apps.users.authentication.SessionJWTAuthentication"


_SESSIONS = (
    "Every sign-in starts a **session** (one per device). All of its tokens carry the session "
    "(`sid` claim) and stop working the moment it ends: logout, logout everywhere, a password "
    "change, a detected token theft, or 30 days after the sign-in."
)

_TRANSPORT = (
    "**Browsers** send `X-Auth-Transport: cookie`: the refresh token is then set as an HttpOnly, "
    "Secure, SameSite=Strict cookie for `/api/auth/` and left out of the JSON, so page scripts can "
    "never read it. **Apps** keep the refresh token in the Keychain / Keystore and get it in the body."
)

TRANSPORT_HEADER = OpenApiParameter(
    "X-Auth-Transport",
    OpenApiTypes.STR,
    OpenApiParameter.HEADER,
    enum=["cookie"],
    description="`cookie` (browsers): the refresh token travels in an HttpOnly cookie instead of the body.",
)
PLATFORM_HEADER = OpenApiParameter(
    "X-Client-Platform",
    OpenApiTypes.STR,
    OpenApiParameter.HEADER,
    enum=["web", "ios", "android"],
    description="Shown in the device list of the new session.",
)


class TokenPairSerializer(serializers.Serializer):
    access = serializers.CharField(help_text="JWT for the `Authorization: Bearer` header. Valid for 15 minutes.")
    refresh = serializers.CharField(
        required=False,
        help_text=(
            "Single-use JWT for `/api/auth/refresh/`, valid for 7 days of inactivity. Left out for browsers "
            "(`X-Auth-Transport: cookie`): theirs is set as an HttpOnly cookie."
        ),
    )


class MfaChallengeSerializer(serializers.Serializer):
    mfa_required = serializers.BooleanField(help_text="Always `true`: send a code to `/api/auth/login/verify/`.")
    mfa_token = serializers.CharField(help_text="Proves the password step; send it with the code.")
    expires_in = serializers.IntegerField(help_text="Seconds the challenge is valid (300).")


class LockedSerializer(serializers.Serializer):
    detail = serializers.CharField()
    code = serializers.CharField(required=False, help_text="`account_locked` for the per-account lock.")
    retry_after = serializers.IntegerField(required=False, help_text="Seconds until sign-in is allowed again.")


class RecoveryCodesSerializer(serializers.Serializer):
    recovery_codes = serializers.ListField(
        child=serializers.CharField(),
        help_text="10 single-use codes like `k3m9-q2xa`. Shown only now: the server keeps only hashes.",
    )


_LOGIN_RESULT = PolymorphicProxySerializer(
    component_name="LoginResult",
    serializers=[TokenPairSerializer, MfaChallengeSerializer],
    resource_type_field_name=None,
)

_LOCKED = OpenApiResponse(
    LockedSerializer,
    description=(
        "Rate limited: too many requests from this address, **or** 5 wrong passwords / codes for this "
        "account within 15 minutes. Then even the right password is refused until the lock ends "
        "(`Retry-After`). The lock is per email, whether or not an account exists."
    ),
    examples=[
        OpenApiExample(
            "Account locked",
            value={
                "detail": "Too many failed sign-in attempts. Try again in 12 minutes.",
                "code": "account_locked",
                "retry_after": 704,
            },
        ),
        OpenApiExample("Throttled", value={"detail": "Request was throttled. Expected available in 42 seconds."}),
    ],
)

_SESSION_ENDED = error_response(
    "The session is over (signed out, signed out everywhere, password changed, older than 30 days, or a "
    "refresh token was used twice: then the whole session is revoked as a precaution). Sign in again.",
    ("Session ended", {"detail": "Your session has ended. Please sign in again.", "code": "session_ended"}),
)

REGISTER_SCHEMA = extend_schema(
    tags=["Authentication"],
    summary="Create an account",
    description=(
        "Creates a user and seeds their 10 default categories (Housing, Food, Transport, Shopping, "
        "Entertainment, Health, Bills, Travel, Other as expense; Salary as income).\n\n"
        "Registration does **not** sign the user in: call `POST /api/auth/login/` next. "
        "The email is stored lower-cased and must be unique regardless of letter case. "
        "Password policy: 12 to 128 characters, not similar to the name or email, not one of the "
        "20,000 most common passwords, not entirely numeric."
    ),
    auth=[],
    request=RegisterSerializer,
    responses={
        201: OpenApiResponse(RegisterSerializer, description="Account created."),
        400: validation_error(
            ("Email already registered", {"email": ["A user with this email already exists."]}),
            ("Invalid email", {"email": ["Enter a valid email address."]}),
            (
                "Weak password",
                {
                    "password": [
                        "This password is too short. It must contain at least 12 characters.",
                        "This password is too common.",
                    ]
                },
            ),
            ("Passwords differ", {"password_confirm": ["Passwords do not match."]}),
            ("Missing fields", {"email": ["This field is required."], "password": ["This field is required."]}),
        ),
        429: throttled("10 registrations per hour per IP"),
    },
    examples=[
        OpenApiExample(
            "Register",
            request_only=True,
            value={
                "email": "ada@example.com",
                "first_name": "Ada",
                "last_name": "Lovelace",
                "password": "a-long-passphrase",
                "password_confirm": "a-long-passphrase",
            },
        ),
        OpenApiExample(
            "Created",
            response_only=True,
            status_codes=["201"],
            value={"id": 42, "email": "ada@example.com", "first_name": "Ada", "last_name": "Lovelace"},
        ),
    ],
)

LOGIN_SCHEMA = extend_schema(
    tags=["Authentication"],
    summary="Sign in",
    description=(
        "Checks email and password. Without two-factor authentication the answer is a token pair: an "
        "access token (15 min) and a refresh token. **With 2FA on** it is `{mfa_required, mfa_token}` "
        "instead: send the code to `POST /api/auth/login/verify/`.\n\n"
        f"{_SESSIONS}\n\n{_TRANSPORT}\n\n"
        "Every attempt is recorded in the account's security log (`GET /api/auth/security-events/`). "
        "After 5 wrong passwords or codes in 15 minutes the account is locked for sign-in (429)."
    ),
    auth=[],
    parameters=[TRANSPORT_HEADER, PLATFORM_HEADER],
    request=LoginSerializer,
    responses={
        200: OpenApiResponse(_LOGIN_RESULT, description="Signed in, or the second factor is needed."),
        400: validation_error(
            ("Missing fields", {"email": ["This field is required."], "password": ["This field is required."]})
        ),
        401: error_response(
            "Wrong email or password, or the account is deactivated. Deliberately does not say which.",
            (
                "Wrong credentials",
                {"detail": "No active account found with the given credentials", "code": "no_active_account"},
            ),
        ),
        429: _LOCKED,
    },
    examples=[
        OpenApiExample(
            "Sign in", request_only=True, value={"email": "ada@example.com", "password": "a-long-passphrase"}
        ),
        OpenApiExample(
            "Two-factor needed",
            response_only=True,
            status_codes=["200"],
            value={"mfa_required": True, "mfa_token": "eyJ1aWQiOjQyfQ:1v2", "expires_in": 300},
        ),
    ],
)

MFA_LOGIN_SCHEMA = extend_schema(
    tags=["Authentication"],
    summary="Sign in: second factor",
    description=(
        "Completes a sign-in that answered `mfa_required`: the `mfa_token` from it (valid 5 minutes) plus "
        "the 6-digit code from the authenticator app, or one of the recovery codes (each works once). "
        "A code is accepted only once. Wrong codes count toward the per-account lock."
    ),
    auth=[],
    parameters=[TRANSPORT_HEADER, PLATFORM_HEADER],
    request=MfaLoginSerializer,
    responses={
        200: OpenApiResponse(TokenPairSerializer, description="Signed in."),
        400: validation_error(
            ("Missing fields", {"mfa_token": ["This field is required."], "code": ["This field is required."]})
        ),
        401: error_response(
            "Wrong code, or the challenge expired or was tampered with (then enter the password again).",
            (
                "Wrong code",
                {
                    "detail": "That code is not right. Try the newest code from your authenticator app.",
                    "code": "mfa_code_invalid",
                },
            ),
            (
                "Challenge expired",
                {
                    "detail": "This sign-in attempt has expired. Enter your password again.",
                    "code": "mfa_challenge_invalid",
                },
            ),
        ),
        429: _LOCKED,
    },
    examples=[OpenApiExample("Code", request_only=True, value={"mfa_token": "eyJ1aWQiOjQyfQ:1v2", "code": "492039"})],
)

REFRESH_SCHEMA = extend_schema(
    tags=["Authentication"],
    summary="Refresh the access token",
    description=(
        "Returns a new access token **and a new refresh token** of the same session; the one sent can't be "
        "used again (rotation). Store the new one before doing anything else. Presenting an already "
        "replaced refresh token means it was copied: the whole session is revoked (a retry within 30 "
        "seconds, e.g. after a lost response, is still accepted).\n\n"
        f"{_TRANSPORT} Browsers send no body."
    ),
    auth=[],
    parameters=[TRANSPORT_HEADER],
    request=RefreshRequestSerializer,
    responses={
        200: OpenApiResponse(TokenPairSerializer, description="New token pair."),
        400: validation_error(("Missing token", {"refresh": ["This field is required."]})),
        401: _SESSION_ENDED,
        429: throttled("30 refreshes per minute per IP"),
    },
)

LOGOUT_SCHEMA = extend_schema(
    tags=["Authentication"],
    summary="Sign out this device",
    description=(
        "Ends the session of the access token: its refresh **and** access tokens stop working at once. "
        "Apps may send their refresh token too (it must be the caller's own); the browser cookie is cleared."
    ),
    parameters=[TRANSPORT_HEADER],
    request=RefreshRequestSerializer,
    responses={
        200: message_response("Session ended.", "Logged out successfully."),
        400: error_response(
            "The refresh token sent is invalid or belongs to another user (answered the same way).",
            ("Invalid token", {"detail": "Invalid or expired refresh token."}),
        ),
    },
)

_USER_EXAMPLE = {
    "id": 42,
    "email": "ada@example.com",
    "first_name": "Ada",
    "last_name": "Lovelace",
    "date_joined": "2026-09-21T16:06:12.123456Z",
    "base_currency": "EUR",
}

ME_SCHEMA = extend_schema_view(
    get=extend_schema(
        tags=["Users"],
        summary="Get the signed-in user",
        description=(
            "The profile of the user the access token belongs to. Use it to check a stored token on app start. "
            "`base_currency` is the currency of every total the API returns (analytics, budgets, subscription "
            "totals, a transaction's `base_amount`)."
        ),
        responses={200: OpenApiResponse(UserSerializer, description="The signed-in user.")},
    ),
    patch=extend_schema(
        tags=["Users"],
        summary="Change the base currency",
        description=(
            "Only `base_currency` can be changed; the other fields are read-only.\n\n"
            "Changing it converts the user's data in one step:\n"
            "- every transaction keeps its `amount` and `currency`; its `exchange_rate` and `base_amount` are "
            "recalculated with the ECB rate of the transaction's own date;\n"
            "- budget amounts are converted at the latest rate and rounded to the new currency's unit (whole "
            "forints and yen);\n"
            "- recurring transactions, subscriptions and savings goals keep their amounts and `currency`; "
            "totals convert them.\n\n"
            "All or nothing: if a needed exchange rate is missing, the answer is `400` and nothing changes. "
            "The change is recorded in the security log."
        ),
        responses={
            200: OpenApiResponse(UserSerializer, description="The updated user."),
            400: validation_error(
                ("Unknown currency", {"base_currency": ['"XYZ" is not a valid choice.']}),
                ("Rates missing", {"base_currency": ["No HUF exchange rate is available for 2019-03-04."]}),
            ),
        },
        examples=[
            OpenApiExample("Switch to forint", request_only=True, value={"base_currency": "HUF"}),
            OpenApiExample(
                "Updated", response_only=True, status_codes=["200"], value={**_USER_EXAMPLE, "base_currency": "HUF"}
            ),
        ],
    ),
)

# --- Account security -------------------------------------------------------------------------

_SENSITIVE = "At most 20 of these changes per hour per user; they ask for the password again."

LOGOUT_ALL_SCHEMA = extend_schema(
    tags=["Account Security"],
    summary="Sign out everywhere",
    description=(
        "Ends **every** session of the user: all phones, browsers and tabs, this one included. Their access "
        "tokens stop working on their next request."
    ),
    request=None,
    responses={
        200: OpenApiResponse(
            inline_serializer("LogoutAll", {"revoked_sessions": serializers.IntegerField(help_text="Sessions ended.")}),
            examples=[OpenApiExample("Signed out", value={"revoked_sessions": 3})],
        )
    },
)

SESSION_VIEWSET_SCHEMA = extend_schema_view(
    list=extend_schema(
        tags=["Account Security"],
        summary="List signed-in devices",
        description=f"The user's active sessions, most recently used first. Not paginated.\n\n{_SESSIONS}",
        responses={200: SessionSerializer(many=True)},
    ),
    destroy=extend_schema(
        tags=["Account Security"],
        summary="Sign a device out",
        description="Ends that session (e.g. a lost phone): its tokens stop working immediately.",
        responses={204: OpenApiResponse(description="Signed out.")},
    ),
)

PASSWORD_CHANGE_SCHEMA = extend_schema(
    tags=["Account Security"],
    summary="Change the password",
    description=(
        "Needs the current password. The new one must follow the password policy (12 to 128 characters, not "
        "common, not only digits, not similar to the email). **Every other device is signed out**, so "
        f"whoever knew the old password loses access; this device stays signed in. {_SENSITIVE}"
    ),
    request=PasswordChangeSerializer,
    responses={
        200: OpenApiResponse(
            inline_serializer(
                "PasswordChanged",
                {"detail": serializers.CharField(), "revoked_sessions": serializers.IntegerField()},
            ),
            examples=[
                OpenApiExample(
                    "Changed",
                    value={"detail": "Password changed. Your other devices were signed out.", "revoked_sessions": 2},
                )
            ],
        ),
        400: validation_error(
            ("Wrong current password", {"current_password": ["Wrong password."]}),
            ("Too short", {"new_password": ["This password is too short. It must contain at least 12 characters."]}),
        ),
    },
)

MFA_STATUS_SCHEMA = extend_schema(
    tags=["Account Security"],
    summary="Two-factor authentication status",
    responses={
        200: OpenApiResponse(
            inline_serializer(
                "MfaStatus",
                {
                    "enabled": serializers.BooleanField(),
                    "enabled_at": serializers.DateTimeField(allow_null=True),
                    "recovery_codes_left": serializers.IntegerField(),
                },
            ),
            examples=[
                OpenApiExample(
                    "On", value={"enabled": True, "enabled_at": "2026-09-28T09:12:00Z", "recovery_codes_left": 9}
                )
            ],
        )
    },
)

MFA_SETUP_SCHEMA = extend_schema(
    tags=["Account Security"],
    summary="Set up two-factor authentication",
    description=(
        "Step 1 of 2. Creates a new authenticator secret: add it to an authenticator app (open `otpauth_uri` "
        "on the phone, or type `secret`). Nothing changes until `POST /api/auth/2fa/confirm/` succeeds. "
        f"{_SENSITIVE}"
    ),
    request=PasswordConfirmationSerializer,
    responses={
        200: OpenApiResponse(
            inline_serializer(
                "MfaSetup",
                {"secret": serializers.CharField(help_text="Base32 key."), "otpauth_uri": serializers.CharField()},
            ),
            examples=[
                OpenApiExample(
                    "Secret",
                    value={
                        "secret": "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
                        "otpauth_uri": "otpauth://totp/WALLEX:ada%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=WALLEX&algorithm=SHA1&digits=6&period=30",
                    },
                )
            ],
        ),
        400: validation_error(
            ("Wrong password", {"password": ["Wrong password."]}),
            (
                "Already on",
                {
                    "non_field_errors": [
                        "Two-factor authentication is already on. Turn it off first to set up a new authenticator."
                    ]
                },
            ),
        ),
    },
)

MFA_CONFIRM_SCHEMA = extend_schema(
    tags=["Account Security"],
    summary="Turn two-factor authentication on",
    description=(
        "Step 2 of 2: a code from the new authenticator proves it works; from now on signing in needs a code. "
        "The answer holds the 10 recovery codes, **shown only this once**. " + _SENSITIVE
    ),
    request=MfaCodeSerializer,
    responses={
        200: OpenApiResponse(
            RecoveryCodesSerializer,
            examples=[OpenApiExample("On", value={"recovery_codes": ["k3m9-q2xa", "p7tn-w4ds"]})],
        ),
        400: validation_error(
            ("Wrong code", {"code": ["That code is not right. Check the time on your phone and try the newest code."]}),
            ("No setup", {"code": ["Start the setup first."]}),
        ),
    },
)

MFA_DISABLE_SCHEMA = extend_schema(
    tags=["Account Security"],
    summary="Turn two-factor authentication off",
    description=f"Needs the password and a current code (or a recovery code). {_SENSITIVE}",
    request=PasswordAndCodeSerializer,
    responses={
        200: message_response("Two-factor authentication is off.", "Two-factor authentication is off."),
        400: validation_error(
            ("Wrong password", {"password": ["Wrong password."]}),
            ("Wrong code", {"code": ["That code is not right."]}),
        ),
    },
)

MFA_RECOVERY_CODES_SCHEMA = extend_schema(
    tags=["Account Security"],
    summary="New recovery codes",
    description=(
        "Replaces all recovery codes (the old ones stop working); the new ones are shown only this once. "
        f"Needs the password and a current code. {_SENSITIVE}"
    ),
    request=PasswordAndCodeSerializer,
    responses={
        200: OpenApiResponse(RecoveryCodesSerializer),
        400: validation_error(
            ("Wrong password", {"password": ["Wrong password."]}),
            ("Wrong code", {"code": ["That code is not right."]}),
        ),
    },
)

SECURITY_EVENTS_SCHEMA = extend_schema(
    tags=["Account Security"],
    summary="Security log",
    description=(
        "The user's own security events, newest first, **paginated**: sign-ins (also failed and blocked ones "
        "aimed at this account), sign-outs, devices signed out, password and 2FA changes, a detected token "
        "theft, base currency changes, CSV imports and deletions. `?category=login` is the login history."
    ),
    parameters=[
        OpenApiParameter(
            "category",
            OpenApiTypes.STR,
            enum=["login", "account", "data"],
            description="`login`: sign-in attempts. `account`: sessions, password, 2FA. `data`: imports, deletions, currency.",
        ),
    ],
    responses={
        200: AuditEventSerializer(many=True),
        400: validation_error(("Unknown category", {"category": ['"x" is not one of: login, account, data.']})),
        404: error_response("`page` is past the last page.", ("Past the end", {"detail": "Invalid page."})),
    },
)


DATA_EXPORT_SCHEMA = extend_schema(
    tags=["Account Security"],
    summary="Download my data",
    description=(
        "Every piece of data stored about the user as one JSON file (`Content-Disposition: attachment`): the "
        "account, categories, transactions, recurring transactions and subscriptions, budgets, savings goals, "
        "achievements, assistant conversations, notifications and preferences, devices, sessions and the "
        "security log. Left out: push tokens, session keys and the two-factor secret. "
        f"Recorded in the security log. {_SENSITIVE}"
    ),
    request=PasswordConfirmationSerializer,
    responses={
        (200, "application/json"): OpenApiResponse(
            OpenApiTypes.OBJECT,
            description="The file. `format_version` changes only when the structure does.",
        ),
        400: validation_error(("Wrong password", {"password": ["Wrong password."]})),
        429: throttled("20 sensitive changes per hour per user"),
    },
)

ACCOUNT_DELETE_SCHEMA = extend_schema(
    tags=["Account Security"],
    summary="Delete my account",
    description=(
        "Erases the account and everything it owns, **for good** (right to erasure; there is no undo). Needs the "
        "password, and a current authenticator or recovery `code` when two-factor authentication is on. Every "
        f"device is signed out. Consider downloading the data first. {_SENSITIVE}"
    ),
    request=PasswordAndCodeSerializer,
    responses={
        204: OpenApiResponse(description="Deleted."),
        400: validation_error(
            ("Wrong password", {"password": ["Wrong password."]}),
            ("Wrong code", {"code": ["That code isn't right."]}),
        ),
        429: throttled("20 sensitive changes per hour per user"),
    },
)
