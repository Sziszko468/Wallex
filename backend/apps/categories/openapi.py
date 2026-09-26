"""OpenAPI documentation for the category endpoints."""

from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema, extend_schema_view

from apps.common.openapi import error_response, validation_error

from .serializers import CategorySerializer

_SYSTEM_CATEGORY = error_response(
    "System (default) categories can't be changed or deleted.",
    ("System category", {"detail": "You do not have permission to perform this action."}),
)

_VALIDATION = validation_error(
    ("Duplicate name", {"name": ["You already have a category with this name and type."]}),
    ("Invalid colour", {"color": ["Color must be a hex code, e.g. #6366F1."]}),
    ("Invalid type", {"type": ['"other" is not a valid choice.']}),
    ("Missing fields", {"name": ["This field is required."], "type": ["This field is required."]}),
)

_EXAMPLE = {
    "id": 206,
    "name": "Gym",
    "type": "expense",
    "color": "#16A34A",
    "icon": "dumbbell",
    "is_system": False,
    "created_at": "2026-09-26T09:49:56.163778Z",
    "updated_at": "2026-09-26T09:49:56.163806Z",
}

CATEGORY_VIEWSET_SCHEMA = extend_schema_view(
    list=extend_schema(
        tags=["Categories"],
        summary="List categories",
        description=(
            "All of the user's categories — the 10 system defaults created at registration plus their own — "
            "sorted by name. Not paginated. Filter by `type` on the client if needed."
        ),
        responses={200: OpenApiResponse(CategorySerializer(many=True), description="Every category of the user.")},
    ),
    create=extend_schema(
        tags=["Categories"],
        summary="Create a category",
        description=(
            "Names must be unique per user and type, ignoring letter case (an income and an expense "
            "category may share a name)."
        ),
        responses={
            201: OpenApiResponse(CategorySerializer, description="Created."),
            400: _VALIDATION,
        },
        examples=[
            OpenApiExample(
                "Custom expense category",
                request_only=True,
                value={"name": "Gym", "type": "expense", "color": "#16A34A", "icon": "dumbbell"},
            ),
            OpenApiExample("Created", response_only=True, status_codes=["201"], value=_EXAMPLE),
        ],
    ),
    retrieve=extend_schema(
        tags=["Categories"],
        summary="Get a category",
        responses={200: CategorySerializer},
    ),
    partial_update=extend_schema(
        tags=["Categories"],
        summary="Update a category",
        description=(
            "Changes any subset of `name`, `type`, `color`, `icon`. System categories are read-only (`403`).\n\n"
            "**Caution:** changing `type` does not touch the category's existing transactions — they keep "
            "their own `type`, and can't be edited again until the types match. Create a new category "
            "instead of switching the type of one that is in use."
        ),
        responses={
            200: CategorySerializer,
            400: _VALIDATION,
            403: _SYSTEM_CATEGORY,
        },
    ),
    destroy=extend_schema(
        tags=["Categories"],
        summary="Delete a category",
        description=(
            "Only custom categories that no transaction or recurring transaction uses can be deleted. "
            "Budgets of the category are deleted with it."
        ),
        responses={
            204: OpenApiResponse(description="Deleted."),
            403: _SYSTEM_CATEGORY,
            409: error_response(
                "The category is still used by transactions or recurring transactions. "
                "Move or delete those first.",
                ("In use", {"detail": "This category is used by existing transactions and cannot be deleted."}),
            ),
        },
    ),
)
