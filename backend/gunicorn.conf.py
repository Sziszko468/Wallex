"""Gunicorn settings for the production image. Every value can be tuned through env vars."""

import os

# Cloud platforms (Cloud Run, Render, Railway, Fly.io…) tell the container which port to use.
bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"

# Each worker is a separate process with its own Django + DB connection (~100 MB RAM).
# Rule of thumb: 2 × CPU cores + 1, capped by the memory the instance has.
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))

# Threads per worker (gthread): while one request waits on the network — an AI assistant
# answer waits several seconds for the language model — the others keep being served.
threads = int(os.environ.get("GUNICORN_THREADS", "4"))

# Receipt OCR on a large photo can take several seconds; everything else is milliseconds.
# (With threads this is the worker's heartbeat; nginx's proxy_read_timeout bounds a request.)
timeout = int(os.environ.get("GUNICORN_TIMEOUT", "60"))
graceful_timeout = 30
keepalive = 5

# Recycle workers now and then, so slow memory growth (e.g. from image processing)
# can never take the container down. The jitter keeps them from restarting together.
max_requests = 1000
max_requests_jitter = 100

# Heartbeat files on tmpfs: a slow container disk can't make workers look frozen.
worker_tmp_dir = "/dev/shm"

# Logs go to stdout/stderr, where Docker and cloud platforms collect them.
accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("GUNICORN_LOG_LEVEL", "info")
