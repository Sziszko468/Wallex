"""Imported first by prod.py: is everything the settings cannot be read without actually set?

base.py raises at the first missing variable, so a first deployment would find them one redeploy
at a time. Looking first lets the platform's log name everything that is missing in one message.
"""

import os
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

environ.Env.read_env(Path(__file__).resolve().parent.parent.parent / ".env")

DATABASE_PARTS = ("POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD")

missing = [name for name in ("DJANGO_SECRET_KEY",) if not os.environ.get(name)]
if not os.environ.get("DATABASE_URL") and not all(os.environ.get(name) for name in DATABASE_PARTS):
    missing.append(f"DATABASE_URL (or {', '.join(DATABASE_PARTS[:-1])} and {DATABASE_PARTS[-1]})")
if missing:
    raise ImproperlyConfigured(
        "Required environment variables are not set: " + ", ".join(missing) + ". See docs/deployment.md."
    )
