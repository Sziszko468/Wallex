# WALLEX — testing strategy

## Principle: test the risk, not the line count

There is no coverage target. A test earns its place when a bug in that spot would
**lose or leak money data, let one user see another's data, or silently save something
wrong**. Everything else gets a lighter touch. Concretely, in priority order:

1. **User isolation** — no endpoint, cache or queue may ever show or change another user's data.
2. **Authorization & authentication** — every non-public endpoint rejects anonymous calls; sessions expire, rotate and revoke correctly on every client.
3. **Financial correctness** — exact decimals end-to-end, strict input precision, money never becomes a float.
4. **Validation** — invalid data is rejected with a clear error, never stored, never a 500.
5. **Offline synchronization** — nothing recorded offline is lost or duplicated, whatever the network does.

The backend is the source of truth, so most of the weight sits there. Clients are tested
for what only they can get wrong: token handling, offline queueing, caching, and showing
the backend's numbers without recomputing them.

## How to run

| Layer | Command | Runs against |
|---|---|---|
| Backend | `docker compose exec backend pytest -q` | real PostgreSQL (never SQLite) + real Tesseract |
| Web | `npm --prefix web test` | Vitest + jsdom, API faked with MSW at the network level |
| Mobile | `npm --prefix mobile test` | Jest (`jest-expo`), native modules faked in `__tests__/setup.ts` |
| Style | `docker compose exec backend ruff check .` and `ruff format --check .`; `npm --prefix web run lint` | ruff rules in `backend/pyproject.toml` (unused code, `raise … from`, magic values, complexity); oxlint for the web, including `no-magic-numbers` |

## Tools and why

| Layer | Tools | Notes |
|---|---|---|
| Backend | pytest, pytest-django | `django_assert_num_queries` guards N+1; `django_capture_on_commit_callbacks` for push delivery |
| Web | Vitest, React Testing Library, user-event, MSW | MSW intercepts real HTTP, so the real axios client, interceptors and refresh logic run |
| Mobile | jest-expo, React Native Testing Library 14, expo-router `renderRouter` | RNTL 14's `render`/`renderHook` are **async** — always `await` them |

External services are always replaced at their boundary, never called:
Expo push (`push_outbox` autouse fixture), OCR (`FakeOcrProvider` via the
`RECEIPT_OCR_PROVIDER` setting), the HTTP layer on web (MSW) and mobile (axios adapter
/ `axios.post` spy).

## Where each critical area is covered

### Backend (`backend/`)

| Area | Tests | What they guarantee |
|---|---|---|
| **Auth on every endpoint** | `tests/test_security.py` | Reads the URLconf: every `/api/` route except register/login/refresh answers 401 to anonymous calls. A new endpoint without auth fails this test automatically. |
| **User isolation** | `tests/test_security.py`, per-app `test_api.py` | Every `*-detail` route (enforced: a new resource must be added to the matrix) returns 404 for another user's object on GET/PATCH/DELETE, and it's absent from lists; analytics never include other users' money. |
| Authentication | `apps/users/tests.py` | Register (no tokens returned, default categories), login, refresh **rotation** (old token rejected on reuse), refresh token not usable as access token, logout blacklists — and **only the caller's own** token. |
| **Financial calculations** | `tests/test_money.py`, `apps/analytics/tests.py`, `test_insights.py` | 0.10+0.20+0.30 = "0.60" exactly; >2 decimals / >10 digits / ≤0 / NaN rejected; max amount round-trips; budget rounding (33.33%), negative balance; **every money field in every analytics/list response is a decimal string**; fixed query counts. |
| Transactions / categories / budgets | per-app `test_api.py`, `tests.py` | CRUD, filters, pagination, type↔category rules, protected category delete (409), duplicate budgets (400, not 500). |
| CSV import | `apps/transactions/test_csv_import.py` | Formats, per-row failures, duplicates, only the user's own categories. |
| Recurring | `test_recurring_api.py`, `test_recurrence.py` | Validation, scheduling state, month-end/leap-year occurrence maths. |
| Financial insights | `apps/analytics/test_insights.py` | Each rule, thresholds, month-to-date alignment, isolation, 6-query budget. |
| Notifications | `apps/notifications/`, `apps/analytics/test_anomalies.py` | Every rule's decision and text, thresholds notify once, preferences respected, unusual-spending baseline, read/unread and inbox isolation, nothing pushed before commit, retry/backoff, stale devices skipped, device ownership. |
| Multi-device sync | `tests/test_sync.py`, `web/src/hooks/useSync.test.tsx`, `mobile/__tests__/sync/` | Two logins of one account see each other's writes; every write endpoint moves the sync version and no read does; responses are never cacheable; stale `If-Match` edits/deletes get `412` and change nothing (every editable resource); CORS allows `If-Match`; clients reload in the background on a change, never re-seed an open form, dedupe shifted pages, and recover when the first check came late. |
| Account security | `tests/test_account_security.py`, `tests/test_isolation_canary.py`, `apps/users/test_mfa.py`, `web/src/pages/SecurityPage.test.tsx`, `mobile/__tests__/auth/` | Sessions revocable at once (one device, everywhere, password change), refresh-token reuse revokes the session, 30-day limit, per-account lock across IPs, HttpOnly cookie transport and its CSRF guard, TOTP against the RFC vectors + replay + recovery codes + encryption at rest, audit trail, and user B's canary data absent from every readable endpoint for user A. |
| **Offline sync (server side)** | `apps/transactions/test_client_id.py` | Same `client_id` → 200 + existing row (no duplicate), even with a now-invalid payload, and under a concurrent race. |
| Receipts | `apps/receipts/` | Parser rules, never saves, fake-provider API tests, one real-Tesseract test. |
| Languages (en / hu) | `tests/test_translation_catalog.py`, `tests/test_i18n.py`, web `i18n/*.test.ts(x)`, mobile `__tests__/i18n/` | Every text in the code has a finished Hungarian translation with the same placeholders (read from the source, no extraction tool needed); `Accept-Language` selection (`hu`, `hu-HU,en;q=0.5`, unknown → English), error codes identical in both languages; the account language drives notifications, pushes and the monthly summary regardless of the request's language; default category names, month names, money formats, insights, achievements, assistant texts and CSV row reasons in Hungarian; no language leaks between requests; clients: both catalogs have the same keys/plurals, nothing left in English, language persists and syncs to the account. |
| Ordering | `tests/test_ordering.py` | Every list endpoint's default and `?ordering=` sort (transactions, notifications, budgets, goals, subscriptions, recurring items, achievements, insights, analytics breakdowns): direction, tie-breaks, stable pagination. |

### Web (`web/src/**/*.test.ts(x)`)

| Area | Tests |
|---|---|
| API integration | `services/apiClient.test.ts` — token attached; 401 → one refresh + retry; **concurrent 401s share one refresh**; rotated refresh stored; rejected refresh signs out; no infinite retry. |
| Authentication | `test/auth.test.tsx` — the real route tree: protected-route redirect, login success/failure, session restore, 401 on startup drops the session, network error on startup keeps it, logout revokes the refresh token. |
| Transaction CRUD | `pages/TransactionsPage.test.tsx` — list, create (exact payload: money as string), client validation blocks the request, server field errors shown, edit (PATCH), delete only after confirmation. |
| Dashboard | `pages/DashboardPage.test.tsx` — shows the backend's figures as-is (a deliberately inconsistent balance proves no client math), month switching, per-section failure + retry, empty states. |
| Validation display | `utils/errors.test.ts` — DRF error shapes, network errors, non-JSON error pages. |

### Mobile (`mobile/__tests__/`)

| Area | Tests |
|---|---|
| **Offline sync** | `offline/outbox.test.ts` — persisted per user, account isolation, idempotency key reuse, storage failure not hidden, single-flight sync, offline → backoff + stop, same key on retry, 500 retried, 4xx parked as failed (conflict), expired session keeps items, retry/discard. |
| Offline reads | `offline/apiClient.cache.test.ts` — GET served from cache offline, per-query and **per-user** cache keys, writes never "answered" from cache, reachability flips back on success. |
| Authentication | `auth/session.test.ts` — access token memory-only, proactive refresh + rotation, one shared refresh, rejected refresh = expiry, offline ≠ expiry, expired token never sent, refresh after logout can't resurrect the session, locked = no token, logout revokes. `auth/useAuth.test.tsx` — the app-start state machine: signed out / in / expired, **biometric lock** (locked until unlock, removed biometrics → password), **offline start** only with the session's own saved profile, logout wipes local data. |
| Navigation | `navigation/routeGuards.test.tsx` — the real root layout: deep links blocked when signed out or locked, loading and "can't reach" screens, sign-out reason shown. |
| Transaction flow | `transactions/useCreateTransaction.test.tsx` — online post with key, offline queue, mid-request drop queues with the **same** key, one key per form, validation errors not queued. |
| Components | `components/ReceiptConfirmation.test.tsx` (prefill, flags, nothing saved before Save, invalid data refused), `components/offlineUi.test.tsx` (offline banner states, pending/failed list actions). |

## Conventions

- **Arrange / act / assert**, one behaviour per test, test names state the rule
  ("a refresh that finishes after logout cannot bring the session back").
- Assert on **what the user or API client observes** (response bodies, rendered text,
  stored state), not on implementation details.
- Query by accessible role/label; if a component can't be found that way, fix the
  component's accessibility rather than adding test IDs.
- No snapshot tests (they break on every style change and prove little).
- **Every bug fixed gets a regression test first.** Bugs found while building this suite:
  logout could revoke another user's token; a client_id race hit an unusable transaction
  in atomic contexts; HTML error pages showed "<" as the error message (both clients).

## Deliberately not automated

- Styling, layout, Recharts internals, third-party library behaviour.
- Real device features: Face ID / fingerprint prompts, camera, push delivery,
  airplane mode. These run from the **manual device checklist** below before a release.

### Manual device checklist (dev build on a real phone)

1. Biometric lock: enable → kill app → reopen prompts; background > 60 s re-locks; remove all fingerprints → password required.
2. Push: register on login; web-created expense past 80% budget → push → tap opens Budgets; logout → device removed.
3. Receipt: photograph a real receipt → confirm → one transaction created.
4. Offline: airplane mode → saved data + banner → add transaction → restart app offline → still pending → reconnect → synced once.

## Next steps (not built yet)

- **CI** (GitHub Actions): backend pytest with a Postgres service container, `npm test` + `tsc` for web and mobile, on every push.
- **End-to-end**: Playwright for web; Maestro for the mobile device checklist.
- Coverage reports (e.g. `pytest-cov`) as a *diagnostic* to spot untested critical modules — not as a target.
- Recurring transaction **generation** needs its own tests when built (idempotency, catch-up after downtime).
