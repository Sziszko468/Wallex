"""Upload size guards shared by the file-accepting endpoints (CSV import, receipt scan).

Django streams any multipart body to memory/disk *before* a view can look at
`request.FILES`, so a size check on the parsed file alone still lets a client
make the server swallow gigabytes. These helpers reject an oversized upload
from its declared Content-Length first — call them before touching
`request.FILES` / `request.data`.
"""

from rest_framework import status
from rest_framework.response import Response

# Room for multipart boundaries and headers around the file itself.
MULTIPART_OVERHEAD_BYTES = 64 * 1024


def declared_body_exceeds(request, limit_bytes: int) -> bool:
    try:
        declared = int(request.META.get("CONTENT_LENGTH") or 0)
    except (TypeError, ValueError):
        return False
    return declared > limit_bytes + MULTIPART_OVERHEAD_BYTES


def file_too_large(field: str, limit_bytes: int, noun: str = "file") -> Response:
    limit_mb = max(limit_bytes // (1024 * 1024), 1)
    return Response(
        {field: [f"The {noun} is too large (max {limit_mb} MB)."]},
        status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
    )
