"""Optimistic concurrency: an edit made on one device must not silently undo an edit made on another.

Every editable object carries `updated_at`, which changes on every save. That timestamp is the
object's version, and doubles as its HTTP entity tag:

- GET / PATCH on an object answer with `ETag: "<updated_at>"` (the same value as in the body).
- PATCH / PUT / DELETE may send `If-Match: "<updated_at the client last saw>"`. If the object has
  changed since (another phone, the web app, another tab), nothing is written and the answer is
  `412 Precondition Failed` with the current version, so the client can show what changed.

The header is optional, so clients that don't send it keep the previous last-write-wins
behaviour. The check and the write run in one transaction with the row locked: two devices
saving the same version at the same moment can't both succeed.
"""

from datetime import datetime

from django.db import transaction
from django.utils.dateparse import parse_datetime
from django.utils.translation import gettext_lazy as _
from rest_framework import status
from rest_framework.exceptions import APIException, ErrorDetail

VERSION_FIELD = "updated_at"
_CONDITIONAL_METHODS = {"PUT", "PATCH", "DELETE"}


class PreconditionFailed(APIException):
    status_code = status.HTTP_412_PRECONDITION_FAILED
    default_code = "precondition_failed"

    def __init__(self, message: str, current: dict):
        super().__init__(message)
        # Set after __init__: DRF would otherwise turn every value of `current` into a string.
        self.detail = {"detail": ErrorDetail(message, self.default_code), "current": current}


def entity_tag(version: str) -> str:
    return f'"{version}"'


def _versions_in(if_match: str) -> list[datetime | None]:
    """The versions listed in an If-Match header: `"…"`, `W/"…"`, comma-separated."""
    versions = []
    for tag in if_match.split(","):
        value = tag.strip().removeprefix("W/").strip('"')
        try:
            versions.append(parse_datetime(value))
        except ValueError:  # well formatted but impossible, e.g. month 13
            versions.append(None)
    return versions


def precondition_holds(if_match: str, current: datetime) -> bool:
    """RFC 9110 If-Match: `*` matches any existing object, otherwise one listed version must equal it."""
    if if_match.strip() == "*":
        return True
    return any(version == current for version in _versions_in(if_match))


class ConditionalWriteMixin:
    """For ModelViewSets of objects with `updated_at`: ETag on reads, If-Match on writes."""

    def _is_conditional_write(self, request) -> bool:
        lookup = self.lookup_url_kwarg or self.lookup_field
        return request.method in _CONDITIONAL_METHODS and lookup in self.kwargs and "If-Match" in request.headers

    def dispatch(self, request, *args, **kwargs):
        # The check (in initial) and the write (in the handler) must share one transaction,
        # so the row lock taken by the check is held until the write is committed.
        if request.method in _CONDITIONAL_METHODS and "HTTP_IF_MATCH" in request.META:
            with transaction.atomic():
                return super().dispatch(request, *args, **kwargs)
        return super().dispatch(request, *args, **kwargs)

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)  # authentication, permissions, throttling first
        if self._is_conditional_write(request):
            self._check_precondition(request.headers["If-Match"])

    def _check_precondition(self, if_match: str) -> None:
        instance = self.get_object()  # 404 / 403 exactly as without the header
        model = type(instance)
        current = (
            model._default_manager.select_for_update()
            .filter(pk=instance.pk)
            .values_list(VERSION_FIELD, flat=True)
            .get()
        )
        if not precondition_holds(if_match, current):
            latest = self.get_object()
            raise PreconditionFailed(
                _(
                    "This item was changed on another device after you loaded it. Nothing was saved; review the current version and try again."
                ),
                current=self.get_serializer(latest).data,
            )

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        lookup = self.lookup_url_kwarg or self.lookup_field
        data = getattr(response, "data", None)
        if (
            request.method in ("GET", "HEAD", "PUT", "PATCH")
            and lookup in self.kwargs
            and status.is_success(response.status_code)
            and isinstance(data, dict)
            and data.get(VERSION_FIELD)
        ):
            response["ETag"] = entity_tag(data[VERSION_FIELD])
        return response
