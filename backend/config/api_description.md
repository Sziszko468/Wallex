REST API behind the Spendly web and mobile apps. Every business rule — validation,
ownership, money arithmetic, analytics, insights — lives here; clients only display
what the API returns.

## Quick start

```bash
# 1. Create an account (no token needed)
curl -X POST https://<host>/api/auth/register/ -H "Content-Type: application/json" \
  -d '{"email": "ada@example.com", "password": "a-long-passphrase", "password_confirm": "a-long-passphrase"}'

# 2. Log in → {"access": "…", "refresh": "…"}
curl -X POST https://<host>/api/auth/login/ -H "Content-Type: application/json" \
  -d '{"email": "ada@example.com", "password": "a-long-passphrase"}'

# 3. Call the API with the access token
curl https://<host>/api/transactions/ -H "Authorization: Bearer <access>"
```

In Swagger UI: log in with *Authentication → POST /api/auth/login/ → Try it out*, copy the
`access` value, click **Authorize** and paste it (without the `Bearer ` prefix).

## Authentication

JSON Web Tokens, sent as `Authorization: Bearer <access token>`.

| Token | Lifetime | Use |
|---|---|---|
| access | 15 minutes | Every authenticated request. |
| refresh | 7 days | Only `POST /api/auth/refresh/` and `POST /api/auth/logout/`. |

- **Refresh tokens rotate.** Every refresh returns a *new* refresh token and invalidates
  the old one. Always store the newest; replaying an old one answers
  `401 {"code": "token_not_valid"}`.
- **Recommended client flow:** on a `401` from any endpoint, call `/api/auth/refresh/`
  once — never several in parallel, the first call already invalidates the token the
  others would send — then retry the original request. If the refresh itself fails,
  the session is over: send the user to the login screen.
- **Logout** revokes the refresh token server-side. Access tokens can't be revoked;
  they simply expire within 15 minutes.
- Endpoints marked with a lock need a token; `register`, `login`, `refresh` and the
  health probes don't.

## Conventions

| Topic | Rule |
|---|---|
| Base path | Everything is under `/api/`. URLs end with a slash. |
| Content type | `application/json`, except the two uploads (`multipart/form-data`). |
| Money | Decimal **strings** with two decimals: `"1234.50"`. Send strings (numbers are accepted); never do money arithmetic with floats on the client — the API returns every total. |
| Currencies | EUR, HUF, USD, GBP, JPY, CHF (whole numbers for HUF and JPY). A transaction keeps `amount` in its own `currency`; its `base_amount` is the same value in the user's **base currency** (`GET /api/auth/me/` → `base_currency`). Every total — analytics, budgets, recurring amounts — is in the base currency. Conversions use ECB reference rates, fixed when the transaction is saved. |
| Amount sign | Amounts are always positive. `type` (`income` / `expense`) says which way the money went. A transaction's `type` must equal its category's `type`. |
| Dates | `YYYY-MM-DD`. Timestamps: ISO 8601 in UTC (`2026-09-26T09:49:57.360831Z`). |
| Percentages | JSON numbers (`76.5`), or `null` where they are undefined (division by zero). |
| IDs | Integers. Referencing another user's object (e.g. a category) is a validation error; fetching it is a `404`. The two never reveal that the object exists. |
| Partial updates | `PATCH` with only the fields to change. `PUT` (full replace) exists for transactions only. |
| Ownership | Every resource belongs to the signed-in user. There is no way to read or change another user's data. |

## Pagination

Only `GET /api/transactions/` is paginated (it can grow without bound):

```json
{"count": 132, "next": "https://<host>/api/transactions/?page=3", "previous": "https://<host>/api/transactions/?page=1", "results": [ … ]}
```

`?page=` starts at 1, `?page_size=` defaults to 20 (max 100). A page past the end is a
`404`. All other lists (categories, budgets, recurring transactions, devices) are small
and returned as plain JSON arrays.

## Errors

Every error has a JSON body and a meaningful status code:

| Status | Meaning | Body |
|---|---|---|
| `400` | Validation failed; nothing was saved | `{"<field>": ["message", …], "non_field_errors": ["…"]}` — one key per invalid field or query parameter |
| `401` | Missing, invalid or expired token | `{"detail": "…"}` (+ `"code": "token_not_valid"` for bad tokens) |
| `403` | Authenticated, but the action isn't allowed (e.g. editing a system category) | `{"detail": "…"}` |
| `404` | No such object *for this user* | `{"detail": "…"}` |
| `405` | HTTP method not supported on this URL | `{"detail": "…"}` |
| `409` | The action conflicts with existing data (e.g. deleting a category in use) | `{"detail": "…"}` |
| `413` | Upload too large | `{"<field>": ["…"]}` |
| `429` | Rate limit hit; retry after `Retry-After` seconds | `{"detail": "…"}` |
| `503` | A dependency is temporarily unavailable (receipt OCR, the AI assistant's model, health probe) | `{"detail": "…"}` |

Error messages are written for end users and may be shown as they are.

## Rate limits

| Scope | Default limit | Keyed by |
|---|---|---|
| `POST /api/auth/login/` | 10 / minute | client IP |
| `POST /api/auth/register/` | 10 / hour | client IP |
| `POST /api/auth/refresh/` | 30 / minute | client IP |
| `POST /api/receipts/scan/` | 30 / hour | user |
| Questions to the AI assistant (`POST /api/assistant/conversations/…`) | 30 / hour | user |
| Everything else | 2000 / hour | user (IP when anonymous) |

## Idempotent transaction creation

Clients that queue transactions offline send a `client_id` (a UUID generated once per
transaction). Re-sending the same `client_id` answers `200` with the already stored
transaction instead of creating a duplicate — safe to retry after a lost response.

## Side effects worth knowing

Creating or updating an **expense**, importing a CSV file, or creating / lowering a
**budget** re-checks that month's budgets. Crossing 80 % or 100 % of a budget sends a push
notification to the user's registered mobile devices (once per budget and threshold).
