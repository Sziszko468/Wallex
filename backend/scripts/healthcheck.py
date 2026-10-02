"""Container health check: exit 0 when the local server reports ready, 1 otherwise.

Used by docker-compose.prod.yml. It calls the readiness endpoint over HTTP, so it proves
that gunicorn is actually serving requests, not just that the process exists.

Django rejects requests whose Host header isn't in ALLOWED_HOSTS (400), and a probe to
127.0.0.1 would be one of them — so the check presents the first configured host name.
"""

import os
import sys
import urllib.error
import urllib.request
from http import HTTPStatus


def _host_header() -> str:
    first = os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",")[0].strip()
    # ".example.com" allows every subdomain; "example.com" itself matches it.
    host = first.lstrip(".")
    return host if host and host != "*" else "localhost"


def main() -> int:
    port = os.environ.get("PORT", "8000")
    request = urllib.request.Request(f"http://127.0.0.1:{port}/api/health/ready/", headers={"Host": _host_header()})
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return 0 if response.status == HTTPStatus.OK else 1
    except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
        print(f"health check failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
