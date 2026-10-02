# WALLEX — senior code review (September 2026)

**Scope:** the whole repository — backend, database, API, web, mobile, authentication,
security, testing, Docker, performance, architecture and documentation. The review reads
the code as it stands and checks it against the running system where possible.

**Outcome:**

- **No CRITICAL findings.**
- **5 HIGH findings, all fixed in this review.** For each one, a regression test was
  written and seen failing first, and the fix was then verified in the running app where
  that is observable.
- The MEDIUM and LOW findings are recommendations, ordered by value.

**Severity scale:**

| Severity | Meaning |
|---|---|
| CRITICAL | Exploitable security hole or data loss/leak across users; blocks any release. |
| HIGH | Wrong data shown or stored, a broken core flow, unbounded performance cost, or a legal/operational blocker. |
| MEDIUM | Real weakness with a mitigation or limited blast radius; fix before scaling or a public launch. |
| LOW | Code quality, polish or minor efficiency. |

---

## Summary

| Area | Verdict |
|---|---|
| Backend | Clear layering (views → serializers → services), strict user scoping, exact decimals, constant query counts in analytics. Two data-integrity holes and one N+1 were found and fixed. |
| Database | Good constraints (CHECK, partial UNIQUE), indexes match most queries. `PROTECT` made user deletion impossible → fixed. |
| API | Consistent REST, complete OpenAPI with contract tests. Pagination without a total order → fixed. |
| Web | Typed service layer, no `any`, per-section loading and error states. Issues: redundant requests, localStorage tokens (MEDIUM). |
| Mobile | Strong session layer: memory-only access token, shared refresh, generation guard. Robust idempotent offline outbox. One stale-closure bug → fixed. |
| Authentication | JWT rotation + blacklist, throttling, timing-safe login. Web token storage is the main residual risk. |
| Security | No CRITICAL/HIGH issues. The residual risks are documented; see MEDIUM. |
| Testing | 501 backend, 34 web and 87 mobile tests; security matrix; OpenAPI contract tests. No CI or E2E yet. |
| Docker | Non-root images, health checks, release-step migrations, secrets from env. |
| Performance | Analytics are N+1-free. Remaining: synchronous push delivery, per-row CSV duplicate checks. |
| Architecture | Business logic is centralised in the backend; clients never compute money. |
| Documentation | README, deployment, mobile release, security, testing and OpenAPI are all present and consistent. |

---

## HIGH — fixed

### H1. Transaction pages repeated some transactions and hid others

- **Where:** `GET /api/transactions/` as used by both clients: web `TransactionsPage`, mobile
  `usePaginatedTransactions` and the dashboard.
- **Problem:** the clients send `ordering=-date`, which replaces the default
  `-date,-created_at`. Transactions on the same date then come back in an arbitrary order
  on each query.
  - LIMIT/OFFSET pagination therefore repeated rows at page boundaries and skipped others.
  - Measured on 95 seeded transactions: duplicates in 10 of 10 runs, and one transaction
    never shown.
  - On mobile this also raised React's duplicate-key warning.
- **Fix:** `StableOrderingFilter` (`apps/transactions/filters.py`) always appends the
  primary key as a tie-breaker, so every ordering is total.
- **Test:** `test_pagination_shows_every_transaction_exactly_once` runs 5 orderings with
  ties on every sort field.

### H2. N+1 on the budget list, and the "spent" logic existed three times

- **Where:**
  - `BudgetSerializer.to_representation` called `Budget.get_spent_amount()`, one aggregate
    query per budget;
  - `analytics.get_budget_usage` computed the same numbers differently;
  - the usage percentage formula was written twice.
- **Impact:** `GET /api/budgets/` returns every budget of every month, so its cost grew with
  history: 3 queries for one budget, 11 for nine. Separate implementations of the same
  business rule could also drift apart.
- **Fix:**
  - `Budget.objects.with_spent()` annotates `spent` with a correlated subquery, so the whole
    list is one query.
  - `usage_figures()` is now the single formula for remaining amount and usage percentage.
  - The budget API, the dashboard, the insights and the push threshold checks all use these.
    The push checks now need one query instead of two.
  - Create and update responses are re-read through the same queryset.
- **Test:** `test_list_query_count_does_not_grow_with_the_number_of_budgets`, plus the
  existing constant-query tests (dashboard 3, insights 6) and the model tests, rewritten
  for the new API.

### H3. A category in use could switch between income and expense

- **Where:** `PATCH /api/categories/{id}/`.
- **Impact:**
  - Existing transactions kept the old type inside a category of the other type, and could
    then no longer be edited.
  - Budgets ended up on an income category, which creating one directly forbids.
  - Analytics grouped the inconsistent rows.
- **Fix:** `CategorySerializer.validate_type` rejects a type change (`400`) while any
  transaction, recurring transaction or budget uses the category. Every other field stays
  editable.
- **Test:** 4 cases (transaction, recurring, budget, unused).

### H4. No user with transactions could be deleted

- **Where:** `Transaction.category` and `RecurringTransaction.category` used
  `on_delete=PROTECT`.
- **Impact:** `PROTECT` raises even when the protected rows are deleted in the same cascade.
  Deleting a user (User → Category and User → Transaction) always failed. That blocked admin
  deletion, any future "delete my account" feature and GDPR erasure requests.
- **Fix:**
  - `on_delete=RESTRICT`: a used category still can't be deleted on its own, but a user
    cascade works. The migration `transactions/0003` is a no-op in SQL.
  - `CategoryViewSet.destroy` now maps `RestrictedError` to the same `409` as before.
- **Test:** a user with categories, transactions, recurring items, a budget, a device and a
  notification is deleted cleanly. Verified live: a user with 5 transactions was deleted
  with one call.

### H5. Mobile: returning to Transactions reloaded the list without the active filters

- **Where:** `TransactionsScreen`. The focus handler was
  `useFocusEffect(useCallback(…, []))` with `eslint-disable`, so it captured the
  first-render `refetch` and its initial filters.
- **Impact:** select a category chip, open a transaction, go back → the list showed every
  transaction while the chip still looked selected.
- **Related:** the same copy-pasted pattern on the dashboard used `[year, month]`, so every
  month switch fired its 5 requests twice (MEDIUM).
- **Fix:** a single `useRefetchOnFocus` hook (`mobile/hooks/useRefetchOnFocus.ts`) replaces
  4 copies. It keeps one stable focus effect, always calls the latest `refetch`, and skips
  the first focus.
- **Test:** 3 hook tests. The old pattern fails the "latest callback" test (mutation check).
  Verified in the running app: the refetch after returning is sent with `category=<id>`.

---

## MEDIUM — recommended

### Security and authentication

| # | Finding | Recommendation |
|---|---|---|
| M1 | **Web keeps both JWTs in `localStorage`.** An XSS would let an attacker steal a 7-day refresh token. It is mitigated by a strict build-time CSP, React escaping and short access tokens; this is a documented accepted risk. | Refresh token in an `HttpOnly; Secure; SameSite` cookie on dedicated web auth endpoints, access token in memory. The same-origin deployment already makes this simple. |
| M2 | **The web refresh interceptor clears the session on any refresh failure**, including offline, timeouts and 5xx. The app bootstrap was already fixed for this case; the interceptor was not. | Clear tokens only on `400/401` from `/auth/refresh/`, as the mobile `session.ts` does. |
| M3 | **The Django admin is proxied publicly at `/admin/`** with no rate limit and no 2FA. | Restrict it by network, use a VPN or a non-default path, or add an env switch to disable it in production. |
| M4 | **Account protection is incomplete.** Throttling is per IP only (no per-account lockout against distributed credential stuffing), and there is no password reset or email verification. | Per-account throttle or backoff; password reset and email confirmation flows. |
| M5 | **Push texts include budget names and percentages**, visible on the lock screen. | A "private notifications" preference with generic texts. |

### Performance

| # | Finding | Recommendation |
|---|---|---|
| M6 | **Push delivery runs synchronously in the request thread** (`on_commit`, up to a 10 s Expo timeout) on 2 sync gunicorn workers. A slow Expo service can stall the API. | Deliver from a worker or queue, or leave it to the scheduled command (the PENDING outbox already supports this). |
| M7 | **CSV import checks duplicates with one query per row**, up to 5,000 queries per request. | Load the existing `(date, amount, lower(description))` keys for the file's date range in one query. |
| M8 | **The mobile response cache does 3–4 serialized AsyncStorage operations per GET** and re-reads its index from disk every time. Large JSON is (de)serialized on the JS thread. | Keep the index in memory, write it debounced, and cache only the first page of paginated lists. |

### Architecture, API and clients

| # | Finding | Recommendation |
|---|---|---|
| M9 | **Redundant requests:** each dashboard makes 6 requests, `insights` recomputes what `dashboard` already computed, and every screen re-downloads the category list. | A shared categories cache (context, or TanStack Query after approval); consider putting the category colour into the analytics rows. |
| M10 | **The web `TransactionsPage` resets the page in an effect**, so every filter change sends two requests (the first is wasted). | Reset the page in the filter and sort handlers. |
| M11 | **API types and services are mirrored by hand** in `web/src` and `mobile/`. | Generate the TypeScript types from `backend/openapi.yaml`. |
| M12 | **Recurring templates never create transactions** (`next_occurrence_date` never advances). It is documented, but it is still a feature gap. | A scheduled, idempotent generator with `UniqueConstraint(recurring_transaction, date)`. |

### Delivery

| # | Finding | Recommendation |
|---|---|---|
| M13 | **No CI, no E2E tests, thin web UI tests.** Bugs like H5 are only caught by manual review. | GitHub Actions (tests, type checks, `makemigrations --check`, image build); Playwright (web) and Maestro (mobile) smoke flows. |
| M14 | **No error tracking, no automated backups, and the hourly notification job needs manual cron.** | Sentry (or similar), scheduled `pg_dump`/managed backups, and a scheduler service or platform cron. |

---

## LOW

- **Mobile lists:** `FlatList` gets an inline `renderItem` and inline `onPress` closures;
  `TransactionListItem` is not memoized; no `getItemLayout`.
- **Web auth context:** the `AuthContext` value isn't memoized, so every consumer
  re-renders whenever the provider does.
- **Skeleton flash:** `useAsyncData` (both clients) clears `data` on every refetch, so
  pages flash a skeleton on page changes. Keep the previous data while reloading.
- **Lint warnings:**
  - `setState` inside an effect to initialise a form (`RecurringTransactionFormModal`);
    reset with a `key` instead.
  - A non-component export in `TransactionFilters.tsx`.
- **Indexes:**
  - `transaction_user_type_idx (user, type)` has low selectivity; analytics filter on
    user + type + date, which `(user, type, date)` would serve better.
  - `category_user_type_idx` is mostly covered by the unique `(user, name, type)` index.
- **Budget list** is unpaginated and has no `?year=` filter; fine today, but it grows with
  history.
- **Django admin** foreign-key dropdowns have no `raw_id_fields`, which gets slow with many
  users.
- **Dependencies:**
  - `babel-preset-expo` is listed under `dependencies` instead of `devDependencies`;
  - Docker base images are pinned by tag, not by digest.
- **Mobile tab bar** uses placeholder icons.
- **Docs:**
  - `web/README.md` is still the Vite template;
  - `docs/api-contract.md` partly duplicates the OpenAPI document (drift risk; the OpenAPI
    document is declared canonical).
- **Expo web only:** on a cold deep link to a non-dashboard tab, data loading waited until
  the first interaction. Seen only in the web preview; confirm on a device before investing.

### Checked and found sound

- No `any`, `@ts-ignore` or raw-HTML sinks in either client.
- No money arithmetic in the clients.
- Push deep links are allow-listed.
- Receipt suggestions and category lookups are user-scoped.
- Login is timing-safe.
- Analytics endpoints have asserted, constant query counts.
- The offline outbox is idempotent (`client_id`), single-flight, backs off, and is
  namespaced per user.
- The mobile access token lives in memory, with a single shared refresh and a
  generation guard.
- No unnecessary runtime dependencies were found.

---

## Production readiness checklist

✅ done · ⚠️ partly / with a documented risk · ❌ missing

**Application**

- ✅ Business logic, validation and money arithmetic only on the server; exact decimals end to end
- ✅ Per-user isolation enforced by queryset scoping plus object permissions, covered by a route-introspecting test matrix
- ✅ Database constraints back every important invariant; users can be deleted (H4)
- ✅ Pagination is deterministic (H1); no N+1 on list or analytics endpoints (H2)
- ⚠️ Recurring transactions don't generate transactions yet (M12)
- ⚠️ CSV import cost grows per row (M7)
- ❌ Password reset, email verification, self-service account deletion and data export (M4)

**Security**

- ✅ Production settings refuse to start with unsafe values; `check --deploy` is clean
- ✅ HTTPS/HSTS, secure cookies, CSP, clickjacking protection, nosniff
- ✅ JWT rotation + blacklist, owner-only logout, auth throttling, timing-safe login
- ✅ Upload limits enforced before parsing; image and CSV validation
- ✅ Mobile: Keychain/Keystore, memory-only access token, biometric lock, https-only release builds, no secrets in the bundle
- ⚠️ Web tokens in `localStorage` (M1); session dropped on network errors (M2)
- ⚠️ Admin exposed without rate limit or 2FA (M3); no per-account lockout (M4)

**Operations**

- ✅ Docker images: non-root, multi-stage, health checks; migrations as a release step
- ✅ Shared rate-limit cache across workers; logs to stdout
- ✅ Deployment and mobile-release runbooks
- ⚠️ Push delivery in the request path (M6)
- ⚠️ Hourly notification job relies on manual cron (M14)
- ❌ CI/CD pipeline (M13)
- ❌ Error tracking and alerting (M14)
- ❌ Automated, tested database backups (M14)
- ❌ Load testing; a real-device test pass for push, biometrics, camera and offline

**Compliance**

- ❌ Privacy policy, App Privacy / Data safety answers, GDPR export and erasure endpoints

## Portfolio readiness checklist

- ✅ Professional README: screenshots, architecture and ER diagrams, feature matrix, setup guide
- ✅ Three working clients sharing one API; no duplicated business logic
- ✅ Interactive API docs (Swagger) plus a committed, contract-tested OpenAPI document
- ✅ 622 automated tests, including a security matrix, money precision, OpenAPI contract and offline sync
- ✅ Security audit, testing strategy, deployment guide, mobile release guide and this code review in `docs/`
- ✅ Production-like Docker stack that starts with one command
- ⚠️ Commit messages: some recent ones are generic (e.g. "Refactor code structure…" for a large docs + OpenAPI change). Use descriptive, conventional commits.
- ⚠️ Mobile screenshots come from the Expo web target; add real-device screenshots or a short screen recording.
- ⚠️ No demo data command; a `seed_demo` management command would let reviewers explore quickly.
- ❌ CI badge, i.e. a green GitHub Actions run (M13)
- ❌ Live demo link (deploy the production stack)
- ❌ License, author and contact section in the README; replace `<repository-url>`
- ❌ `web/README.md` still shows the Vite template

## Addendum — October 2026: rename to WALLEX and the English / Hungarian pass

A second review pass over the code that changed with the rename and the bilingual work. It looked
for bugs the way a reviewer would — by reading the diff, then by writing a scanner for each class
of mistake it found instead of trusting that a manual search had caught them all.

| # | Finding | Severity | Status |
|---|---|---|---|
| A1 | `makemessages` silently ignored every text written through an alias (`gettext_lazy as _lazy`): the assistant's refusal text, source labels and the month-comparison insights would have stayed English forever. | HIGH | Fixed — imported by their real name; `test_translation_catalog.py` now reads the source itself and fails on any text missing from the catalog. |
| A2 | Five user-visible texts bypassed gettext altogether (f-strings in the CSV import — "Could not detect a category…", "… amounts can't have decimals" — plus the colour-validator message, the upload-too-large message and a few 2FA / filter messages). | HIGH | Fixed; an AST scan (raw strings handed to error classes and `detail` / `reason` values) now finds none. Regression tests in `tests/test_i18n.py`. |
| A3 | A request leaves its language active on the worker thread, so the next code to run without a request (a test, a management command) could answer in the previous user's language. | MEDIUM | Fixed in tests (autouse `reset_active_language`); production code that runs outside a request always wraps itself in `language_of(user)`. |
| A4 | Default categories are shown translated, so a user could add "Élelmiszer" next to the stored "Food" and see two identical rows. | MEDIUM | Fixed — the category API refuses a name equal to a default's translated name. |
| A5 | The category API returned the stored (English) name, so the clients would have shown English category names in a Hungarian interface. | HIGH | Fixed — default categories are listed in the request's language; they cannot be edited, so nothing round-trips a translated name into storage. |
| A6 | Renaming strings blindly would have changed a cryptographic label (HKDF `info`), making every stored authenticator secret undecryptable. | HIGH (prevented) | The label stays `"spendly"`, with a comment and a note in `docs/i18n.md`. |
| A7 | `django-admin compilemessages` walks the whole tree including the bind-mounted `.venv` (minutes). | LOW | Fixed — `-i .venv` everywhere it is called. |
| A8 | Bare numbers (`12`, `7`, `60`, `1024 * 1024`, `255`, `2000`, RFC 4226 masks …) repeated across modules. | LOW | Named: `apps/common/constants.py` for calendar / unit arithmetic, local constants elsewhere. |

Side effects of the rename that are worth knowing: web and mobile storage keys, the refresh-cookie
name and the JWT issuer changed, so everyone signs in once more; a two-factor challenge started a
moment before the deploy (5 minutes at most) must be restarted; authenticator apps keep working
(the secret is untouched), new enrolments show "WALLEX" as the issuer.

Follow-up the same week (style and structure):

- `ruff` (lint + format) is configured in `backend/pyproject.toml` and the whole backend passes it:
  no unused imports, `raise … from`, explicit `zip(strict=…)`, no magic values in comparisons,
  functions under 10 branches. Run `docker compose exec backend ruff check .` and `ruff format --check .`.
  `ruff format` was applied to the whole backend once, so that commit is mechanical.
- The worst function ruff found, the CSV import (66 statements, complexity 15), was split into a
  file reader, a row importer that either returns a transaction or says why not, and a short loop;
  its behaviour is unchanged (the CSV and i18n tests did not change).
- Web (`oxlint`) and mobile: bare numbers named (HTTP statuses, months per year, icon sizes, time
  units); `oxlint`'s `no-magic-numbers` is on for the web and reports none.
- The documentation screenshots were retaken with the new name (and a Hungarian dashboard added);
  the mobile ones now show the Assistant tab, which the old ones predated.

Left as they were: twelve `oxlint` warnings in the web app that predate this work (five
"fast refresh" notes for files that export a provider and its hook, six `setState` calls in effects
that reset the form modals), and on narrow phones the six-tab bar truncates "Transactions".
