# Spendly — deployment guide

How Spendly runs in production: which containers exist, how they are configured, and how
to ship the backend, the web app and the mobile app.

## 1. Topology

```
 Browser ─┐                      ┌──────────── docker-compose.prod.yml ────────────┐
          │ HTTPS                │                                                  │
 Mobile ──┼──► TLS terminator ──►│ web  (nginx :8080)                               │
 app      │   (load balancer,    │   /            → React build (SPA)               │
          │    Caddy, platform)  │   /api/ /admin/ /static/ → backend               │
          │                      │                                                  │
          │                      │ backend (gunicorn :8000, Django)  ◄── migrate    │
          │                      │   │                                  (one-off)   │
          │                      │ postgres (16, volume)                            │
          │                      └──────────────────────────────────────────────────┘
```

- **One public origin.** The web container serves the React app and proxies `/api/`,
  `/admin/` and `/static/` to Django. The browser only ever talks to its own origin:
  no CORS and one TLS certificate. The mobile app calls the same `https://<host>/api/`.
- **Only the web container publishes a port.** Postgres and the backend are reachable
  only inside the compose network.
- **TLS is terminated in front of the web container.** Nginx listens on plain HTTP 8080.
  Put a load balancer, Caddy or your platform's HTTPS router in front of it, and have
  it set `X-Forwarded-Proto`. Never expose port 8080 to the internet without TLS.
- **The mobile app is not a container.** It is built separately with EAS (section 10).

| File | Purpose |
|---|---|
| `docker-compose.yml` | **Development**: runserver with auto-reload, bind-mounted code, Postgres on `127.0.0.1:5433` |
| `docker-compose.prod.yml` | **Production-like**: `postgres`, `migrate` (one-off), `backend`, `web` |
| `.env.prod.example` | Every production variable, copied to `.env.prod` (gitignored) |
| `backend/Dockerfile` | Multi-stage: `dev` target (test tools, runserver) and `prod` target (default: gunicorn, static files baked in) |
| `backend/gunicorn.conf.py` | Workers, timeouts and logging, all tunable via env vars |
| `backend/config/settings/prod.py` | Production settings; refuses to start with an unsafe configuration |
| `backend/scripts/healthcheck.py` | Container health check (HTTP request to the readiness probe) |
| `web/Dockerfile` | Node build stage + unprivileged nginx runtime |
| `web/nginx/default.conf.template` | SPA routing, API proxy, caching, upload limit |
| `web/nginx/security-headers.conf` | `frame-ancestors`, HSTS, nosniff… for the SPA's responses |
| `mobile/eas.json` | EAS Build profiles (`preview`, `production`) |

## 2. Quick start: the production-like stack on your machine

```bash
cp .env.prod.example .env.prod
```

Fill in `.env.prod`:

- `DJANGO_SECRET_KEY` and `POSTGRES_PASSWORD`: generate each with
  `python -c "import secrets; print(secrets.token_urlsafe(64))"`.
- For a local trial over plain HTTP, also set `DJANGO_ALLOWED_HOSTS=localhost` and
  `DJANGO_SECURE_SSL_REDIRECT=False`.

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
```

Open <http://localhost:8080>. All services should show `healthy`, and `migrate` should
show `Exited (0)`. Create an admin account if you need one:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```

This stack runs next to the development stack: it has its own project name
(`spendly-prod`), its own database volume and no overlapping ports.

`--env-file .env.prod` is required on every command. Compose fills in `${POSTGRES_*}`
and `${VITE_API_BASE_URL}` from it, and a missing value stops with a clear error.

## 3. Environment variables

### Backend (Django + gunicorn)

Required variables are **bold**. Everything else has a safe default.

| Variable | Default | Notes |
|---|---|---|
| **`DJANGO_SECRET_KEY`** | — | 50+ random chars. Placeholders, `django-insecure…` or short keys stop the app at startup. |
| **`DJANGO_ALLOWED_HOSTS`** | — | Public host name(s), comma-separated. `*` or an empty value stops the app. The first entry is also used by the container health check. |
| **`FIELD_ENCRYPTION_KEY`** | — | 50+ random chars, **different from** `DJANGO_SECRET_KEY`. Encrypts two-factor secrets and keys the recovery-code hashes. Missing, short or equal to the secret key stops the app. Losing it turns 2FA off for everyone (they set it up again); keep it with your other secrets. |
| **`POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD`** | — | Shared with the postgres container. |
| `POSTGRES_HOST` / `POSTGRES_PORT` | `localhost` / `5432` | `postgres` inside `docker-compose.prod.yml`. |
| `POSTGRES_SSLMODE` | `prefer` | Use `require` (or stricter) for a database reached over a network you don't control. |
| `DATABASE_URL` | — | Overrides all `POSTGRES_*` variables (for managed databases). Only `postgres://` is accepted; anything else, e.g. SQLite, stops the app. |
| `DJANGO_DB_CONN_MAX_AGE` | `60` | Seconds a DB connection is reused. Each connection is health-checked before reuse. |
| `DJANGO_SECURE_SSL_REDIRECT` | `True` | Redirects HTTP → HTTPS. `False` only for a local HTTP trial. |
| `DJANGO_BEHIND_TLS_PROXY` | `False` | `True` when the proxy in front always sets `X-Forwarded-Proto`. This is always the case with the web container. |
| `DRF_NUM_PROXIES` | `0` | Number of proxies between the client and Django, used to find the real client IP for rate limiting. `1` behind the web container, `2` with a load balancer in front of that. |
| `CORS_ALLOWED_ORIGINS` | *(none)* | Only for a web front end on **another** domain. `https://` origins only (section 8). |
| `CSRF_TRUSTED_ORIGINS` | *(none)* | Only if the Django admin is used through a different origin than its own host. |
| `JWT_SIGNING_KEY` | `DJANGO_SECRET_KEY` | Optional separate key; rotating it signs everyone out. If set, it must also be 50+ chars. An **empty** value would disable signing security, so it stops the app. |
| `AUTH_COOKIE_SECURE` | `True` | The web app's refresh-token cookie (HttpOnly, SameSite=Strict, path `/api/auth/`) is sent over HTTPS only. Turning it off stops the app in production. |
| `DJANGO_ADMIN_ENABLED` / `DJANGO_ADMIN_URL` | `False` / `admin/` | The Django admin signs in with a password only (no 2FA, no lockout), so it is off in production. Enable it only behind a VPN or IP allow-list, preferably at a path of your own. |
| `AUTH_MFA_RATE`, `AUTH_SENSITIVE_RATE` | `10/minute`, `20/hour` | Two-factor codes at sign-in (per IP); password change and 2FA changes (per user). |
| `CACHE_URL` | `dbcache://spendly_cache` | Cache for rate-limit counters, shared by all workers. Use `redis://…` for high traffic (needs the `redis` package). |
| `DJANGO_LOG_LEVEL` | `INFO` | All logs go to stdout. |
| `WEB_CONCURRENCY` | `2` | gunicorn worker processes, about 100 MB RAM each. |
| `GUNICORN_THREADS` | `4` | Threads per worker: a request waiting on the network (an AI assistant answer waits seconds for the model) doesn't block the others. |
| `GUNICORN_TIMEOUT` | `60` | Worker heartbeat timeout. With threads, nginx's `proxy_read_timeout` bounds a request (90 s; 150 s for `/api/assistant/`). |
| `PORT` | `8000` | Listening port. Platforms like Cloud Run or Render set it themselves. |
| `API_USER_RATE`, `AUTH_LOGIN_RATE`, `AUTH_REGISTER_RATE`, `AUTH_REFRESH_RATE`, `RECEIPT_SCAN_RATE` | see `.env.prod.example` | DRF rate format `N/second\|minute\|hour\|day`. |
| `RECEIPT_OCR_PROVIDER`, `RECEIPT_OCR_LANGUAGES` | Tesseract, `hun+eng` | The OCR engine is swappable (see `apps/receipts/ocr`). |
| `EXPO_PUSH_ACCESS_TOKEN` | *(none)* | Only if "Enhanced push security" is enabled in the Expo dashboard. |
| `ANTHROPIC_API_KEY` | *(none)* | Turns the AI finance assistant on (Claude API). A secret: store it in the platform's secret manager. Without it the assistant answers `503 assistant_not_configured` and the apps show that it isn't set up. |
| `AI_ASSISTANT_MODEL`, `AI_ASSISTANT_EFFORT` | `claude-opus-5`, `medium` | Model and thinking effort. Raise the effort if answers fall short; lower it for speed and cost. |
| `AI_ASSISTANT_TIMEOUT`, `ASSISTANT_RATE` | `90`, `30/hour` | Seconds one answer may take in total; questions per user. Every question is a paid model call. |
| `AI_ASSISTANT_FALLBACKS` | `True` | When a safety classifier declines a request, the Claude API re-runs it on Anthropic's recommended fallback model (beta `fallbacks: "default"`). |
| `API_DOCS_ENABLED` | `False` (prod), `True` (dev) | Serves Swagger UI at `/api/docs/` and the OpenAPI schema at `/api/schema/`. Both are public when enabled, so turn them on deliberately. The committed `backend/openapi.yaml` is always available. |

`DJANGO_SETTINGS_MODULE=config.settings.prod` is set inside the production image.

### Web image (build argument and runtime)

| Variable | When | Default | Notes |
|---|---|---|---|
| `VITE_API_BASE_URL` | **build** (`--build-arg`) | `/api` | Baked into the JavaScript bundle. `/api` = same origin through nginx; an absolute URL = API on another domain (then set `CORS_ALLOWED_ORIGINS`). Changing it requires a rebuild. |
| `API_UPSTREAM` | runtime | `http://backend:8000` | Where nginx proxies `/api/`, `/admin/` and `/static/`. On a cloud platform, this is the backend's internal address. |
| `WEB_PORT` | compose only | `8080` | Published host port. |
| `SPENDLY_IMAGE_TAG` | compose only | `latest` | Tag for `spendly-backend` and `spendly-web`, e.g. a git SHA. |

### Mobile (EAS)

| Variable | Where | Notes |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | EAS environment variable (`preview`, `production`) | `https://<host>/api`. Release builds refuse non-https URLs at startup, so every request carries its token over TLS. |

## 4. Database setup

**In `docker-compose.prod.yml`:** Postgres 16 runs with a named volume
(`spendly-prod_postgres_data`). It publishes no port and has a `pg_isready` health check.
The volume survives `down` and is only removed by `down -v`.

**Managed database** (recommended for real data: automatic backups, point-in-time restore):

1. Create a PostgreSQL 16 database and a dedicated user that owns it.
2. Set `DATABASE_URL=postgres://user:password@host:5432/spendly?sslmode=require`.
3. Remove the `postgres` service and its `depends_on` from your deployment, or simply
   don't deploy it on a platform that runs the backend alone.

**Backups** of the compose database: take a daily dump and store it off the machine.

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > spendly-$(date +%F).dump
```

Restore into an empty database with `pg_restore --clean --if-exists -d <db> <file>`.
Practice a restore once; an untested backup is not a backup.

## 5. Migrations

Migrations are a **release step**. They do not run when a backend container starts,
because several replicas starting at once would all try to migrate.

- **Compose:** the one-off `migrate` service runs `migrate --noinput` and then
  `createcachetable` (the rate-limit cache table). The backend only starts after it
  exits with code 0, so a failed migration stops the deploy while the old containers
  keep running. Both commands are idempotent.
- **Cloud platforms:** use the platform's release or pre-deploy command with the same
  image. Examples: Render "Pre-Deploy Command", Fly.io `release_command`, a Cloud Run job.
  The command is:
  ```bash
  python manage.py migrate --noinput && python manage.py createcachetable
  ```
- **Manually:**
  `docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm migrate`.

Rules for writing migrations that deploy safely:

- Old and new code must both work with the migrated schema while the deploy is in progress.
- Add columns as nullable (or with a default) first, backfill, then tighten.
- Drop columns only one release after the code stopped using them.
- Keep data migrations in their own migration files.
- Before every commit, `python manage.py makemigrations --check` must report no changes.

## 6. Static files

There are two different kinds:

| What | Built | Served by | Caching |
|---|---|---|---|
| React app (`web/dist`) | `npm run build` in the web image | nginx | `/assets/*` (hashed names): 1 year, `immutable`. `index.html` and routes: `no-cache`, so a deploy is picked up immediately. |
| Django admin CSS/JS | `collectstatic` while building the backend image | WhiteNoise inside gunicorn | Hashed names: 10 years, `immutable`, gzip. |

- **WhiteNoise** lets the backend image serve its own static files anywhere, with no
  shared volume or separate file server.
- **`collectstatic` runs at build time,** so every container of one image version serves
  identical files.
- **`STATIC_ROOT` is `backend/staticfiles/`,** which is gitignored and dockerignored.
- **Nothing is uploaded or stored:** receipt photos are processed in memory and CSV
  imports are parsed on the fly. There is no `MEDIA_ROOT` and no media volume.

## 7. Health checks

| Endpoint | Checks | Use it for |
|---|---|---|
| `GET /healthz` (web) | nginx answers | Liveness of the web container |
| `GET /api/health/` | Django answers, **no** dependencies | Liveness: restart the backend if it fails |
| `GET /api/health/ready/` | Database query + cache read | Readiness: stop routing traffic if it fails. Returns `503` with `{"status": "error", "checks": {…}}`. The reason is only in the server log. |

All three are public and unthrottled, and they ignore any `Authorization` header.
Probes use plain HTTP, so `/api/health/` is exempt from the HTTPS redirect.

- **Compose:** `postgres` uses `pg_isready`, `backend` runs `scripts/healthcheck.py`
  (readiness over HTTP) and `web` fetches `/healthz`. Start order:
  postgres → migrate → backend → web.
- **Cloud platforms:** configure the HTTP health check path as `/api/health/ready/`
  (readiness) or `/api/health/` (liveness).
- **Host header pitfall:** Django answers 400 to a Host header that is not in
  `DJANGO_ALLOWED_HOSTS`. That includes a load balancer probing an internal IP address.
  Either the probe sends the public host name, or you add that host to
  `DJANGO_ALLOWED_HOSTS`. `scripts/healthcheck.py` already sends the first allowed host.

## 8. CORS

- **Same origin (default).** The web container proxies `/api/`, so the SPA calls `/api/…`
  on its own origin. Leave `CORS_ALLOWED_ORIGINS` unset: production defaults to no
  cross-origin access at all.
- **Web on another domain** (e.g. static hosting at `https://app.example.com`, API at
  `https://api.example.com`):
  - build the web app with `VITE_API_BASE_URL=https://api.example.com/api`,
  - set `CORS_ALLOWED_ORIGINS=https://app.example.com` on the backend (https only),
  - the web app's CSP then automatically adds that API origin to `connect-src`.
- **Mobile apps are never subject to CORS.** CORS is enforced by browsers only.
- **CSRF:** the API uses bearer tokens, not cookies, so CSRF does not apply to it. The
  Django admin uses cookies. It works on its own origin behind the proxy, because the
  proxy passes the Host header and `X-Forwarded-Proto` through. Set
  `CSRF_TRUSTED_ORIGINS` only if the admin is reached through a different host name.

## 9. Deployment steps

### A. A single server (VPS) with Docker Compose

1. Install Docker and a TLS reverse proxy on the server, e.g. Caddy with automatic
   Let's Encrypt, forwarding `spendly.example.com` to `localhost:8080`. Point DNS at
   the server.
2. Clone the repository, then `cp .env.prod.example .env.prod`. Fill it in with real
   secrets, `DJANGO_ALLOWED_HOSTS=spendly.example.com`, `DJANGO_SECURE_SSL_REDIRECT=True`,
   `DJANGO_BEHIND_TLS_PROXY=True` and `DRF_NUM_PROXIES=2` (Caddy + nginx).
3. Publish the web container on localhost only: set `WEB_PORT=127.0.0.1:8080`, so
   port 8080 is never reachable from the internet.
4. Start the stack:
   `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build`.
5. Verify: `https://spendly.example.com/api/health/ready/` returns `{"status":"ok",…}`,
   and the app loads and logs in.
6. Schedule the jobs (section 11) and the database backup (section 4).
7. **Updates:** `git pull`, then the same `up -d --build`. `migrate` runs first; if it
   fails, the old backend keeps serving.

### B. A cloud container platform (Cloud Run, Render, Fly.io, Railway, ECS…)

1. **Build and push the images** to a registry (tag them with the git SHA, not only `latest`):
   ```bash
   docker build -t <registry>/spendly-backend:<sha> backend
   docker build -t <registry>/spendly-web:<sha> web
   docker push <registry>/spendly-backend:<sha>
   docker push <registry>/spendly-web:<sha>
   ```
2. **Database:** create a managed PostgreSQL database (section 4) and put its
   `DATABASE_URL` into the platform's secret store, not into the image.
3. **Backend service:**
   - use the `spendly-backend` image and set the variables from section 3,
   - release command: `python manage.py migrate --noinput && python manage.py createcachetable`,
   - health check path: `/api/health/ready/`,
   - keep it private (internal networking) if the platform allows it.
4. **Web service:**
   - use the `spendly-web` image with `API_UPSTREAM` set to the backend's internal URL,
   - expose it publicly on HTTPS with your domain,
   - health check path: `/healthz`.

   Alternative: skip the web image and upload `web/dist` (built with an absolute
   `VITE_API_BASE_URL`) to static hosting. Then configure CORS (section 8), and set the
   SPA fallback and the `frame-ancestors 'none'` header on that host.
5. **Scheduled job:** see section 11.
6. **Smoke test:** readiness endpoint, log in, create a transaction, check that the
   dashboard shows it.

### C. Rollback

Redeploy the previous image tag. A rollback is only safe if the migrations were
backward-compatible (section 5). Otherwise restore the database backup taken before
the release.

## 10. Mobile app (EAS Build)

The mobile app is not part of the Docker stack. It is built and shipped with EAS. The
full guide is [mobile-release.md](mobile-release.md): build variants, development /
preview / production builds, App Store and Google Play submission, push credentials.

What connects it to this deployment:

- **API URL:** the app's only build-time setting is `EXPO_PUBLIC_API_BASE_URL`, which
  must be the public **https** origin of this stack plus `/api`
  (e.g. `https://spendly.example.com/api`). Set it per EAS environment. A `preview` or
  `production` build without a valid https URL fails at build time.
- **No CORS needed:** native apps are not browsers.
- **Backend first:** deploy the backend before building. Store reviewers need a working
  backend and a demo account.

## 11. Scheduled jobs

`python manage.py send_scheduled_notifications` must run **every hour**. It:

- runs the scheduled notification rules for every active user: subscription and recurring
  payment reminders, unusual spending, the monthly summary (days 1–7) and important insights,
- retries failed push deliveries.

It is idempotent, so a missed or doubled run is harmless.

- **Server with compose** (host crontab):
  ```
  0 * * * * cd /srv/spendly && docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T backend python manage.py send_scheduled_notifications
  ```
- **Cloud:** use the platform's cron job feature (Render Cron Job, Cloud Scheduler +
  Cloud Run job, Fly Machines schedule) with the backend image and the same environment.

### Security records

`python manage.py prune_security_data` should run **once a day**. It enforces retention:
audit events after 365 days (sign-in attempts for addresses without an account after 30),
ended sessions after 90 days, and expired JWT bookkeeping rows.

```
15 3 * * * cd /srv/spendly && docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T backend python manage.py prune_security_data
```

### Exchange rates

`python manage.py fetch_exchange_rates` downloads the ECB euro reference rates (free, no
key; published around 16:00 CET on working days) for EUR, HUF, USD, GBP, JPY and CHF.
Foreign-currency transactions and base-currency changes need a rate of at most 7 days
before their date, so:

- **once, after the first deploy:** `python manage.py fetch_exchange_rates --period all`
  (the whole history since 1999, about 35,000 rows, ~10 s);
- **every day, after 16:00 CET:**
  ```
  30 17 * * * cd /srv/spendly && docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T backend python manage.py fetch_exchange_rates
  ```

It is idempotent (existing rates are updated, never duplicated). If it stops running,
new foreign-currency transactions are refused with a clear `400` after a week instead of
silently using an old rate.

## 12. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Backend exits at startup with `ImproperlyConfigured` | `prod.py` rejected the configuration. The message names the variable: weak secret key, `*` in allowed hosts, http CORS origin, empty JWT key or a non-Postgres `DATABASE_URL`. |
| Every API call redirects to `https://…` locally | `DJANGO_SECURE_SSL_REDIRECT=True` on plain HTTP. Set it to `False` for a local trial. |
| Redirect loop behind a load balancer | `DJANGO_BEHIND_TLS_PROXY` is not `True`, or the load balancer doesn't send `X-Forwarded-Proto`. |
| `400 Bad Request` from Django | The Host header is not in `DJANGO_ALLOWED_HOSTS`. Health checks from internal IPs cause this too (section 7). |
| Backend `unhealthy`, readiness shows `"cache": "error"` | `createcachetable` did not run. Run the release step. |
| `502 Bad Gateway` from the web container | The backend is down or unhealthy (`docker compose … logs backend`), or `API_UPSTREAM` is wrong. |
| `413` with an HTML body on upload | Larger than nginx's 12 MB limit. Django returns its own JSON 413 above 10 MB for receipts and 2 MB for CSV. |
| Everyone shares one rate limit / limits ignore the client | `DRF_NUM_PROXIES` doesn't match the number of proxies in front of Django. |
| Web app calls `localhost:8000` in production | The image was built with the wrong `VITE_API_BASE_URL`. It is a build-time value, so rebuild. |
| `.env.prod` shows up in `git status` | It must not. The root `.gitignore` ignores `.env.*` except `*.example`. |
