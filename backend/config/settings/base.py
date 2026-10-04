from datetime import timedelta
from pathlib import Path

import environ
from corsheaders.defaults import default_headers
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
    "apps.subscriptions",
    "apps.budgets",
    "apps.analytics",
    "apps.notifications",
    "apps.receipts",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "apps.common.middleware.ApiNeverCacheMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
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
# postgres://user:pass@host:5432/wallex?sslmode=require — or the POSTGRES_* parts.
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
    raise ImproperlyConfigured("WALLEX only runs on PostgreSQL — check DATABASE_URL.")

# A reused connection is verified before each request instead of failing on a stale one.
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

AUTH_USER_MODEL = "users.User"
AUTHENTICATION_BACKENDS = ["apps.users.backends.CaseInsensitiveEmailBackend"]

# Length is what makes a password strong: 12+ characters, long passphrases welcome (up to
# 128), none of the 20,000 most common passwords, not only digits, not similar to the email.
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 12}},
    {"NAME": "apps.users.validators.MaximumLengthValidator", "OPTIONS": {"max_length": 128}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# The API speaks the languages of the apps: LocaleMiddleware picks one per request from the
# Accept-Language header; texts written outside a request use the user's own saved language
# (apps/common/i18n.py). The catalogs live in backend/locale (python manage.py compilemessages).
LANGUAGE_CODE = "en"
LANGUAGES = [("en", "English"), ("hu", "Magyar")]
LOCALE_PATHS = [BASE_DIR / "locale"]
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
# `collectstatic` target (baked into the production image, served by WhiteNoise).
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    # JWT + the token's session must still be active (apps/users/authentication.py).
    "DEFAULT_AUTHENTICATION_CLASSES": ("apps.users.authentication.SessionJWTAuthentication",),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    # No DEFAULT_FILTER_BACKENDS: filtering/search/ordering is opt-in per view. A global
    # OrderingFilter lets clients sort by *any* serializer field — including computed ones
    # like a budget's spent_amount, which the database can't order by (500).
    # A generous ceiling for every authenticated user, plus stricter per-view scopes.
    "DEFAULT_THROTTLE_CLASSES": ("rest_framework.throttling.UserRateThrottle",),
    "DEFAULT_THROTTLE_RATES": {
        "user": env("API_USER_RATE", default="2000/hour"),
        "auth_login": env("AUTH_LOGIN_RATE", default="10/minute"),
        "auth_register": env("AUTH_REGISTER_RATE", default="10/hour"),
        # Two-factor codes on sign-in (per IP; the per-account lockout also counts them).
        "auth_mfa": env("AUTH_MFA_RATE", default="10/minute"),
        # Password change, 2FA setup/disable, new recovery codes (per user).
        "auth_sensitive": env("AUTH_SENSITIVE_RATE", default="20/hour"),
        "auth_refresh": env("AUTH_REFRESH_RATE", default="30/minute"),
        "receipt_scan": env("RECEIPT_SCAN_RATE", default="30/hour"),
        # Questions to the AI assistant (per user): every one is a paid model call.
        "assistant": env("AI_ASSISTANT_RATE", default=env("ASSISTANT_RATE", default="30/hour")),
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
    "TITLE": "WALLEX API",
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
        "SubscriptionStatusEnum": "apps.subscriptions.openapi.SUBSCRIPTION_STATUS_CHOICES",
        "SavingsGoalStatusEnum": "apps.budgets.openapi.SAVINGS_GOAL_STATUS_CHOICES",
        "AchievementCategoryEnum": "apps.analytics.openapi.ACHIEVEMENT_CATEGORY_CHOICES",
        "AchievementUnitEnum": "apps.analytics.openapi.ACHIEVEMENT_UNIT_CHOICES",
        "DevicePlatformEnum": "apps.notifications.models.DevicePlatform",
        "ClientPlatformEnum": "apps.users.models.ClientPlatform",
        "AuditActionEnum": "apps.users.models.AuditAction",
        "AuditCategoryEnum": "apps.users.models.AuditCategory",
        "NotificationKindEnum": "apps.notifications.models.NotificationKind",
        "RelatedObjectTypeEnum": "apps.notifications.models.RelatedType",
        "InsightTypeEnum": "apps.analytics.openapi.INSIGHT_TYPE_CHOICES",
        "InsightSeverityEnum": "apps.analytics.openapi.INSIGHT_SEVERITY_CHOICES",
        "ComparisonAgainstEnum": "apps.analytics.openapi.COMPARISON_AGAINST_CHOICES",
        "BudgetStatusEnum": "apps.analytics.openapi.BUDGET_STATUS_CHOICES",
        "ImportRowStatusEnum": "apps.transactions.openapi.IMPORT_ROW_STATUS_CHOICES",
        "HealthStatusEnum": "apps.common.openapi.HEALTH_STATUS_CHOICES",
        "OcrConfidenceEnum": "apps.receipts.openapi.CONFIDENCE_CHOICES",
        "SuggestionSourceEnum": "apps.receipts.openapi.SOURCE_CHOICES",
        "ReceiptOutcomeEnum": "apps.receipts.openapi.OUTCOME_CHOICES",
        "AssistantToolEnum": "apps.analytics.assistant.serializers.TOOL_CHOICES",
        "AssistantRoleEnum": "apps.analytics.models.AssistantRole",
        "AssistantErrorCodeEnum": "apps.analytics.assistant.openapi.ERROR_CODE_CHOICES",
        "AssistantInsightTypeEnum": "apps.analytics.assistant.cards.CARD_TYPES",
        "AssistantInsightToneEnum": "apps.analytics.assistant.cards.TONE_CHOICES",
    },
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        "apps.common.openapi.add_standard_error_responses",
    ],
    "TAGS": [
        {"name": "Authentication", "description": "Register, obtain and refresh JWTs, log out."},
        {"name": "Users", "description": "The signed-in user's profile."},
        {
            "name": "Account Security",
            "description": "Signed-in devices, signing out everywhere, password, two-factor authentication, security log.",
        },
        {"name": "Transactions", "description": "Income and expense records — the core of the API."},
        {"name": "CSV Import", "description": "Bulk-create transactions from a bank export."},
        {"name": "Categories", "description": "Income/expense categories, including the 10 system defaults."},
        {"name": "Budgets", "description": "Monthly spending limits, overall or per category, with live usage."},
        {"name": "Savings Goals", "description": "Money put aside for a goal, in its own currency, with progress."},
        {"name": "Recurring Transactions", "description": "Templates for repeating income and expenses."},
        {
            "name": "Subscriptions",
            "description": "Streaming, software, gym, phone… — recurring expenses with costs and totals.",
        },
        {"name": "Currencies", "description": "Conversion previews with ECB reference rates."},
        {"name": "Analytics", "description": "Read-only monthly summaries computed on the server."},
        {"name": "Financial Insights", "description": "Rule-based observations about a month's finances."},
        {"name": "Achievements", "description": "Milestones earned from the user's own data, with progress."},
        {
            "name": "AI Assistant",
            "description": "Questions about the user's own finances, answered by Claude from read-only backend tools.",
        },
        {"name": "Receipt Scanning", "description": "OCR suggestions from a receipt photo."},
        {
            "name": "Notifications",
            "description": "In-app notifications decided by the server, their preferences, and push devices.",
        },
        {
            "name": "Sync",
            "description": "Keeping web, iPhone and Android in step: change detection, never-cached responses.",
        },
        {"name": "Health", "description": "Liveness and readiness probes for infrastructure."},
    ],
    "SWAGGER_UI_SETTINGS": {
        "deepLinking": True,
        "persistAuthorization": True,
        "displayRequestDuration": True,
        "defaultModelsExpandDepth": 0,
    },
}

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:5173", "http://localhost:8081"])
# If-Match carries the version a conditional write is based on (apps/common/concurrency.py);
# a browser on another origin may only send it once the preflight allows it. ETag is exposed
# so browser clients can read it too.
CORS_ALLOW_HEADERS = (*default_headers, "if-match", "x-auth-transport", "x-client-platform")
CORS_EXPOSE_HEADERS = ["ETag", "Content-Disposition"]  # the second names the data download for cross-origin clients
# The web app's refresh token is an HttpOnly cookie (apps/users/cookies.py): cross-origin requests
# may carry credentials — only for the explicit origins above, never for a wildcard.
CORS_ALLOW_CREDENTIALS = True

# --- Account security ----------------------------------------------------------------------
# Browser refresh-token cookie: HttpOnly, sent only to /api/auth/, never to other sites.
AUTH_REFRESH_COOKIE = {
    "NAME": "wallex_refresh",
    "PATH": "/api/auth/",
    "SECURE": env.bool("AUTH_COOKIE_SECURE", default=True),
    "SAMESITE": "Strict",
}
# Encrypts two-factor secrets and keys recovery-code hashes (apps/users/crypto.py). Production
# requires a dedicated value: rotating SECRET_KEY must not make 2FA secrets unreadable.
FIELD_ENCRYPTION_KEY = env("FIELD_ENCRYPTION_KEY", default=SECRET_KEY)
# The Django admin has password-only sign-in: production keeps it off unless it is needed
# (and then behind a VPN / IP allow-list), at a path of your choosing.
ADMIN_ENABLED = env.bool("DJANGO_ADMIN_ENABLED", default=True)
ADMIN_URL = env("DJANGO_ADMIN_URL", default="admin/")

# Receipt scanning. The OCR engine is swappable: any class implementing
# apps.receipts.ocr.OcrProvider, e.g. a cloud OCR adapter.
RECEIPT_OCR_PROVIDER = env("RECEIPT_OCR_PROVIDER", default="apps.receipts.ocr.tesseract.TesseractOcrProvider")
RECEIPT_OCR_LANGUAGES = env("RECEIPT_OCR_LANGUAGES", default="hun+eng")
RECEIPT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# CSV import limits: a bank export for a few years fits easily; anything bigger
# is refused instead of tying up a worker (every row costs a duplicate check).
CSV_IMPORT_MAX_BYTES = 2 * 1024 * 1024
CSV_IMPORT_MAX_ROWS = 5000

# Optional: only needed once "Enhanced push security" is enabled for the Expo project.
EXPO_PUSH_ACCESS_TOKEN = env("EXPO_PUSH_ACCESS_TOKEN", default="")

# --- AI finance assistant ----------------------------------------------------------------------
# Answers questions about the user's own finances. The model never reaches the database: all it can
# do is call the read-only tools in apps/analytics/assistant/tools.py, which return aggregated
# figures of the signed-in user. The provider (a vendor behind apps/analytics/assistant/providers/)
# is chosen here; its API key stays on the server. Without the chosen provider's key the feature is off.
GEMINI_API_KEY = env("GEMINI_API_KEY", default="")
ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY", default="")
# What each provider needs: its key, and the model and reasoning effort to use unless overridden.
AI_PROVIDER_DEFAULTS = {
    "gemini": {"key": GEMINI_API_KEY, "model": "gemini-3.8-flash", "effort": "low"},
    "anthropic": {"key": ANTHROPIC_API_KEY, "model": "claude-opus-5", "effort": "medium"},
}
# Gemini unless only a Claude key is set (an existing Claude setup keeps working without a new variable).
_ai_provider = env(
    "AI_ASSISTANT_PROVIDER", default="anthropic" if ANTHROPIC_API_KEY and not GEMINI_API_KEY else "gemini"
).lower()
if _ai_provider not in AI_PROVIDER_DEFAULTS:
    raise ImproperlyConfigured(
        f"AI_ASSISTANT_PROVIDER must be one of {', '.join(AI_PROVIDER_DEFAULTS)}, not {_ai_provider!r}."
    )
AI_ASSISTANT = {
    "PROVIDER": _ai_provider,
    "ENABLED": bool(AI_PROVIDER_DEFAULTS[_ai_provider]["key"]),
    # Builds the provider's SDK client (swappable, e.g. for tests); empty = the provider's own.
    "CLIENT": env("AI_ASSISTANT_CLIENT", default=""),
    "MODEL": env("AI_ASSISTANT_MODEL", default=AI_PROVIDER_DEFAULTS[_ai_provider]["model"]),
    # How hard the model thinks: low keeps chat answers quick and cheap; raise it if answers fall
    # short. Gemini: minimal | low | medium | high (empty = the model's own default).
    "EFFORT": env("AI_ASSISTANT_EFFORT", default=AI_PROVIDER_DEFAULTS[_ai_provider]["effort"]),
    # Longest answer a model call may write (thinking included).
    "MAX_TOKENS": env.int("AI_ASSISTANT_MAX_TOKENS", default=16000),
    # Claude only: when a safety classifier declines a request, the Claude API re-runs it on
    # Anthropic's recommended fallback model instead of refusing.
    "FALLBACKS": env.bool("AI_ASSISTANT_FALLBACKS", default=True),
    # Seconds one answer may take in total, every model call and tool round included.
    "TIMEOUT": env.int("AI_ASSISTANT_TIMEOUT", default=90),
    # Cost control: how long a question may be, how many earlier messages go to the model with a
    # new question, and how many messages (questions + answers) one conversation holds.
    "MAX_QUESTION_LENGTH": env.int("AI_ASSISTANT_MAX_QUESTION_LENGTH", default=1000),
    "HISTORY_MESSAGES": env.int("AI_ASSISTANT_HISTORY_MESSAGES", default=20),
    "MAX_MESSAGES": env.int("AI_ASSISTANT_MAX_MESSAGES", default=50),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    # A separate key can be rotated (signing everyone out) without touching SECRET_KEY.
    "SIGNING_KEY": env("JWT_SIGNING_KEY", default=SECRET_KEY),
    # Tokens name who issued them and for which API; tokens of another system signed with
    # the same key are refused.
    "ISSUER": "wallex",
    "AUDIENCE": "wallex-api",
}
