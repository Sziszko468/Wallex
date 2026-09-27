"""OpenAPI building blocks shared by every app: error shapes, standard responses, health docs.

Error bodies are DRF's defaults:
- 400 → {"<field>": ["message", …], "non_field_errors": ["…"]}
- everything else → {"detail": "message"} (+ "code" / "messages" for JWT errors)

`add_standard_error_responses` (a drf-spectacular post-processing hook) adds the 401,
404 and 429 responses that apply to whole groups of endpoints — and the ETag / If-Match /
412 contract of every editable object (apps/common/concurrency.py) — so each endpoint only
documents the errors specific to it.
"""

from typing import Any

from drf_spectacular.extensions import OpenApiSerializerExtension
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers

from .serializers import SyncStatusSerializer

HEALTH_STATUS_CHOICES = [("ok", "ok"), ("error", "error")]


class ErrorSerializer(serializers.Serializer):
    detail = serializers.CharField(help_text="Human-readable message; safe to show to the user.")
    code = serializers.CharField(
        required=False, help_text="Machine-readable reason, e.g. `token_not_valid` for a bad or expired JWT."
    )
    messages = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        help_text="JWT errors only: why each token type rejected the token.",
    )


class MessageSerializer(serializers.Serializer):
    detail = serializers.CharField(help_text="Confirmation message.")


class ValidationErrorSerializer(serializers.Serializer):
    """Placeholder — the real (dynamic) shape is produced by ValidationErrorExtension."""


class ValidationErrorExtension(OpenApiSerializerExtension):
    target_class = ValidationErrorSerializer

    def get_name(self, auto_schema, direction) -> str:
        return "ValidationError"

    def map_serializer(self, auto_schema, direction) -> dict[str, Any]:
        messages = {"type": "array", "items": {"type": "string"}}
        return {
            "type": "object",
            "description": (
                "One key per invalid field (or query parameter), each holding a list of messages. "
                "Problems that concern the request as a whole are under `non_field_errors`."
            ),
            "properties": {"non_field_errors": messages},
            "additionalProperties": messages,
        }


def error_response(description: str, *examples: tuple[str, dict]) -> OpenApiResponse:
    """A `{"detail": …}` error with named examples."""
    return OpenApiResponse(
        ErrorSerializer,
        description=description,
        examples=[OpenApiExample(name, value=value) for name, value in examples],
    )


def validation_error(*examples: tuple[str, dict], description: str | None = None) -> OpenApiResponse:
    """A 400 with the endpoint's typical field errors as named examples."""
    return OpenApiResponse(
        ValidationErrorSerializer,
        description=description or "Validation failed; nothing was changed. See the examples for typical messages.",
        examples=[OpenApiExample(name, value=value) for name, value in examples],
    )


def upload_too_large(field: str, limit_mb: int, noun: str = "file") -> OpenApiResponse:
    return OpenApiResponse(
        ValidationErrorSerializer,
        description=f"The upload is larger than {limit_mb} MB.",
        examples=[OpenApiExample("Too large", value={field: [f"The {noun} is too large (max {limit_mb} MB)."]})],
    )


def throttled(scope_description: str) -> OpenApiResponse:
    return error_response(
        f"Rate limit exceeded ({scope_description}). Retry after the number of seconds in `Retry-After`.",
        ("Throttled", {"detail": "Request was throttled. Expected available in 42 seconds."}),
    )


def message_response(description: str, example: str) -> OpenApiResponse:
    return OpenApiResponse(
        MessageSerializer, description=description, examples=[OpenApiExample("Success", value={"detail": example})]
    )


# --- Standard responses added to every matching operation ---------------------------------

_ERROR_REF = {"$ref": "#/components/schemas/Error"}


def _json_error(description: str, examples: dict[str, dict]) -> dict[str, Any]:
    return {
        "description": description,
        "content": {
            "application/json": {
                "schema": _ERROR_REF,
                "examples": {name: {"value": value} for name, value in examples.items()},
            }
        },
    }


UNAUTHORIZED = _json_error(
    "No valid access token: missing, malformed or expired. Refresh it with `POST /api/auth/refresh/` "
    "and retry once; if the refresh fails too, the user must log in again.",
    {
        "NoToken": {"detail": "Authentication credentials were not provided."},
        "InvalidOrExpiredToken": {
            "detail": "Given token not valid for any token type",
            "code": "token_not_valid",
            "messages": [{"token_class": "AccessToken", "token_type": "access", "message": "Token is expired"}],
        },
    },
)

_MODEL_BY_RESOURCE = {
    "categories": "Category",
    "transactions": "Transaction",
    "budgets": "Budget",
    "savings-goals": "SavingsGoal",
    "recurring-transactions": "RecurringTransaction",
    "subscriptions": "Subscription",
    "devices": "Device",
    "notifications": "Notification",
}


def _not_found(path: str) -> dict[str, Any]:
    model = _MODEL_BY_RESOURCE.get(path.strip("/").split("/")[1], "object")
    return _json_error(
        "No such object for the signed-in user. Objects of other users are reported exactly the same way.",
        {"NotFound": {"detail": f"No {model} matches the given query."}},
    )

THROTTLED = {
    **_json_error(
        "Rate limit exceeded (see *Rate limits* in the introduction). Retry after `Retry-After` seconds.",
        {"Throttled": {"detail": "Request was throttled. Expected available in 42 seconds."}},
    ),
    "headers": {
        "Retry-After": {"schema": {"type": "integer"}, "description": "Seconds until the next request is allowed."}
    },
}

UNTHROTTLED_PREFIXES = ("/api/health/",)

# Resources whose viewsets use ConditionalWriteMixin (tests/test_sync.py keeps the two in step).
CONDITIONAL_RESOURCES = {
    "transactions",
    "categories",
    "budgets",
    "savings-goals",
    "recurring-transactions",
    "subscriptions",
}

IF_MATCH = {
    "in": "header",
    "name": "If-Match",
    "required": False,
    "schema": {"type": "string"},
    "description": (
        "Optional optimistic-concurrency check: the object's `updated_at` as you last loaded it, in quotes "
        '(`"2026-09-27T14:03:31.357564Z"`, the `ETag` of its GET). If it has changed since — on another '
        "device or tab — nothing is written and the answer is `412`. Without the header the last write wins."
    ),
}

ETAG = {
    "ETag": {
        "schema": {"type": "string"},
        "description": "The object's version: its `updated_at` in quotes. Send it back as `If-Match` when changing it.",
    }
}


def _precondition_failed(object_schema: dict) -> dict[str, Any]:
    return {
        "description": (
            "`If-Match` didn't match: the object was changed after you loaded it (on another device or tab). "
            "Nothing was written. `current` is the object as it is now — show it, or reload."
        ),
        "content": {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "detail": {"type": "string", "description": "Safe to show to the user."},
                        "current": object_schema,
                    },
                    "required": ["detail", "current"],
                },
                "examples": {
                    "ChangedElsewhere": {
                        "value": {
                            "detail": (
                                "This transaction was changed on another device after you loaded it. "
                                "Nothing was saved; review the current version and try again."
                            ),
                            "current": {"id": 42, "updated_at": "2026-09-27T14:05:10.004211Z"},
                        }
                    }
                },
            }
        },
    }


def _document_conditional_writes(path: str, operations: dict) -> None:
    parts = path.strip("/").split("/")  # ["api", "<resource>", "{id}"]
    if len(parts) != 3 or parts[1] not in CONDITIONAL_RESOURCES or parts[2] != "{id}":
        return
    object_schema = operations["get"]["responses"]["200"]["content"]["application/json"]["schema"]
    for method, operation in operations.items():
        if method in ("get", "patch", "put"):
            operation["responses"]["200"].setdefault("headers", {}).update(ETAG)
        if method in ("patch", "put", "delete"):
            operation.setdefault("parameters", []).append(IF_MATCH)
            operation["responses"].setdefault("412", _precondition_failed(object_schema))


def add_standard_error_responses(result: dict, generator, request, public) -> dict:
    """Post-processing hook: 401 on authenticated operations, 404 on object URLs, 429 everywhere
    throttled, and ETag / If-Match / 412 on editable objects."""
    for path, operations in result.get("paths", {}).items():
        _document_conditional_writes(path, operations)
        for operation in operations.values():
            responses = operation.setdefault("responses", {})
            secured = any("jwtAuth" in requirement for requirement in operation.get("security", []))
            if secured:
                responses.setdefault("401", UNAUTHORIZED)
            if "{id}" in path:
                responses.setdefault("404", _not_found(path))
            if not path.startswith(UNTHROTTLED_PREFIXES):
                responses.setdefault("429", THROTTLED)
            operation["responses"] = dict(sorted(responses.items()))
    return result


# --- Health probes ---------------------------------------------------------------------------

LIVENESS_SCHEMA = extend_schema(
    tags=["Health"],
    summary="Liveness probe",
    description=(
        "Answers `200` whenever the process can serve HTTP. Checks no dependencies, so a database "
        "outage never makes an orchestrator restart healthy containers. Public, unthrottled, "
        "exempt from the HTTPS redirect."
    ),
    responses={
        200: inline_serializer(
            "Liveness", {"status": serializers.ChoiceField(choices=HEALTH_STATUS_CHOICES, help_text="Always `ok`.")}
        )
    },
)

_READINESS = inline_serializer(
    "Readiness",
    {
        "status": serializers.ChoiceField(choices=HEALTH_STATUS_CHOICES, help_text="`ok` only if every check passed."),
        "checks": inline_serializer(
            "ReadinessChecks",
            {
                "database": serializers.ChoiceField(choices=HEALTH_STATUS_CHOICES),
                "cache": serializers.ChoiceField(choices=HEALTH_STATUS_CHOICES, help_text="Holds the rate-limit counters."),
            },
        ),
    },
)

READINESS_SCHEMA = extend_schema(
    tags=["Health"],
    summary="Readiness probe",
    description=(
        "Checks everything a normal request needs (database, cache). Route traffic here only while it "
        "answers `200`. The reason for a failure is written to the server log, never to the response."
    ),
    responses={
        200: OpenApiResponse(_READINESS, description="Ready to serve traffic."),
        503: OpenApiResponse(
            _READINESS,
            description="At least one dependency failed.",
            examples=[
                OpenApiExample(
                    "Database down",
                    value={"status": "error", "checks": {"database": "error", "cache": "error"}},
                )
            ],
        ),
    },
)


# --- Multi-device sync -----------------------------------------------------------------------

SYNC_STATUS_SCHEMA = extend_schema(
    tags=["Sync"],
    summary="Has anything changed?",
    description=(
        "Every device (web, iPhone, Android) reads and writes the same data through this API, so a device "
        "is in sync as soon as it reloads what changed. This answers *whether* to reload, cheaply (one "
        "query, no data): compare `version` with the last one you saw and reload your views when it "
        "differs. The web and mobile apps ask every 30 s while visible, when they come back to the "
        "foreground, and right after their own writes.\n\n"
        "`last_modified` comes from the server clock (`updated_at`); never compare it with the device's "
        "own clock. A deletion lowers `count`, every other write moves `last_modified`, and changing the "
        "base currency changes `version` as well. API responses are never cacheable "
        "(`Cache-Control: no-store`), so a reload always gets the current data."
    ),
    responses={
        200: OpenApiResponse(
            SyncStatusSerializer,
            examples=[
                OpenApiExample(
                    "Status",
                    value={
                        "version": "5f0c1e9b2a7d4c38e1aa",
                        "server_time": "2026-09-27T14:05:12.861020Z",
                        "resources": {
                            "transactions": {"count": 128, "last_modified": "2026-09-27T14:05:10.004211Z"},
                            "categories": {"count": 11, "last_modified": "2026-09-20T08:11:02.300118Z"},
                            "budgets": {"count": 4, "last_modified": "2026-09-01T07:30:45.001922Z"},
                            "recurring_transactions": {"count": 6, "last_modified": "2026-09-26T19:02:13.515003Z"},
                            "savings_goals": {"count": 0, "last_modified": None},
                        },
                    },
                )
            ],
        )
    },
)
