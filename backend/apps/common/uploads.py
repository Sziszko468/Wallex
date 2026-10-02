"""Upload size guards shared by the file-accepting endpoints (CSV import, receipt scan).

Django streams any multipart body to memory/disk *before* a view can look at
`request.FILES`, so a size check on the parsed file alone still lets a client
make the server swallow gigabytes. These helpers reject an oversized upload
from its declared Content-Length first — call them before touching
`request.FILES` / `request.data`.
"""

from django.utils.translation import gettext
from rest_framework import status
from rest_framework.response import Response

from .constants import BYTES_PER_MEGABYTE

# Room for multipart boundaries and headers around the file itself.
MULTIPART_OVERHEAD_BYTES = 64 * 1024


def declared_body_exceeds(request, limit_bytes: int) -> bool:
    try:
        declared = int(request.META.get("CONTENT_LENGTH") or 0)
    except (TypeError, ValueError):
        return False
    return declared > limit_bytes + MULTIPART_OVERHEAD_BYTES


def file_too_large(field: str, limit_bytes: int, *, photo: bool = False) -> Response:
    limit_mb = max(limit_bytes // BYTES_PER_MEGABYTE, 1)
    message = (
        gettext("The photo is too large (max %(limit)s MB).")
        if photo
        else gettext("The file is too large (max %(limit)s MB).")
    )
    return Response(
        {field: [message % {"limit": limit_mb}]},
        status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
    )
