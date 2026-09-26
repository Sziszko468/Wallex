# Spendly — security audit (2026-09-25)

Scope: Django/DRF backend, JWT auth, PostgreSQL, Docker, React web client, React
Native/Expo mobile client. Method: configuration and code review of every area below,
then **each finding reproduced with a failing test before it was fixed**. All tests now
pass: backend 449, web 33, mobile 68.

## Findings and fixes

| # | Severity | Area | Finding | Fix | Test |
|---|---|---|---|---|---|
| 1 | **High** | Rate limiting / auth | No brute-force protection: unlimited login, registration and refresh attempts. | Scoped DRF throttles: login 10/min, register 10/h, refresh 30/min per IP; 2000/h ceiling per authenticated user. | `tests/test_auth_security.py` (`…rate_limited`, `…has_a_ceiling`) |
| 2 | **High** | Rate limiting | With `NUM_PROXIES` unset, DRF identifies clients by the raw `X-Forwarded-For` header — an attacker rotates it to bypass any limit. | `NUM_PROXIES` from env, default 0 (socket address). | `test_spoofed_forwarded_for_header_does_not_reset_the_login_limit` |
| 3 | **High** | Dependencies | Django 5.1.4 — the 5.1 series no longer receives security fixes. | Upgraded to Django **5.2.17 LTS** (supported to 2028), DRF 3.18.1, django-filter 26.1. | full suite (449) on the new versions |
| 4 | **High** | Authorization | *(found in the testing step)* `POST /auth/logout/` blacklisted **any** refresh token — user A could end user B's session. | Token's `user_id` must equal the caller. | `apps/users/tests.py::test_cannot_log_out_another_users_session` |
| 5 | Medium | JWT | Refresh with a token of a **deleted** user → 500 (simplejwt `.get()`). | `SafeTokenRefreshSerializer` → 401. | `test_refresh_for_a_deleted_user_is_rejected_not_a_server_error` |
| 6 | Medium | Authentication | Emails were case-sensitive: `Anna@x.com` and `anna@x.com` could be two accounts; login failed with different casing. | Emails normalized to lowercase, case-insensitive uniqueness (serializer **and** DB constraint on `Lower(email)`), case-insensitive auth backend (also equalizes timing for unknown emails). | `test_email_is_case_insensitive…`, `test_email_is_stored_normalized…` |
| 7 | Medium | Validation | Email > 150 chars → 500 (also stored as `username`, max 150). | `EmailField(max_length=150)` → 400. | `test_overlong_email_is_a_validation_error_not_a_crash` |
| 8 | Medium | File uploads | Size was checked only *after* Django had buffered the whole body — a client could make the server store gigabytes. | Declared `Content-Length` checked first → 413 (CSV and receipts). | `tests/test_upload_security.py::test_declared_oversized_*` |
| 9 | Medium | CSV parsing | No file-size or row limit; every row costs a duplicate-check query → trivial DoS. | 2 MB / 5000 rows; oversized file refused as a whole before anything is saved. | `test_csv_larger_than_the_limit_is_refused`, `test_too_many_rows_is_refused_as_a_whole` |
| 10 | Medium | CSV parsing | NUL bytes, a field above Python's csv limit, or a description > 255 chars → **500**. | Binary rejected, `csv.Error` → 400, overlong description fails only that row. | `test_malformed_csv_is_a_clean_400`, `test_overlong_description_fails_that_row_not_the_request` |
| 11 | Medium | Production config | `prod.py` accepted `ALLOWED_HOSTS=*`, a placeholder/short `SECRET_KEY`, and http CORS origins. | Refuses to start (`ImproperlyConfigured`); adds HSTS 1y, `X_FRAME_OPTIONS=DENY`, nosniff, referrer policy, HttpOnly/Secure cookies, opt-in `SECURE_PROXY_SSL_HEADER`, `CSRF_TRUSTED_ORIGINS`; `manage.py check --deploy` passes with zero warnings. | `tests/test_deployment_config.py` |
| 12 | Medium | Docker | Container ran as root; PostgreSQL published on all interfaces. | Non-root `spendly` user; DB bound to `127.0.0.1:5433`. | `test_container_runs_as_an_unprivileged_user` (compose: manual) |
| 13 | Medium | XSS / web | Tokens are in `localStorage`; no CSP, so any XSS could read and send them anywhere. | Build-time CSP: `script-src 'self'`, `connect-src 'self' <API origin>`, `object-src 'none'`, `base-uri`/`form-action 'self'`. Verified in a real browser: injected inline script blocked, fetch to a foreign origin blocked. | `web/src/security/csp.test.ts`, `xss.test.tsx` |
| 14 | Medium | Mobile storage | Android auto-backup included app data (cached financial responses, offline queue). | `android.allowBackup: false`. | `mobile/__tests__/security/mobileSecurity.test.ts` |
| 15 | Medium | Mobile transport | A release build could ship with an `http://` API URL (tokens in cleartext). | Release builds refuse non-https URLs at startup; dev keeps http for LAN testing. | same file |
| 16 | Low | Secrets in logs | `console.warn(error)` printed AxiosErrors — including the `Authorization` header and refresh-token request bodies — to the device log. | `logWarning()` logs only status/code/message. | same file |
| 17 | Low | Both clients | *(found in the testing step)* An HTML error page body was parsed as field errors. | Only JSON objects parsed. | `web/src/utils/errors.test.ts` |
| 18 | Low | JWT | Tokens signed with `SECRET_KEY`; rotating it would also invalidate other Django signatures. | Optional separate `JWT_SIGNING_KEY` (defaults to `SECRET_KEY`). | config test |

## Verified — no change needed

| Area | Evidence |
|---|---|
| **User A vs. User B** | `tests/test_security.py`: every `*-detail` route (a new resource fails the test until added) returns 404 for another user's object on GET/PATCH/DELETE and hides it from lists; owner can't be changed by mass assignment; own objects can't point at another user's category; filtering by another user's category id reveals nothing; `?user=` ignored; analytics, notification preferences, offline cache and outbox are per user. |
| API permissions | Every non-public route answers 401 anonymously — enforced by reading the URLconf, so a new unprotected endpoint fails the suite. |
| SQL injection | Only the ORM is used (no `raw`/`extra`/cursor); injection strings in `search`, `ordering`, filters and dates → 200/400, no rows leaked, nothing dropped. |
| CSRF | The API authenticates only with the `Authorization` header; a session cookie is **not** accepted (tested), so cross-site requests can't act as the user. The admin keeps Django's CSRF middleware. |
| Stored XSS | The API stores markup verbatim as JSON; the web client renders it as text (tested); no `dangerouslySetInnerHTML`/`eval` anywhere; React Native has no HTML rendering. |
| JWT | 15 min access / 7 d refresh, rotation + blacklist, reused rotated token rejected, refresh token not accepted as access token, tampered and `alg: none` tokens rejected, deactivated users rejected. |
| Passwords | PBKDF2 (Django default), all four validators, never returned, privilege fields (`is_staff`, …) ignored at registration. |
| Secure storage (mobile) | Refresh token in Keychain/Keystore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), access token memory-only, biometric lock, everything wiped on logout. |
| CORS | Explicit allow-list from env, no wildcard, no credentials; production requires https origins. |
| Receipts | Format allow-list, decompression-bomb guard, size limit, rate limit, image never stored. |
| Secrets | No secret literals in settings (tested); only `.env.example` files are tracked; `EXPO_PUBLIC_*` holds only the API URL. |

## Accepted risks / recommendations

- **Web tokens in `localStorage`.** Mitigated by the CSP, 15-minute access tokens and refresh rotation. The stronger design (refresh token in an `HttpOnly; Secure; SameSite` cookie on a same-site API domain) needs backend cookie endpoints — recommended before a public launch.
- ~~Throttle counters live in the local-memory cache~~ — **resolved (deployment step):** production uses a cache shared by every worker and container (`CACHE_URL`, default a PostgreSQL table; Redis when traffic grows). Development still uses the per-process local-memory cache.
- ~~`frame-ancestors` can't be set from a `<meta>` CSP~~ — **resolved (deployment step):** the web image's nginx sends `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` as headers (`web/nginx/security-headers.conf`). A different static host must send them itself (see `docs/deployment.md`).
- **Registration reveals whether an email exists** ("already exists"). Common trade-off; rate-limited. A verify-by-email flow would remove it.
- **Push token takeover**: registering someone else's Expo token moves it to the caller. Tokens aren't public; the real owner reclaims it on next launch.
- **CSV export (future)**: descriptions like `=HYPERLINK(...)` are stored as plain data (tested) — an export must prefix cells starting with `= + - @` with `'` to prevent spreadsheet formula injection.
- **Mobile npm advisories**: 14 moderate (13 before the release-build step; `expo-splash-screen` joined through the same `@expo/config-plugins` → `xcode` → `uuid` chain — no new root cause), all transitive inside Expo tooling (`xcode`/`uuid`, `query-string`/`decode-uri-component` — a malformed deep link could stall the app). npm's suggested "fix" is a downgrade to Expo 46; track Expo SDK patch releases instead. Web: 0 vulnerabilities.
- **Django admin** at `/admin/` has no rate limit — restrict it by network or VPN in production.
- Later hardening: Argon2 password hashing (new dependency), dependency scanning (`pip-audit`, `npm audit`) in CI.
