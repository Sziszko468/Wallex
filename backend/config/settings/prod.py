from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .base import ALLOWED_HOSTS, DATABASES, MIDDLEWARE, REST_FRAMEWORK, SECRET_KEY, SIMPLE_JWT, env


def _require(condition: bool, message: str) -> None:
    """Refuse to start with an unsafe configuration instead of running insecurely."""
    if not condition:
        raise ImproperlyConfigured(message)


def _is_strong_key(key: str) -> bool:
    return len(key) >= 50 and "change-me" not in key and not key.startswith("django-insecure")


# The web app is normally served from the API's own origin (the web image proxies /api/),
# which needs no CORS at all. List origins only for a web front end hosted on another domain.
# Native mobile apps are not browsers and are never subject to CORS.
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])

_require(
    bool(ALLOWED_HOSTS) and "*" not in ALLOWED_HOSTS,
    "DJANGO_ALLOWED_HOSTS must list the real host name(s) in production — never '*'.",
)
_require(
    _is_strong_key(SECRET_KEY),
    "DJANGO_SECRET_KEY must be a long random value in production (50+ characters, not a placeholder).",
)
_require(
    _is_strong_key(SIMPLE_JWT["SIGNING_KEY"]),
    "JWT_SIGNING_KEY, when set, must be a long random value too (an empty key would let anyone sign tokens).",
)
_require(
    all(origin.startswith("https://") for origin in CORS_ALLOWED_ORIGINS),
    "CORS_ALLOWED_ORIGINS must only contain https:// origins in production.",
)

DEBUG = False

# --- HTTPS ------------------------------------------------------------------------------
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
# Health probes (Docker, load balancers) reach the container over plain HTTP.
SECURE_REDIRECT_EXEMPT = [r"^api/health/"]
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

# --- Static files -----------------------------------------------------------------------
# The image runs collectstatic at build time; WhiteNoise serves the result (the admin's
# CSS/JS) straight from gunicorn, compressed and with far-future cache headers — the
# backend needs no separate file server wherever it is deployed.
_after_security = MIDDLEWARE.index("django.middleware.security.SecurityMiddleware") + 1
MIDDLEWARE = [
    *MIDDLEWARE[:_after_security],
    "whitenoise.middleware.WhiteNoiseMiddleware",
    *MIDDLEWARE[_after_security:],
]
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# --- Cache (rate-limit counters) --------------------------------------------------------
# Must be shared by every gunicorn worker and container, or each one counts separately and
# the limits multiply. The database cache needs no extra service (its table is created by
# `createcachetable` next to the migrations); point CACHE_URL at Redis when traffic grows.
CACHES = {"default": env.cache_url("CACHE_URL", default="dbcache://spendly_cache")}

# --- Database ---------------------------------------------------------------------------
# Keep connections open between requests instead of reconnecting every time.
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DJANGO_DB_CONN_MAX_AGE", default=60)

# --- API --------------------------------------------------------------------------------
# JSON only: the browsable HTML API is a development tool.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
}

# --- Logging ----------------------------------------------------------------------------
# Everything to stdout, where Docker / the platform collects it. Django's default sends
# unhandled-exception tracebacks only to ADMINS by e-mail when DEBUG is off — i.e. nowhere.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "plain": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "plain"},
    },
    "root": {"handlers": ["console"], "level": env("DJANGO_LOG_LEVEL", default="INFO")},
}
