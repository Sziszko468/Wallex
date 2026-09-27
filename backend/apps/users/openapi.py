"""OpenAPI documentation for the authentication and user endpoints."""

from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import serializers

from apps.common.openapi import error_response, message_response, throttled, validation_error

from .serializers import RegisterSerializer, UserSerializer


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(help_text="Case-insensitive.")
    password = serializers.CharField(write_only=True)


class TokenPairSerializer(serializers.Serializer):
    access = serializers.CharField(help_text="JWT for the `Authorization: Bearer` header. Valid for 15 minutes.")
    refresh = serializers.CharField(
        help_text="JWT for `/api/auth/refresh/` and `/api/auth/logout/`. Valid for 7 days, single use."
    )


class RefreshTokenSerializer(serializers.Serializer):
    refresh = serializers.CharField(help_text="The most recent refresh token.")


_INVALID_REFRESH = error_response(
    "The refresh token is invalid, expired, already used (tokens rotate) or revoked by logout. "
    "The session is over: log in again.",
    ("Already used or revoked", {"detail": "Token is blacklisted", "code": "token_not_valid"}),
    ("Malformed or expired", {"detail": "Token is invalid", "code": "token_not_valid"}),
)

REGISTER_SCHEMA = extend_schema(
    tags=["Authentication"],
    summary="Create an account",
    description=(
        "Creates a user and seeds their 10 default categories (Housing, Food, Transport, Shopping, "
        "Entertainment, Health, Bills, Travel, Other as expense; Salary as income).\n\n"
        "Registration does **not** log the user in — call `POST /api/auth/login/` next. "
        "The email is stored lower-cased and must be unique regardless of letter case. "
        "The password must satisfy Django's validators: at least 8 characters, not too similar to "
        "the name/email, not a common password, not entirely numeric."
    ),
    auth=[],
    request=RegisterSerializer,
    responses={
        201: OpenApiResponse(RegisterSerializer, description="Account created."),
        400: validation_error(
            ("Email already registered", {"email": ["A user with this email already exists."]}),
            ("Invalid email", {"email": ["Enter a valid email address."]}),
            ("Weak password", {"password": ["This password is too common.", "This password is entirely numeric."]}),
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
    summary="Log in (obtain a token pair)",
    description="Exchanges email and password for an access token (15 min) and a refresh token (7 days).",
    auth=[],
    request=LoginSerializer,
    responses={
        200: OpenApiResponse(TokenPairSerializer, description="Logged in."),
        400: validation_error(
            ("Missing fields", {"email": ["This field is required."], "password": ["This field is required."]})
        ),
        401: error_response(
            "Wrong email or password, or the account is deactivated. Deliberately doesn't say which.",
            ("Wrong credentials", {"detail": "No active account found with the given credentials"}),
        ),
        429: throttled("10 attempts per minute per IP"),
    },
    examples=[
        OpenApiExample(
            "Log in", request_only=True, value={"email": "ada@example.com", "password": "a-long-passphrase"}
        ),
    ],
)

REFRESH_SCHEMA = extend_schema(
    tags=["Authentication"],
    summary="Refresh the access token",
    description=(
        "Returns a new access token **and a new refresh token**; the refresh token sent is "
        "invalidated immediately (rotation). Store the new one before doing anything else.\n\n"
        "Clients should run at most one refresh at a time: concurrent refreshes with the same "
        "token all but one fail with `401`."
    ),
    auth=[],
    request=RefreshTokenSerializer,
    responses={
        200: OpenApiResponse(TokenPairSerializer, description="New token pair."),
        400: validation_error(("Missing token", {"refresh": ["This field is required."]})),
        401: _INVALID_REFRESH,
        429: throttled("30 refreshes per minute per IP"),
    },
)

LOGOUT_SCHEMA = extend_schema(
    tags=["Authentication"],
    summary="Log out (revoke the refresh token)",
    description=(
        "Blacklists the given refresh token so it can never be used again. Only the caller's own "
        "token can be revoked. The access token stays valid until it expires (max 15 minutes) — "
        "clients should discard both."
    ),
    request=RefreshTokenSerializer,
    responses={
        200: message_response("Refresh token revoked.", "Logged out successfully."),
        400: error_response(
            "No token sent, or it is invalid, expired, already revoked or belongs to another user "
            "(all answered the same way).",
            ("Missing token", {"detail": "Refresh token is required."}),
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
            "All or nothing: if a needed exchange rate is missing, the answer is `400` and nothing changes."
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
            OpenApiExample("Updated", response_only=True, status_codes=["200"], value={**_USER_EXAMPLE, "base_currency": "HUF"}),
        ],
    ),
)
