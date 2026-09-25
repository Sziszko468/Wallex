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
    env = {key: value for key, value in os.environ.items() if key != "DJANGO_SECRET_KEY"}
    env.update({k: v for k, v in VALID_PROD_ENV.items() if k != "DJANGO_SECRET_KEY"})
    # Point at an empty .env so the local one can't supply the value.
    result = subprocess.run(
        [sys.executable, "-c", "import environ; environ.Env.read_env = lambda *a, **k: None; import config.settings.prod"],
        cwd=BACKEND_DIR, env=env, capture_output=True, text=True, timeout=60,
    )
    assert result.returncode != 0
    assert "DJANGO_SECRET_KEY" in result.stderr


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


def test_container_runs_as_an_unprivileged_user():
    dockerfile = (BACKEND_DIR / "Dockerfile").read_text(encoding="utf-8")
    users = re.findall(r"^USER\s+(\S+)", dockerfile, re.M)
    assert users, "Dockerfile must switch away from root"
    assert users[-1] not in ("root", "0")


def test_env_files_are_not_committed():
    gitignore = (BACKEND_DIR.parent / ".gitignore")
    if not gitignore.exists():  # the backend container only mounts backend/
        pytest.skip("repository root not available in this environment")
    assert re.search(r"^\.env$", gitignore.read_text(encoding="utf-8"), re.M)
