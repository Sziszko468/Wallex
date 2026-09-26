# syntax=docker/dockerfile:1

# ---- base: runtime shared by the dev and production images ---------------------------
FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Tesseract is the OCR engine for receipt scanning (English + Hungarian language data).
# psycopg[binary] and Pillow ship prebuilt wheels, so no compiler or libpq-dev is needed.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr tesseract-ocr-eng tesseract-ocr-hun \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

# Never run the app as root: a compromised process can't touch the rest of the image.
RUN useradd --create-home --uid 1000 spendly


# ---- dev: docker-compose.yml (bind-mounted source, auto-reload, test tools) ----------
FROM base AS dev

COPY requirements-dev.txt .
RUN pip install -r requirements-dev.txt

COPY --chown=spendly . .
USER spendly

EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]


# ---- prod: the deployable image (default target) ---------------------------------------
FROM base AS prod

ENV DJANGO_SETTINGS_MODULE=config.settings.prod \
    PORT=8000

# Code stays owned by root: the app user can read it but never modify it.
COPY . .

# Bake the admin's static files into the image (served by WhiteNoise). Importing the
# production settings requires real-looking values; collectstatic never opens a database
# connection, and the throwaway key only lives for this one command.
RUN DJANGO_SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(64))')" \
    DJANGO_ALLOWED_HOSTS=build.invalid \
    POSTGRES_DB=unused POSTGRES_USER=unused POSTGRES_PASSWORD=unused \
    python manage.py collectstatic --noinput

USER spendly

EXPOSE 8000
CMD ["gunicorn", "--config", "gunicorn.conf.py", "config.wsgi:application"]
