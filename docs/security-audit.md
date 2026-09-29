# Spendly — security audit

Three reviews so far (newest first). The authentication system itself (Django + DRF + simplejwt, email
login, JWT access/refresh) was **kept, not rewritten**. Each round added to it.

## 2026-09-29 — AI finance assistant

Threat model of `apps/analytics/assistant/` (Claude via the Anthropic SDK), each point covered by tests
(`apps/analytics/test_assistant_*.py`, the isolation matrix and canary sweep in `backend/tests/`).

| Risk | Control |
|---|---|
| The model reads data it shouldn't | It has no database access. Its only inputs are the question, the conversation's earlier text and the results of seven **read-only** tools that run the dashboard's services with `request.user` — never an id from the model. Another user's data can't appear (tested per tool with a canary user). |
| Personal data sent to a third party | Tool results are aggregates: no ids, e-mail, name, username or individual transactions (tested by walking every result and every recorded request). What leaves the server: the user's question text, category / merchant (transaction description) / subscription / goal names, amounts. |
| Prompt injection through user data (e.g. a category named "ignore your instructions…") | Tools can't write, so the worst outcome is a misleading answer to the same user. The system prompt marks tool text as data, not instructions; answers render as plain text (no HTML, no links). |
| Invented answers | The prompt requires every figure to come from tool results and the exact "not enough data" sentence otherwise; tools return `has_data: false` with a reason instead of zeros; each answer lists its sources. |
| Forged history (fake earlier answers or tool results) | The server stores and replays the history; clients send only the new question. Tool results are never stored or replayed — each question fetches fresh figures. |
| Cost abuse / denial of wallet | Off without `ANTHROPIC_API_KEY`; 30 questions / hour / user (`assistant` scope, asking only); 1,000-character questions; 25 questions per conversation; ≤ 5 tool rounds and one 90 s deadline per answer; one SDK retry. |
| Failures leaking details | API errors become one `503` message; logs hold status codes, request ids and token counts — never question or answer text. A failed question stores nothing. |
| Retention | Conversations are the user's own: deletable from both apps, deleted with the account, not shown in the Django admin. |

Found and fixed on the way: the mobile client treated **any** 502/503/504 as "backend unreachable", so a
`503` written by Django itself (assistant or receipt OCR temporarily down) switched the whole app to offline
mode. `isOfflineError` now ignores a 503 that carries a DRF `detail` body (`mobile/__tests__/offline/network.test.ts`).

Accepted: the assistant sends financial aggregates and the question text to Anthropic's API (disclosed by
the feature itself; covered by Anthropic's API data-usage terms). Answers are generated text and can still
be wrong in wording — the apps say so under the question box.

## 2026-09-29 — account security (financial-grade)

Scope: sessions and tokens, brute force, 2FA, passwords, audit logging, user isolation,
web token storage, mobile storage. All tests pass: backend 1116, web 116, mobile 138.
Verified live in a browser against the dev backend: cookie sign-in, session restored after a
reload, 2FA setup and sign-in, logout on every device (another device's still-valid access
token answered `401` at once), audit trail.

| # | Severity | Area | Finding | Fix | Test |
|---|---|---|---|---|---|
| 19 | **High** | Sessions | Tokens could not be revoked: after a logout or a stolen phone, the access token kept working for up to 15 minutes, and there was no way to end other devices' access. | `UserSession` per sign-in; every token carries its `sid`; `SessionJWTAuthentication` checks the session on **every** request (same single query as before: session + user). Device list, sign out one device, **log out everywhere**, 30-day absolute session lifetime. | `tests/test_account_security.py` (`…lost_phone…`, `test_sign_out_everywhere`, `…30_days…`) |
| 20 | **High** | Token theft | A reused rotated refresh token was refused, but the thief's race went unnoticed and the session lived on. | Reuse of a replaced refresh token **revokes the whole session** and logs `refresh_token_reused` (a retry within 30 s — a lost response — is accepted). | `test_a_reused_refresh_token_revokes_the_whole_session`, `test_a_quick_retry_after_a_lost_response_is_not_theft` |
| 21 | **High** | Brute force | Rate limits were per IP only: a botnet could keep guessing one account's password. | **Per-account lock**: 5 wrong passwords or 2FA codes for one email in 15 min (any IP) → `429 account_locked` + `Retry-After`, even with the right password; temporary on purpose (no lock-out DoS); same answer for unknown emails. | `test_five_wrong_passwords_lock_the_account_even_from_other_addresses`, `…unknown_address…`, `…ends_after_15_minutes`, `apps/users/test_mfa.py::test_wrong_codes_count…` |
| 22 | **High** | Web tokens | Access and refresh token in `localStorage`: any XSS could steal a 7-day refresh token (accepted risk of round 1). | Refresh token in an **HttpOnly, Secure, SameSite=Strict cookie** scoped to `/api/auth/`, read only with the `X-Auth-Transport` header (CSRF); access token in memory only; old `localStorage` tokens deleted on start; tabs refresh under a Web Lock. Mobile unchanged (Keychain/Keystore). | `test_browsers_get_the_refresh_token_only_as_an_httponly_cookie`, `…ignored_without_the_header`, `web/src/test/auth.test.tsx`, `services/apiClient.test.ts` |
| 23 | **High** | 2FA | No second factor. | **TOTP** (RFC 6238, stdlib, verified against the RFC test vectors) with ±1 step drift, **replay protection**, 10 single-use **recovery codes** (keyed hashes only), secrets **encrypted at rest** (Fernet, key from `FIELD_ENCRYPTION_KEY`, production requires its own); setup/disable/new codes need the password (+ a code). Two-step sign-in with a 5-minute signed challenge. | `apps/users/test_mfa.py` (24 tests) |
| 24 | Medium | Audit | No record of sign-ins or security changes. | Append-only `AuditEvent`: sign-ins (also failed/blocked, with IP and user agent), sign-outs, device revocations, token theft, password and 2FA changes, base-currency changes, CSV imports, **every deletion** of financial data (with the device's session). User endpoint `GET /api/auth/security-events/` (login history = `?category=login`); read-only admin; retention job `prune_security_data`. | `test_sign_ins_are_logged_…`, `test_imports_deletions_and_currency_changes_are_logged`, `…cannot_be_edited`, `…pruned` |
| 25 | Medium | Passwords | Minimum 8 characters; no way to change the password. | 12–128 characters (upper limit against hashing DoS), common/numeric/similarity checks kept. `POST /api/auth/password/` needs the current password and **signs every other device out**. | `test_password_policy_at_registration`, `test_changing_the_password_signs_the_other_devices_out` |
| 26 | Medium | JWT | Tokens named no issuer or audience. | `iss: spendly`, `aud: spendly-api` issued and verified. | `test_tokens_for_another_audience_are_refused` |
| 27 | Medium | Admin | `/admin/` had no rate limit or 2FA (accepted risk of round 1). | Off in production unless `DJANGO_ADMIN_ENABLED`; path configurable (`DJANGO_ADMIN_URL`). | `tests/test_deployment_config.py::test_the_admin_is_off_in_production_unless_enabled` |
| 28 | Low | Throttling | 2FA and account changes had no dedicated limits. | `auth_mfa` 10/min per IP, `auth_sensitive` 20/h per user. | `apps/users/test_mfa.py`, contract tests |

**User A never reaches user B's data — now checked on every endpoint:**
`tests/test_isolation_canary.py` gives user B one of everything (transactions, categories,
budgets, recurring items, subscriptions, goals, devices, notifications, sessions, audit
events), marked with a canary. User A then calls **every GET route read from the URLconf**,
including every detail and action route pointed at B's ids. No response may contain the
canary, B's email or B's amount, and B's objects must be 404. It also covers future
endpoints automatically. A mutation test (removing the user filter from the transaction
list) was caught at once. This complements the existing isolation matrix, the mass-assignment
tests and the "every write needs auth" URLconf test.

**Verified, unchanged:** mobile refresh token in Keychain/Keystore
(`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), memory-only access token, biometric app lock (relock
after 60 s in the background, sign-out if biometrics disappear), Android backup disabled,
https-only release builds.

**Secrets:** no hardcoded secrets; `FIELD_ENCRYPTION_KEY` joins the configuration scan
(`test_no_hardcoded_secrets_in_configuration`), and production refuses a missing, short or
reused key.

**Upgrade note:** tokens issued before sessions existed carry no `sid` and are refused, so
every user signs in once more after this version.

## 2026-09-25 — first audit

Scope: Django/DRF backend, JWT auth, PostgreSQL, Docker, React web client, React
Native/Expo mobile client. Method: configuration and code review of every area below,
then **each finding reproduced with a failing test before it was fixed**. All tests
passed then: backend 449, web 33, mobile 68.

### Findings and fixes

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

### Verified — no change needed

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

### Accepted risks / recommendations

- ~~Web tokens in `localStorage`~~ — **resolved (2026-09-29, #22):** HttpOnly refresh cookie, access token in memory only.
- ~~Throttle counters live in the local-memory cache~~ — **resolved (deployment step):** production uses a cache shared by every worker and container (`CACHE_URL`, default a PostgreSQL table; Redis when traffic grows). Development still uses the per-process local-memory cache.
- ~~`frame-ancestors` can't be set from a `<meta>` CSP~~ — **resolved (deployment step):** the web image's nginx sends `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` as headers (`web/nginx/security-headers.conf`). A different static host must send them itself (see `docs/deployment.md`).
- **Registration reveals whether an email exists** ("already exists"). Common trade-off; rate-limited. A verify-by-email flow would remove it.
- **Push token takeover**: registering someone else's Expo token moves it to the caller. Tokens aren't public; the real owner reclaims it on next launch.
- **CSV export (future)**: descriptions like `=HYPERLINK(...)` are stored as plain data (tested) — an export must prefix cells starting with `= + - @` with `'` to prevent spreadsheet formula injection.
- **Mobile npm advisories**: 14 moderate (13 before the release-build step; `expo-splash-screen` joined through the same `@expo/config-plugins` → `xcode` → `uuid` chain — no new root cause), all transitive inside Expo tooling (`xcode`/`uuid`, `query-string`/`decode-uri-component` — a malformed deep link could stall the app). npm's suggested "fix" is a downgrade to Expo 46; track Expo SDK patch releases instead. Web: 0 vulnerabilities.
- ~~Django admin without a rate limit~~ — **resolved (2026-09-29, #27):** off in production unless enabled; when enabled, keep it behind a VPN / IP allow-list.
- **Remaining (2026-09-29):** no password-reset e-mail flow (needs e-mail delivery); no breached-password check (would send password hashes' prefixes to an external service); 2FA setup has no QR image (the `otpauth://` link and key work in every authenticator app, a QR needs a new dependency); PBKDF2 with 1M iterations kept (Argon2id needs a new dependency); login history shows the Docker gateway address in development (production resolves the client through `DRF_NUM_PROXIES`).
- Later hardening: Argon2 password hashing (new dependency), dependency scanning (`pip-audit`, `npm audit`) in CI.
