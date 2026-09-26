"""Health probes for Docker, load balancers and uptime monitors.

- live:  the process can answer HTTP. Checks no dependencies: a database outage must
         not make the orchestrator restart healthy backend containers in a loop.
- ready: everything a normal request needs is usable. When it fails, stop routing
         traffic here (and don't start the web container in docker-compose.prod.yml).

Both are public and unthrottled — probes carry no token and run every few seconds —
and they never reveal *why* a dependency failed; the reason goes to the server log.
"""

import logging
from collections.abc import Callable

from django.core.cache import cache
from django.db import connection
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


def _check_database() -> None:
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")


def _check_cache() -> None:
    # Rate-limit counters live in the cache. With the production database cache, a
    # forgotten `createcachetable` would otherwise turn every API request into a 500.
    cache.get("health-check")


CHECKS: dict[str, Callable[[], None]] = {
    "database": _check_database,
    "cache": _check_cache,
}


class _HealthView(APIView):
    # No authentication at all: a stale or garbage Authorization header must not fail a probe.
    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes: list = []


class LivenessView(_HealthView):
    def get(self, request: Request) -> Response:
        return Response({"status": "ok"})


class ReadinessView(_HealthView):
    def get(self, request: Request) -> Response:
        results: dict[str, str] = {}
        for name, check in CHECKS.items():
            try:
                check()
                results[name] = "ok"
            except Exception:  # a probe must report any failure, not crash with a 500
                logger.exception("Readiness check %r failed", name)
                results[name] = "error"

        healthy = all(result == "ok" for result in results.values())
        return Response(
            {"status": "ok" if healthy else "error", "checks": results},
            status=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        )
