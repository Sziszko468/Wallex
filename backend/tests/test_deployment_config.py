"""Security audit — production configuration, secrets and the container image.

Production settings are imported in a separate process with a controlled
environment, so the checks see exactly what a real deployment would.
"""

import os
import re
import subprocess
import sys
from pathlib import Path

import pytest
from django.conf import settings

BACKEND_DIR = Path(settings.BASE_DIR)

VALID_PROD_ENV = {
    "DJANGO_SETTINGS_MODULE": "config.settings.prod",
    "DJANGO_ALLOWED_HOSTS": "api.spendly.example",
    "DJANGO_SECRET_KEY": "q3v!8Zp@1Lw#9Rm$4Tx%7Ky^2Ns&6Hd*0Fb(5Gc)8Jv+3Qe=1Wa-9Ur_7Io~4Pz",
    "CORS_ALLOWED_ORIGINS": "https://app.spendly.example",
    "DJANGO_DEBUG": "True",  # must be ignored in production
}


def _run(code: str, **env_overrides) -> subprocess.CompletedProcess:
    env = {**os.environ, **VALID_PROD_ENV, **env_overrides}
    return subprocess.run(
        [sys.executable, "-c", code], cwd=BACKEND_DIR, env=env, capture_output=True, text=True, timeout=60
    )


def _import_prod(**env_overrides):
    return _run("import config.settings.prod", **env_overrides)


def _run_without(names: set[str], code: str) -> subprocess.CompletedProcess:
    """Run with the given variables unset everywhere — including the local .env file."""
    env = {key: value for key, value in {**os.environ, **VALID_PROD_ENV}.items() if key not in names}
    return subprocess.run(
        [sys.executable, "-c", "import environ; environ.Env.read_env = lambda *a, **k: None;" + code],
        cwd=BACKEND_DIR, env=env, capture_output=True, text=True, timeout=60,
    )


def test_valid_production_settings_load_with_secure_defaults():
    result = _run(
        "import config.settings.prod as s;"
        "print(s.DEBUG, s.SESSION_COOKIE_SECURE, s.CSRF_COOKIE_SECURE, s.SECURE_SSL_REDIRECT,"
        " s.SECURE_HSTS_SECONDS > 0, s.X_FRAME_OPTIONS, s.SECURE_CONTENT_TYPE_NOSNIFF,"
        " s.SECURE_REFERRER_POLICY, getattr(s, 'CORS_ALLOW_ALL_ORIGINS', False),"
        " getattr(s, 'CORS_ALLOW_CREDENTIALS', False))"
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.split() == [
        "False", "True", "True", "True", "True", "DENY", "True", "same-origin", "False", "False",
    ]


def test_django_deployment_checks_pass():
    result = _run(
        "import django, sys; django.setup();"
        "from django.core.management import call_command;"
        "call_command('check', deploy=True, fail_level='WARNING')"
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("hosts", ["*", ""])
def test_production_refuses_wildcard_or_missing_allowed_hosts(hosts):
    result = _import_prod(DJANGO_ALLOWED_HOSTS=hosts)
    assert result.returncode != 0
    assert "DJANGO_ALLOWED_HOSTS" in result.stderr


@pytest.mark.parametrize("secret", ["change-me-to-a-random-value", "short", "django-insecure-" + "x" * 60])
def test_production_refuses_a_weak_or_placeholder_secret_key(secret):
    result = _import_prod(DJANGO_SECRET_KEY=secret)
    assert result.returncode != 0
    assert "DJANGO_SECRET_KEY" in result.stderr


def test_production_refuses_plain_http_cors_origins():
    result = _import_prod(CORS_ALLOWED_ORIGINS="http://app.spendly.example")
    assert result.returncode != 0
    assert "CORS_ALLOWED_ORIGINS" in result.stderr


def test_missing_secret_key_fails_instead_of_falling_back_to_a_default():
    result = _run_without({"DJANGO_SECRET_KEY"}, "import config.settings.prod")
    assert result.returncode != 0
    assert "DJANGO_SECRET_KEY" in result.stderr


@pytest.mark.parametrize("key", ["", "short", "change-me-" + "x" * 60])
def test_production_refuses_a_weak_jwt_signing_key(key):
    result = _import_prod(JWT_SIGNING_KEY=key)
    assert result.returncode != 0
    assert "JWT_SIGNING_KEY" in result.stderr


def test_production_needs_no_cors_origins_by_default():
    """Same-origin deployment (the web image proxies /api/): no cross-origin access at all."""
    result = _run_without({"CORS_ALLOWED_ORIGINS"}, "import config.settings.prod as s; print(s.CORS_ALLOWED_ORIGINS)")
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "[]"


def test_only_postgresql_is_accepted():
    result = _import_prod(DATABASE_URL="sqlite:////tmp/spendly.sqlite3")
    assert result.returncode != 0
    assert "PostgreSQL" in result.stderr


def test_a_managed_database_url_is_used_with_its_ssl_mode():
    result = _run(
        "import config.settings.prod as s; d = s.DATABASES['default'];"
        "print(d['HOST'], d['NAME'], d['OPTIONS']['sslmode'], d['CONN_MAX_AGE'], d['CONN_HEALTH_CHECKS'])",
        DATABASE_URL="postgres://spendly:pw@db.example.com:5432/spendly?sslmode=require",
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.split() == ["db.example.com", "spendly", "require", "60", "True"]


def test_static_files_are_served_by_whitenoise_right_after_the_security_middleware():
    result = _run(
        "import config.settings.prod as s; m = s.MIDDLEWARE;"
        "print(m.index('whitenoise.middleware.WhiteNoiseMiddleware')"
        " - m.index('django.middleware.security.SecurityMiddleware'), s.STORAGES['staticfiles']['BACKEND'])"
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.split() == ["1", "whitenoise.storage.CompressedManifestStaticFilesStorage"]


def test_rate_limit_counters_use_a_cache_shared_by_every_worker():
    result = _run_without(
        {"CACHE_URL"},
        "import config.settings.prod as s; c = s.CACHES['default']; print(c['BACKEND'], c['LOCATION'])",
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.split() == ["django.core.cache.backends.db.DatabaseCache", "spendly_cache"]


def test_production_api_renders_json_only_and_keeps_the_other_defaults():
    result = _run(
        "import config.settings.prod as s; r = s.REST_FRAMEWORK;"
        "print(r['DEFAULT_RENDERER_CLASSES'], r['DEFAULT_PERMISSION_CLASSES'])"
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == (
        "('rest_framework.renderers.JSONRenderer',) ('rest_framework.permissions.IsAuthenticated',)"
    )


def test_production_logs_go_to_stdout():
    result = _run(
        "import config.settings.prod as s; l = s.LOGGING;"
        "print(l['root']['handlers'], l['handlers']['console']['class'])"
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "['console'] logging.StreamHandler"


def test_api_docs_are_opt_in_in_production():
    code = (
        "import django; django.setup(); from django.conf import settings; from django.test import Client;"
        "c = Client(HTTP_HOST='api.spendly.example');"
        "print(settings.API_DOCS_ENABLED, c.get('/api/docs/', secure=True).status_code,"
        " c.get('/api/schema/', secure=True).status_code)"
    )
    # Rate limiting touches the cache; the production database cache table only exists after
    # `createcachetable`, which this throwaway process doesn't run.
    disabled = _run_without({"API_DOCS_ENABLED"}, code)
    enabled = _run(code, API_DOCS_ENABLED="True", CACHE_URL="locmemcache://")

    assert disabled.returncode == 0, disabled.stderr
    assert disabled.stdout.split() == ["False", "404", "404"]
    assert enabled.returncode == 0, enabled.stderr
    assert enabled.stdout.split() == ["True", "200", "200"]


def test_health_probes_skip_the_https_redirect_but_the_api_does_not():
    """Docker and load-balancer probes speak plain HTTP to the container."""
    result = _run(
        "import django; django.setup(); from django.test import Client; c = Client(HTTP_HOST='api.spendly.example');"
        "print(c.get('/api/health/').status_code, c.get('/api/transactions/').status_code)"
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.split() == ["200", "301"]


SECRET_ASSIGNMENT = re.compile(
    r"^\s*[\"']?(\w*(?:SECRET|PASSWORD|TOKEN|SIGNING_KEY|API_KEY)\w*)[\"']?\s*[:=]\s*[\"']([^\"']+)[\"']", re.M
)
# Dotted import paths (e.g. a serializer class) are configuration, not secrets.
IMPORT_PATH = re.compile(r"^[a-z_][\w]*(\.[\w]+)+$")


@pytest.mark.parametrize("path", sorted((BACKEND_DIR / "config").rglob("*.py")), ids=lambda p: p.name)
def test_no_hardcoded_secrets_in_configuration(path):
    """Secrets come from the environment only — never as string literals in settings."""
    literals = [
        (name, value)
        for name, value in SECRET_ASSIGNMENT.findall(path.read_text(encoding="utf-8"))
        if not IMPORT_PATH.match(value)
    ]
    assert literals == []


@pytest.mark.parametrize("target", ["dev", "prod"])
def test_every_image_runs_as_an_unprivileged_user(target):
    dockerfile = (BACKEND_DIR / "Dockerfile").read_text(encoding="utf-8")
    stages = dict(re.findall(r"^FROM\s+\S+\s+AS\s+(\w+)\n(.*?)(?=^FROM\s|\Z)", dockerfile, re.M | re.S))
    users = re.findall(r"^USER\s+(\S+)", stages[target], re.M)
    assert users, f"the {target} image must switch away from root"
    assert users[-1] not in ("root", "0")


def test_production_dependencies_exclude_test_tools():
    runtime = (BACKEND_DIR / "requirements.txt").read_text(encoding="utf-8").lower()
    assert "pytest" not in runtime


def test_env_files_are_not_committed():
    gitignore = (BACKEND_DIR.parent / ".gitignore")
    if not gitignore.exists():  # the backend container only mounts backend/
        pytest.skip("repository root not available in this environment")
    assert re.search(r"^\.env$", gitignore.read_text(encoding="utf-8"), re.M)
