from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .base import ALLOWED_HOSTS, CORS_ALLOWED_ORIGINS, SECRET_KEY, env


def _require(condition: bool, message: str) -> None:
    """Refuse to start with an unsafe configuration instead of running insecurely."""
    if not condition:
        raise ImproperlyConfigured(message)


_require(
    bool(ALLOWED_HOSTS) and "*" not in ALLOWED_HOSTS,
    "DJANGO_ALLOWED_HOSTS must list the real host name(s) in production — never '*'.",
)
_require(
    len(SECRET_KEY) >= 50 and "change-me" not in SECRET_KEY and not SECRET_KEY.startswith("django-insecure"),
    "DJANGO_SECRET_KEY must be a long random value in production (50+ characters, not a placeholder).",
)
_require(
    all(origin.startswith("https://") for origin in CORS_ALLOWED_ORIGINS),
    "CORS_ALLOWED_ORIGINS must only contain https:// origins in production.",
)

DEBUG = False

# HTTPS only.
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
if env.bool("DJANGO_BEHIND_TLS_PROXY", default=False):
    # Only when a proxy terminates TLS and ALWAYS sets this header — otherwise a
    # client could forge it and make plain-HTTP requests look secure.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Cookies are only used by the Django admin (the API itself uses bearer tokens).
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = True
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
