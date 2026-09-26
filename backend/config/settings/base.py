from datetime import timedelta
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "corsheaders",
    "drf_spectacular",
    "apps.users",
    "apps.currencies",
    "apps.categories",
    "apps.transactions",
    "apps.budgets",
    "apps.analytics",
    "apps.notifications",
    "apps.receipts",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Either a single DATABASE_URL — what managed Postgres services hand out, e.g.
# postgres://user:pass@host:5432/spendly?sslmode=require — or the POSTGRES_* parts.
if env("DATABASE_URL", default=""):
    DATABASES = {"default": env.db_url("DATABASE_URL")}
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("POSTGRES_DB"),
            "USER": env("POSTGRES_USER"),
            "PASSWORD": env("POSTGRES_PASSWORD"),
            "HOST": env("POSTGRES_HOST", default="localhost"),
            "PORT": env("POSTGRES_PORT", default="5432"),
            # "require" (or stricter) for a database reached over a network you don't control.
            "OPTIONS": {"sslmode": env("POSTGRES_SSLMODE", default="prefer")},
        }
    }

if DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql":
    raise ImproperlyConfigured("Spendly only runs on PostgreSQL — check DATABASE_URL.")

# A reused connection is verified before each request instead of failing on a stale one.
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

AUTH_USER_MODEL = "users.User"
AUTHENTICATION_BACKENDS = ["apps.users.backends.CaseInsensitiveEmailBackend"]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
# `collectstatic` target (baked into the production image, served by WhiteNoise).
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    # No DEFAULT_FILTER_BACKENDS: filtering/search/ordering is opt-in per view. A global
    # OrderingFilter lets clients sort by *any* serializer field — including computed ones
    # like a budget's spent_amount, which the database can't order by (500).
    # A generous ceiling for every authenticated user, plus stricter per-view scopes.
    "DEFAULT_THROTTLE_CLASSES": ("rest_framework.throttling.UserRateThrottle",),
    "DEFAULT_THROTTLE_RATES": {
        "user": env("API_USER_RATE", default="2000/hour"),
        "auth_login": env("AUTH_LOGIN_RATE", default="10/minute"),
        "auth_register": env("AUTH_REGISTER_RATE", default="10/hour"),
        "auth_refresh": env("AUTH_REFRESH_RATE", default="30/minute"),
        "receipt_scan": env("RECEIPT_SCAN_RATE", default="30/hour"),
    },
    # How many reverse proxies sit in front of Django. Throttling identifies
    # clients by IP; with None, DRF trusts X-Forwarded-For as sent, which an
    # attacker can rotate freely. 0 = the socket address (no proxy, local dev).
    "NUM_PROXIES": env.int("DRF_NUM_PROXIES", default=0),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# --- OpenAPI documentation (drf-spectacular) --------------------------------------------
# The schema is generated from the serializers and views themselves; per-endpoint docs
# live in each app's openapi.py. Served at /api/schema/ (YAML) and /api/docs/ (Swagger
# UI) when enabled; a committed copy lives in backend/openapi.yaml.
API_DOCS_ENABLED = env.bool("API_DOCS_ENABLED", default=True)

SPECTACULAR_SETTINGS = {
    "TITLE": "Spendly API",
    "VERSION": "1.0.0",
    "DESCRIPTION": (BASE_DIR / "config" / "api_description.md").read_text(encoding="utf-8"),
    "SERVE_INCLUDE_SCHEMA": False,
    # The docs are public: a stale or garbage Authorization header must not break them.
    "SERVE_AUTHENTICATION": [],
    "SERVE_PERMISSIONS": ["rest_framework.permissions.AllowAny"],
    # Separate request/response components: read-only fields never show up as inputs,
    # and PATCH bodies get their own all-optional component.
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": r"/api/",
    "ENUM_NAME_OVERRIDES": {
        "CurrencyEnum": "apps.currencies.models.Currency",
        "TransactionTypeEnum": "apps.categories.models.TransactionType",
        "FrequencyEnum": "apps.transactions.models.Frequency",
        "DevicePlatformEnum": "apps.notifications.models.DevicePlatform",
        "InsightTypeEnum": "apps.analytics.openapi.INSIGHT_TYPE_CHOICES",
        "InsightSeverityEnum": "apps.analytics.openapi.INSIGHT_SEVERITY_CHOICES",
        "ComparisonAgainstEnum": "apps.analytics.openapi.COMPARISON_AGAINST_CHOICES",
        "BudgetStatusEnum": "apps.analytics.openapi.BUDGET_STATUS_CHOICES",
        "ImportRowStatusEnum": "apps.transactions.openapi.IMPORT_ROW_STATUS_CHOICES",
        "HealthStatusEnum": "apps.common.openapi.HEALTH_STATUS_CHOICES",
        "OcrConfidenceEnum": "apps.receipts.openapi.CONFIDENCE_CHOICES",
        "SuggestionSourceEnum": "apps.receipts.openapi.SOURCE_CHOICES",
    },
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        "apps.common.openapi.add_standard_error_responses",
    ],
    "TAGS": [
        {"name": "Authentication", "description": "Register, obtain and refresh JWTs, log out."},
        {"name": "Users", "description": "The signed-in user's profile."},
        {"name": "Transactions", "description": "Income and expense records — the core of the API."},
        {"name": "CSV Import", "description": "Bulk-create transactions from a bank export."},
        {"name": "Categories", "description": "Income/expense categories, including the 10 system defaults."},
        {"name": "Budgets", "description": "Monthly spending limits, overall or per category, with live usage."},
        {"name": "Recurring Transactions", "description": "Templates for repeating income and expenses."},
        {"name": "Currencies", "description": "Conversion previews with ECB reference rates."},
        {"name": "Analytics", "description": "Read-only monthly summaries computed on the server."},
        {"name": "Financial Insights", "description": "Rule-based observations about a month's finances."},
        {"name": "Receipt Scanning", "description": "OCR suggestions from a receipt photo."},
        {"name": "Notifications", "description": "Push-notification devices and preferences (mobile app)."},
        {"name": "Health", "description": "Liveness and readiness probes for infrastructure."},
    ],
    "SWAGGER_UI_SETTINGS": {
        "deepLinking": True,
        "persistAuthorization": True,
        "displayRequestDuration": True,
        "defaultModelsExpandDepth": 0,
    },
}

CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS", default=["http://localhost:5173", "http://localhost:8081"]
)

# Receipt scanning. The OCR engine is swappable: any class implementing
# apps.receipts.ocr.OcrProvider, e.g. a cloud OCR adapter.
RECEIPT_OCR_PROVIDER = env(
    "RECEIPT_OCR_PROVIDER", default="apps.receipts.ocr.tesseract.TesseractOcrProvider"
)
RECEIPT_OCR_LANGUAGES = env("RECEIPT_OCR_LANGUAGES", default="hun+eng")
RECEIPT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# CSV import limits: a bank export for a few years fits easily; anything bigger
# is refused instead of tying up a worker (every row costs a duplicate check).
CSV_IMPORT_MAX_BYTES = 2 * 1024 * 1024
CSV_IMPORT_MAX_ROWS = 5000

# Optional: only needed once "Enhanced push security" is enabled for the Expo project.
EXPO_PUSH_ACCESS_TOKEN = env("EXPO_PUSH_ACCESS_TOKEN", default="")

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    # A separate key can be rotated (signing everyone out) without touching SECRET_KEY.
    "SIGNING_KEY": env("JWT_SIGNING_KEY", default=SECRET_KEY),
    "TOKEN_REFRESH_SERIALIZER": "apps.users.serializers.SafeTokenRefreshSerializer",
}
