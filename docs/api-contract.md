# WALLEX API contract — web ↔ mobile ↔ backend

> **The complete endpoint reference is the OpenAPI document** — every endpoint, request, response,
> validation error and status code:
>
> - interactive (Swagger UI, "Try it out"): `http://localhost:8000/api/docs/` while the dev stack runs
>   (in production only with `API_DOCS_ENABLED=True`); raw schema at `/api/schema/`
> - static: [`backend/openapi.yaml`](../backend/openapi.yaml) (open it in any OpenAPI viewer, or import it
>   into Postman / Insomnia)
>
> It is generated from the code (drf-spectacular; per-endpoint docs live in each app's `openapi.py`) and
> `backend/tests/test_openapi.py` validates real responses of every endpoint against it, so it can't go
> stale silently. **If this file and the OpenAPI document disagree, the OpenAPI document is right.**
> After changing an endpoint, regenerate the committed copy:
> `docker compose exec backend python manage.py spectacular --file openapi.yaml` (the tests fail until you do).
>
> This file remains the guide to how the *clients* use the API: shared TypeScript types, service functions,
> and conventions both apps follow.

This is the shared reference for the endpoints both frontends (`web/`, `mobile/`) consume today.
It exists so the two clients never drift from each other or from the actual Django API: when the
backend's shape changes, update this file **and** the mirrored TypeScript types in
`web/src/types/` and `mobile/types/` in the same change.

The backend is the single source of truth for every financial number in this document
(totals, balances, `spent_amount`, `remaining_amount`, `usage_percentage`, category
percentages, ...). **Neither client recomputes or overrides any of them — they are
rendered exactly as the API returns them.**

## Conventions

- Base URL: `${API_BASE_URL}/api` (web: `VITE_API_BASE_URL`, mobile: resolved by
  `utils/apiBaseUrl.ts`). All paths below are relative to that.
- Auth: `Authorization: Bearer <access_token>` on every endpoint in this document (all of them
  require a logged-in user; see **Authentication & account security** for `/api/auth/*`).
- All list/detail responses are scoped to the authenticated user — there is no way to read
  another user's data through any of these endpoints.
- Money fields (`amount`, `total_income`, `total_expenses`, `balance`, `spent_amount`,
  `remaining_amount`, `budget_amount`, ...) are **decimal strings** (e.g. `"49.99"`), never
  JSON numbers — this avoids floating-point rounding on either client. Percentage fields
  (`usage_percentage`, `percentage`) are plain numbers.
- Currencies: a transaction's `amount` is in its own `currency` (EUR, HUF, USD, GBP, JPY,
  CHF; whole numbers for HUF and JPY) and never changes; `base_amount` is its value in the
  user's **base currency** (`GET /api/auth/me/` → `base_currency`). Recurring transactions and
  subscriptions are likewise billed in their own `currency` and never converted. Every other
  money field — analytics, budgets, subscription totals and `base_*` costs — is in the base currency. Format each amount with
  its own currency; the clients never convert (`GET /api/currencies/convert/` previews a
  conversion). The exact rules are in the OpenAPI document.
- Language: every request carries `Accept-Language` (`en` / `hu`; both clients add it in their
  API client). All texts the server writes — error messages, insights, achievement names, the ten
  default category names — come back in that language; notifications use the language saved on
  the account (`language` in `GET /api/auth/me/`, `PATCH` to change it). Field names, error
  `code`s and enum values are never translated, so clients must not match on message text.
- Errors follow DRF's default shape: `{"detail": "..."}` for auth/permission/not-found errors,
  or `{"field_name": ["message"]}` for validation errors. Both clients parse this uniformly via
  `utils/errors.ts` (`extractErrorMessage` / `extractFieldErrors`).
- Multi-device: every device (web, iPhone, Android) reads and writes the same data through
  this API. Responses are never cacheable (`Cache-Control: no-store`); `GET /api/sync/status/`
  tells a device when to reload, and `If-Match` stops a stale edit from overwriting a newer
  one — see **Multi-device sync** below.

## Shared types

These mirror `web/src/types/` and `mobile/types/` field-for-field.

```typescript
export type TransactionType = "income" | "expense";

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  date_joined: string;
}

export interface Category {
  id: number;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
  is_system: boolean;   // seeded default category — read-only
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number;
  amount: string;        // decimal string
  type: TransactionType;
  category: number;      // Category id
  description: string;
  date: string;           // "YYYY-MM-DD"
  client_id: string | null; // UUID; set only for transactions recorded offline (mobile)
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: number;
  category: number | null;  // null = "overall" budget across all categories
  amount: string;
  year: number;
  month: number;             // 1-12
  spent_amount: string;      // computed server-side
  remaining_amount: string;  // computed server-side
  usage_percentage: number;  // computed server-side
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  year: number;
  month: number;
  total_income: string;
  total_expenses: string;
  balance: string;
  transaction_count: number;
  top_spending_category: { category_id: number; category_name: string; amount: string } | null;
  budget_usage: {
    budget_id: number;
    category_id: number | null;
    category_name: string;
    budget_amount: string;
    spent_amount: string;
    remaining_amount: string;
    usage_percentage: number;
  }[];
}

/** DRF's PageNumberPagination envelope — used by the transaction and notification lists. */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface MonthlyDataPoint {
  month: number;
  month_name: string;
  income: string;
  expenses: string;
  balance: string;
}

export interface CategoryBreakdownEntry {
  category_id: number;
  category_name: string;
  amount: string;
  percentage: number;
}
```

---

## `GET /api/transactions/`

Paginated list of the current user's transactions.

**Query params** (all optional):

| Param | Type | Notes |
|---|---|---|
| `type` | `"income" \| "expense"` | exact match |
| `category` | `number` | category id, scoped to the user's own categories |
| `category_name` | `string` | case-insensitive exact match on category name |
| `date_from` | `string` (`YYYY-MM-DD`) | inclusive |
| `date_to` | `string` (`YYYY-MM-DD`) | inclusive |
| `search` | `string` | matches `description` (icontains) |
| `ordering` | `string` | e.g. `date`, `-amount`, `created_at` |
| `page` | `number` | default 1 |
| `page_size` | `number` | default 20, max 100 |

**Response** `200 OK` — `PaginatedResponse<Transaction>`:

```json
{
  "count": 2,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 1,
      "amount": "15.99",
      "type": "expense",
      "category": 4,
      "description": "Netflix subscription",
      "date": "2026-09-10",
      "created_at": "2026-09-21T17:03:30.068712Z",
      "updated_at": "2026-09-21T17:03:30.068724Z"
    }
  ]
}
```

**Client function:** `listTransactions(params?: TransactionListParams): Promise<PaginatedResponse<Transaction>>`
(`services/transactionsService.ts` in both clients).

---

## `POST /api/transactions/`

Creates a transaction owned by the current user. `user` is never accepted from the client — it's
always set server-side from the authenticated request.

**Body:**

```typescript
interface CreateTransactionPayload {
  amount: string;        // required, > 0
  type: TransactionType; // required, must match the category's own type
  category: number;      // required, must be one of the user's own categories
  description?: string;
  date: string;           // required, "YYYY-MM-DD"
  client_id?: string;     // optional UUID idempotency key (mobile offline sync)
}
```

**Idempotency (`client_id`):** the mobile app generates a UUID per new transaction and sends it
with every attempt. If a transaction with the same `client_id` already exists for this user,
the endpoint returns it with **`200 OK`** instead of creating a duplicate — so an offline sync
can safely re-send an item whose earlier attempt reached the server but whose response was
lost. `client_id` is unique per user, can't be changed later (ignored on `PATCH`), and is
optional — the web client never sends it.

**Response** `201 Created` — a `Transaction` (`200 OK` for an idempotent repeat, see above). **Validation errors** `400`:

```json
{"category": ["Invalid pk \"999\" - object does not exist."]}
{"type": ["Transaction type must match the selected category's type."]}
{"amount": ["Ensure this value is greater than or equal to 0.01."]}
```

**Client function:** `createTransaction(payload: CreateTransactionPayload): Promise<Transaction>`.

---

## `PATCH /api/transactions/{id}/`

Partial update of a transaction owned by the current user (404 for any other user's transaction —
ownership is enforced via queryset scoping, not a 403). Same validation rules as create (category
must belong to the user, `type` must match the category's own type, `amount` > 0).

**Body:** `UpdateTransactionPayload` — `Partial<CreateTransactionPayload>` (send only the fields
being changed).

**Response** `200 OK` — the updated `Transaction`. Same `400` shape as create on validation errors.

Send `If-Match: "<updated_at as loaded>"` to make the edit conditional: if the transaction
changed since (another device), the answer is `412` with `{"detail", "current"}` and nothing is
saved. `404` if it was deleted meanwhile.

**Client function:** `updateTransaction(id: number, payload: UpdateTransactionPayload, version?: string): Promise<Transaction>`
(`version` = the loaded `updated_at`, sent as `If-Match`). Used by both clients (web's
Transactions page, mobile's transaction edit screen); on `412` both show the `current` version.

---

## `DELETE /api/transactions/{id}/`

Deletes a transaction owned by the current user (404 for any other user's transaction). No
`PROTECT` relations point at `Transaction` (unlike `Category`), so this never fails with a 409 —
it's always a clean `204 No Content` once ownership/existence checks pass.

Accepts `If-Match` like `PATCH` (`412` = changed on another device, not deleted).

**Client function:** `deleteTransaction(id: number, version?: string): Promise<void>`. Used by both
clients (web's Transactions page — optimistic, the row disappears at once and comes back only if
the server refuses; mobile's transaction details screen). A `404` means another device already
deleted it: both clients treat that as done.

---

## `POST /api/transactions/import/`

Bulk-imports transactions from an uploaded bank CSV file. **Web only** — see
`apps/transactions/services.py` for the full pipeline. Multipart form upload, not JSON.

**Expected CSV format** — these three columns (header names case-insensitive, extra
columns are ignored):

```csv
date,description,amount
2026-09-10,Albert Heijn,-42.50
2026-09-01,Salary,3000.00
```

- `date`: `YYYY-MM-DD`, `DD/MM/YYYY`, or the Hungarian `2026.09.10.` / `10.09.2026`.
- `description`: free text — also used for rule-based category detection (see below).
- `amount`: a **signed** decimal. Negative → expense, positive → income, zero is rejected.
  In a comma-separated file the period is the decimal mark and `,`, spaces and `€`/`$`/`£` are
  stripped as thousands separators. In a **semicolon**-separated file (how Hungarian banks
  export) the comma is the decimal mark (`-12 345,67`, `1.234,56`). A trailing currency code
  (`Ft`, `EUR`) is ignored.

The delimiter (comma, semicolon or tab) is detected from the header line, and the Hungarian
column names (`Dátum`, `Közlemény`, `Összeg`, also `Megjegyzés`, `Partner neve`,
`Tétel összege`) are understood. A Windows-1250 file is decoded correctly for accounts whose
language is Hungarian (otherwise Latin-1 is the fallback after UTF-8).

**Category detection** is rule-based (hardcoded keyword → category name table, e.g. "Albert
Heijn"/"Jumbo" → Food, "Shell" → Transport, "Netflix" → Entertainment): an unmatched **expense**
row falls back to the user's "Other" category; an unmatched **income** row has no fallback
(unlike expenses, there's no generic income catch-all category) and the row **fails**. A future
step could move this to a per-user, DB-backed rule table — this one is deliberately just a flat
list in `services.py` for now.

**Duplicate detection**: a row is skipped (not created, not an error) if a transaction with the
same `(user, date, amount, description)` already exists — checked both against the database and
against earlier rows already processed from the same file.

**Body:** `multipart/form-data` with a single `file` field.

**Response** `200 OK`:

```json
{
  "imported": 42,
  "skipped": 3,
  "failed": 1,
  "details": [
    {"row": 7, "status": "failed", "reason": "Unrecognized date '2026-13-40' (expected YYYY-MM-DD or DD/MM/YYYY)."},
    {"row": 12, "status": "skipped", "reason": "Duplicate of an existing transaction."}
  ]
}
```

`row` is the actual line number in the uploaded file (header = line 1, so the first data row is
line 2) — this is what a user sees when opening the CSV in a text editor or Excel. `details` only
lists skipped/failed rows; successfully imported rows aren't individually listed, only counted.
Fully blank lines are silently ignored (not counted in any bucket).

**File-level validation error** `400` — the whole upload is rejected, no rows are processed:

```json
{"file": ["Missing required column(s): amount."]}
```

**Client function:** `importTransactionsCsv(file: File): Promise<ImportSummary>`.

---

## `GET /api/categories/`

Returns **every** category (system-seeded + custom) belonging to the current user, as a plain
array — **not paginated**, unlike transactions.

**Response** `200 OK` — `Category[]`:

```json
[
  {
    "id": 4,
    "name": "Food",
    "type": "expense",
    "color": "#6366F1",
    "icon": "",
    "is_system": true,
    "created_at": "2026-09-21T17:15:38.103098Z",
    "updated_at": "2026-09-21T17:15:38.103102Z"
  }
]
```

**Client function:** `listCategories(): Promise<Category[]>`.

---

## `GET /api/budgets/`

Returns every budget belonging to the current user, as a plain array — **not paginated**.
`spent_amount`, `remaining_amount`, and `usage_percentage` are recalculated by the backend on
every request from the user's actual transactions for that budget's category/month; they are
never stored values.

**Response** `200 OK` — `Budget[]`:

```json
[
  {
    "id": 1,
    "category": 4,
    "amount": "400.00",
    "year": 2026,
    "month": 9,
    "spent_amount": "320.00",
    "remaining_amount": "80.00",
    "usage_percentage": 80.0,
    "created_at": "2026-09-21T17:25:29.464089Z",
    "updated_at": "2026-09-21T17:25:29.464101Z"
  }
]
```

**Client function:** `listBudgets(): Promise<Budget[]>`.

---

## `GET /api/recurring-transactions/`, `POST`, `PATCH .../{id}/`, `DELETE .../{id}/`

Full CRUD for recurring transaction templates (rent, subscriptions, bills, ...) — a plain array,
**not paginated**, ordered by `next_occurrence_date` ascending. Same ownership scoping as every
other resource (404, not 403, for another user's row).

```typescript
export type RecurringFrequency = "weekly" | "monthly" | "yearly";

export interface RecurringTransaction {
  id: number;
  name: string;
  category: number;
  type: TransactionType;
  amount: string;           // decimal string, in `currency` (as billed)
  currency: CurrencyCode;    // default: the base currency; never converted
  merchant: string;
  frequency: RecurringFrequency;
  start_date: string;        // "YYYY-MM-DD"
  end_date: string | null;
  next_occurrence_date: string; // server-derived, see below — never set this directly
  is_active: boolean;
  is_subscription: boolean;  // read-only: created through /api/subscriptions/
  description: string;
  created_at: string;
  updated_at: string;
}
```

`next_occurrence_date` is **read-only** and server-derived: it's set to `start_date` on create,
and re-derived (reset to the new `start_date`) only when `start_date` itself changes on update —
otherwise untouched. No job currently advances it after generating an occurrence; that (and
actually generating `Transaction` rows / notifications from due recurring items) is a **future**
step — this one is CRUD-only, per the project roadmap.

Validation mirrors `Transaction`: `type` must match the selected category's own type, `amount` >
0, and `end_date` (if set) must be on/after `start_date`.

**Client functions:** `listRecurringTransactions()`, `getRecurringTransaction(id)`,
`createRecurringTransaction(payload)`, `updateRecurringTransaction(id, payload)`,
`deleteRecurringTransaction(id)`. `getRecurringTransaction` is mobile-only so far (its edit
screen re-fetches by id on open); web's edit modal reuses the already-fetched list row instead.


## `/api/subscriptions/` — list, create, detail, `PATCH`, `DELETE`, `GET .../summary/`

A subscription is a recurring **expense** (the same row as above, `is_subscription: true`), so
reminders and insights include it. The resource uses the field names of the subscription
manager: `active` (= `is_active`) and `next_payment_date` (computed from `start_date` and
`frequency`: the next payment on or after today, `null` when paused or ended). Also computed:
`status` (`active` / `paused` / `ended`), `upcoming_payments` (next 3 dates), `monthly_cost` /
`yearly_cost` (in `currency`) and `base_monthly_cost` / `base_yearly_cost` (base currency,
`null` without a recent ECB rate). Plain array, not paginated; active first, then paused, then
ended. `GET /api/subscriptions/summary/` returns `monthly_total`, `yearly_total` (the yearly
projection), counts, `by_category` and the next 30 days' payments — all in the base currency.
`GET /api/analytics/dashboard/` has a `subscriptions` block for the month (`monthly_total`,
`yearly_total`, `due_this_month`, `active_count`).

Types: `web/src/types/subscription.ts` (mirrored in `mobile/types/`); client functions in
`services/subscriptionsService.ts`. Full shapes and validation messages: OpenAPI.

## `/api/savings-goals/` — list, create, detail, `PATCH`, `DELETE`, `deposit/`, `withdraw/`, `summary/`

A savings goal has `name`, `target_amount`, `current_amount`, `currency`, optional
`target_date` and `status`. Both amounts are in the goal's own `currency` (default: the base
currency; it can only change while `current_amount` is 0) and are never converted — not even
when the base currency changes. Goals are not transactions and don't affect budgets or
analytics totals.

- `status`: `completed` is set by the server when `current_amount` ≥ `target_amount` (and
  reverts to `active` below it); clients may send only `archived` (archive) or `active` (restore).
- Computed, read-only: `progress_percentage` (number, may exceed 100 — clamp the bar, not the
  text), `remaining_amount`, `days_left` (negative when overdue), `monthly_needed` (rounded up;
  `null` without a future target date or when not active), `base_current_amount` /
  `base_target_amount` (base currency, `null` without a recent ECB rate).
- **Adding and removing money:** `POST .../{id}/deposit/` and `.../withdraw/` with
  `{"amount": "200.00"}` (in the goal's currency). The server updates the balance under a row
  lock and answers with the updated goal — clients never compute the new balance. Withdrawing
  more than is saved, or moving money in an archived goal, is a `400`.
- `GET /api/savings-goals/summary/`: counts per status plus `total_saved`, `total_target` and
  `progress_percentage` over the goals that aren't archived, in the base currency.
- The list is a plain array: active first, then completed, then archived; nearest target date
  first within each.

Types: `web/src/types/savingsGoal.ts` (mirrored in `mobile/types/`); client functions in
`services/savingsGoalsService.ts`.

## `GET /api/achievements/`, `POST /api/achievements/mark-seen/`

The achievement catalog (seeded by a migration) with the user's progress, in catalog order —
a plain array. The server evaluates it on every `GET`: newly reached milestones are unlocked and
stored (`unlocked_at`), and stay unlocked for good. Each item has `code`, `name`, `title`
(personalized once unlocked, e.g. `Stayed Under Food Budget`), `detail` (`August 2026`, a goal's
name, or `null`), `description`, `icon` (emoji), `category`, `unit` (`count` / `days` / `money`),
`target` and `progress` (decimal strings; money ones in `target_currency`), `progress_percentage`
(0–100), `unlocked`, `unlocked_at` and `is_new` (unlocked, not yet shown).

`POST .../mark-seen/` clears `is_new` for every unlocked achievement and answers
`{"marked": <count>}`. The web client calls it after the Achievements page has shown them; the
dashboard only reads.

Rules live in `backend/apps/analytics/achievements.py` and reuse existing logic: the savings
total of `GET /api/savings-goals/summary/`, the budgets' over-budget rule, `SavingsGoal.reached()`.
Tracking streaks count days a transaction was recorded on (UTC).

Types: `web/src/types/achievement.ts` (mirrored in `mobile/types/`); client functions in
`services/achievementsService.ts`.

---

## `GET /api/analytics/dashboard/`

One-month financial summary for the current user — income/expense totals, balance, transaction
count, the single highest-spending category, and per-budget usage. Every number is computed
server-side (see `apps/analytics/services.py`); this is the endpoint the Dashboard screen in
both clients should call rather than trying to derive the same numbers from a locally-fetched
transaction list.

**Query params** (both optional, default to the current month):

| Param | Type | Notes |
|---|---|---|
| `year` | `number` | 2000–2100 |
| `month` | `number` | 1–12 |

**Response** `200 OK` — `DashboardStats`:

```json
{
  "year": 2026,
  "month": 9,
  "total_income": "3000.00",
  "total_expenses": "400.00",
  "balance": "2600.00",
  "transaction_count": 4,
  "top_spending_category": {"category_id": 4, "category_name": "Food", "amount": "320.00"},
  "budget_usage": [
    {
      "budget_id": 1,
      "category_id": 4,
      "category_name": "Food",
      "budget_amount": "400.00",
      "spent_amount": "320.00",
      "remaining_amount": "80.00",
      "usage_percentage": 80.0
    }
  ]
}
```

`top_spending_category` is `null` when the user has no expenses in that month.

**Validation error** `400` (invalid month/year):

```json
{"month": ["Ensure this value is less than or equal to 12."]}
```

**Client function:** `getDashboard(params?: DashboardParams): Promise<DashboardStats>`.

---

## `GET /api/analytics/monthly/`

Twelve-month income/expense/balance trend for the given year — always all 12 months, zero-filled
for any month with no transactions. Backs the Dashboard's monthly spending chart.

**Query params:** `year` (optional, 2000–2100, defaults to the current year).

**Response** `200 OK`:

```json
{
  "year": 2026,
  "months": [
    {"month": 1, "month_name": "January", "income": "0.00", "expenses": "0.00", "balance": "0.00"},
    {"month": 9, "month_name": "September", "income": "3000.00", "expenses": "400.00", "balance": "2600.00"}
  ]
}
```

**Client function:** `getMonthlyAnalytics(params?: MonthlyAnalyticsParams): Promise<MonthlyAnalytics>`.

---

## `GET /api/analytics/categories/`

Current month's expense-only breakdown by category, sorted by amount descending, with each
category's share of that month's total expenses. Backs both the Dashboard's category pie chart
and its "top categories" list — there is no separate "top categories" endpoint, the client just
takes the first N entries of this (already-sorted) array.

**Query params:** `year`, `month` (both optional, default to the current month).

**Response** `200 OK`:

```json
{
  "year": 2026,
  "month": 9,
  "categories": [
    {"category_id": 4, "category_name": "Food", "amount": "320.00", "percentage": 80.0},
    {"category_id": 5, "category_name": "Transport", "amount": "80.00", "percentage": 20.0}
  ]
}
```

Income categories never appear here (the endpoint only aggregates expense transactions).

**Client function:** `getCategoryAnalytics(params?: CategoryAnalyticsParams): Promise<CategoryAnalytics>`.

---

## `GET /api/analytics/insights/`

Rule-based financial insights for one month (no AI/ML — see `apps/analytics/insights.py`). The
backend produces the finished `message` text plus the underlying `amount`/`percentage`, so
clients only render; they never evaluate the rules themselves.

**Query params:** `year`, `month` (both optional, default to the current month).

**Response** `200 OK` — `InsightsResponse`, sorted by severity (`alert` → `warning` →
`positive` → `info`), empty `insights` array when nothing applies:

```json
{
  "year": 2026,
  "month": 9,
  "insights": [
    {
      "id": "budget_exceeded:3",
      "type": "budget_exceeded",
      "severity": "alert",
      "message": "Shopping exceeded its budget by 20%.",
      "category_id": 7,
      "amount": "20.00",
      "percentage": 120.0
    },
    {
      "id": "category_increase:4",
      "type": "category_increase",
      "severity": "warning",
      "message": "Food spending increased by 14% compared to last month.",
      "category_id": 4,
      "amount": "14.00",
      "percentage": 14.0
    }
  ]
}
```

| `type` | Severity | Rule | `amount` | `percentage` |
|---|---|---|---|---|
| `budget_exceeded` | alert | spent > budget (category or overall) | overspent amount | budget usage % |
| `budget_warning` | warning | budget usage ≥ 80% | remaining amount | budget usage % |
| `overspending` | alert | expenses > income (needs income) | deficit | deficit as % of income |
| `savings` | positive | income > expenses | amount saved | savings rate |
| `category_increase` / `category_decrease` | warning / positive | change vs. previous month ≥ 10% **and** ≥ 10.00; top 3 by absolute change; categories with no spending last month are skipped | absolute change | absolute change % |
| `recurring_share` | warning if ≥ 50%, else info | active recurring **expense** templates normalized to a monthly amount (weekly × 52/12, yearly ÷ 12) vs. the month's income | monthly recurring total | share of income |
| `top_category` | info | highest-spending expense category | category total | share of expenses |

When the requested month is the **current** month, the category comparison uses month-to-date
periods on both sides (1st → today vs. 1st → same day last month); the message then says
"compared to the same period last month". `id` is stable per rule + subject, usable as a list key.
`category_id` is `null` for overall/non-category insights.

**Client function:** `getInsights(params?: InsightsParams): Promise<InsightsResponse>`.

---

## `POST /api/receipts/scan/`

**Mobile only.** Reads a receipt photo and returns *suggested* transaction fields. It never
creates anything: the app shows a confirmation screen and, after the user presses Save,
creates the transaction with the normal `POST /api/transactions/` (with a `client_id`, so it
also works offline-queued). The image is processed in memory and not stored.

**Request:** `multipart/form-data` with an `image` file (JPEG/PNG/WebP, max 10 MB). The app
downsizes photos to ~1800 px JPEG before uploading.

**Response** `200 OK` — `ReceiptScan`. Every field has a `confidence`: `"high"` (found by a
specific rule, e.g. the TOTAL line) or `"low"` (best guess, or `value: null` = not found) —
the app highlights `low` fields for the user to check.

```json
{
  "merchant": {"value": "TESCO Global Aruhazak Zrt", "confidence": "high"},
  "amount":   {"value": "2142.00", "confidence": "high"},
  "date":     {"value": "2026-09-25", "confidence": "high"},
  "currency": {"value": "HUF", "confidence": "high"},
  "unsupported_currency": null,
  "items": [{"name": "KENYER 1 DB", "amount": "549.00"}, {"name": "TEJ 2,8% 1L", "amount": "399.00"}],
  "category": {"id": 186, "name": "Food", "source": "rules"},
  "text_found": true,
  "outcome": "complete"
}
```

`category` is `null` when nothing matches; `source` is `"history"` (the category the user chose
last time for the same merchant) or `"rules"` (keyword rules shared with the CSV import).
`currency` is read from Ft/HUF, €/EUR, $/USD, £/GBP, CHF, ¥/JPY on the receipt (`null` if none —
the app preselects the base currency and flags it); `unsupported_currency` names a currency
printed instead that WALLEX can't record (e.g. `"CZK"`). `items` are the lines above the total,
for display only (the total is never summed from them).

`outcome` tells the app which screen to show: `complete` / `incomplete` → the confirmation
screen (missing fields flagged); `unsupported` (text, but neither a total nor a date — not a
receipt) and `unreadable` (`text_found: false`, blurry/dark photo) → an explanation with retake /
another photo / manual entry (`unsupported` also offers "enter the details anyway").

**Errors:** `400 {"image": [...]}` (missing, too large, not a readable image) ·
`429` (rate limit, default 30 scans/hour per user) · `503 {"detail": ...}` (OCR engine down —
add the transaction manually).

The OCR engine is configurable (`RECEIPT_OCR_PROVIDER`, default self-hosted Tesseract with
`hun+eng`); any class implementing `apps.receipts.ocr.OcrProvider` can replace it.

**Client function (mobile only):** `scanReceipt(photo)` in `mobile/services/receiptService.ts`;
`mobile/utils/receiptProblems.ts` maps every failure (`400`/`413` bad photo, `429`, `503`,
timeout, offline) and the `unsupported` / `unreadable` outcomes to a message and next steps.

---

## Notifications — `/api/notifications/`, `/api/notifications/preferences/`, `/api/devices/`

**The backend decides everything.** `apps/notifications/rules.py` is the only place that
decides whether something is worth a notification and writes its `title` and `body` (amounts
already formatted in the right currency). The clients show the stored text, the read state
and the unread count — they never rebuild a message or apply a threshold themselves.

Every notification is stored once (the in-app inbox, web and mobile alike) and pushed to the
user's phones (mobile only). A kind switched off in the preferences is not created at all.

### Notification kinds

| `kind` | Created when | At most once per | `related_object.type` | `data.screen` |
|---|---|---|---|---|
| `budget_warning` | an expense or budget change brings a budget to ≥ 80% (and ≤ 100%) | budget | `budget` | `budgets` |
| `budget_exceeded` | … above 100% (the warning is skipped if both happen at once) | budget | `budget` | `budgets` |
| `subscription_due` | scheduled: a subscription payment is due within `recurring_reminder_days` | payment | `subscription` | `subscriptions` |
| `recurring_due` | scheduled: any other recurring expense is due within `recurring_reminder_days` | payment | `recurring_transaction` | `recurring` |
| `savings_goal` | money added (or the target lowered) takes a goal past 25 / 50 / 75 / 90 / 100% | goal + milestone | `savings_goal` | `savings_goals` |
| `unusual_spending` | scheduled: a category is ≥ 20% above its usual level by this day of the month | category + month | `category` | `transactions` |
| `monthly_summary` | scheduled, days 1–7: last month's spending and income vs. the month before | month | — | `dashboard` |
| `insight` | scheduled: an `alert`-severity insight other than a budget one (e.g. `overspending`) | insight + month | `category` or — | `dashboard` |

Example texts: *"You've used 82% of your Food budget for September."*, *"Netflix payment
expected tomorrow."*, *"Your Shopping expenses increased by 21% compared to your usual
spending so far this month."*, *"You are €150 away from your Japan trip goal (90% saved)."*,
*"You spent €920.50 and earned €2,000 in August. Spending was 8% lower than in July."*

**Unusual spending** compares this month's spending up to today with the average of the same
days in the previous 3 months (months before the user started tracking don't count; at least
2 are needed). The increase must also be at least 5% of the user's usual monthly spending, so
the rule works the same in euros and forints and ignores big percentages of small amounts.
See `apps/analytics/anomalies.py`.

The scheduled job is `python manage.py send_scheduled_notifications` (idempotent; run
hourly from cron). It evaluates every active user — with or without a phone — and retries
failed push deliveries (up to 3 attempts within 24 h).

### `GET /api/notifications/`

The inbox, newest first, **paginated** like transactions (`page`, `page_size` ≤ 100).
Filters: `is_read=true|false`, `kind=<kind>` (unknown kind → `400`).

```json
{
  "count": 2, "next": null, "previous": null,
  "results": [
    {
      "id": 42,
      "kind": "budget_warning",
      "title": "Budget almost used",
      "body": "You've used 82% of your Food budget for September.",
      "is_read": false,
      "read_at": null,
      "related_object": {"type": "budget", "id": 12},
      "data": {"screen": "budgets", "budget_id": 12, "year": 2026, "month": 9},
      "created_at": "2026-09-27T08:15:02Z"
    },
    {
      "id": 41,
      "kind": "monthly_summary",
      "title": "Your August summary",
      "body": "You spent €920.50 and earned €2,000 in August. Spending was 8% lower than in July.",
      "is_read": true,
      "read_at": "2026-09-01T07:02:44Z",
      "related_object": null,
      "data": {"screen": "dashboard", "year": 2026, "month": 8},
      "created_at": "2026-09-01T06:00:03Z"
    }
  ]
}
```

`related_object` is what the notification is about (`null` for summaries and general
insights). The object may have been deleted since — the notification stays.

### `GET /api/notifications/{id}/`, `PATCH /api/notifications/{id}/`

`PATCH {"is_read": true}` / `{"is_read": false}` — the only writable field; others are
ignored. Marking read again keeps the first `read_at`. `PUT`, `POST` and `DELETE` → `405`:
notifications are only created by the server, and the stored row is what stops the same
event from notifying again. Another user's notification → `404`.

### `GET /api/notifications/unread-count/`, `POST /api/notifications/mark-all-read/`

`{"unread_count": 3}` for the badge; `{"marked": 3}` (how many were unread).

### `GET /api/notifications/preferences/`, `PATCH /api/notifications/preferences/`

One switch per kind; applies to the app and **all** of the user's phones. Created with the
defaults below on first access. `PUT` → `405`.

```json
{
  "budget_warnings": true,
  "budget_exceeded": true,
  "subscription_reminders": true,
  "recurring_reminders": true,
  "savings_goals": true,
  "unusual_spending": true,
  "monthly_summary": true,
  "insights": true,
  "recurring_reminder_days": 2,
  "updated_at": "2026-09-24T17:02:11Z"
}
```

`recurring_reminder_days` (1–7) applies to subscription and other recurring reminders.

### Push devices — `POST /api/devices/`

**Mobile only.** The web client never registers a device, so it never receives push
notifications. Delivery goes through the Expo push service; every push carries `data` with
`kind`, `notification_id`, `screen` and that screen's ids.

Registers the calling app installation for the signed-in user. Idempotent on the token:
re-registering refreshes `last_seen_at` (the app does this on every signed-in launch) and
re-activates the device. A token registered to another user **moves** to the caller (same
phone, different account).

```json
{"expo_push_token": "ExponentPushToken[xxxxxxxx]", "platform": "ios", "name": "Szilárd's iPhone"}
```

`platform` is `ios` or `android`. **Response:** `201 Created` (new) or `200 OK` (existing),
with the `Device`:

```json
{"id": 4, "expo_push_token": "ExponentPushToken[xxxxxxxx]", "platform": "ios", "name": "Szilárd's iPhone",
 "is_active": true, "last_seen_at": "2026-09-24T17:02:11Z", "created_at": "2026-09-24T17:02:11Z"}
```

`400` for a malformed token (`{"expo_push_token": ["Not a valid Expo push token."]}`) or an
unknown platform.

### `GET /api/devices/`, `DELETE /api/devices/{id}/`

List the user's own devices (plain array); delete one (`204`, `404` for another user's).
The app deletes its device on logout and when push is turned off on that phone.

Devices that haven't re-registered for longer than the refresh-token lifetime (7 days) are
not sent to — the session on them can no longer be valid.

**Client functions:** `listNotifications`, `getUnreadNotificationCount`,
`setNotificationRead`, `markAllNotificationsRead`, `getNotificationPreferences`,
`updateNotificationPreferences` in both `web/src/services/notificationsService.ts` and
`mobile/services/notificationsService.ts`; `registerDevice`, `deleteDevice` in mobile only.

---

## Authentication & account security — `/api/auth/*`

The backend decides everything; the clients only store what it hands out. Summary (every
shape is in the OpenAPI document):

### Sessions

Every sign-in is a **session** (one per device). All tokens carry its id (`sid` claim), and
every request checks that the session is still active, so ending a session locks its access
token out on the next request, not after its 15 minutes.

- **Rotation with theft detection:** a refresh token works once. Presenting an already
  replaced one means it was copied, so the whole session is revoked (the thief and the real
  device must both sign in again) and `refresh_token_reused` is logged. A retry of the
  previous token within 30 seconds (a lost response) is accepted.
- **Lifetime:** access 15 min; refresh 7 days of inactivity; the session itself at most
  30 days, then sign in again.
- Tokens carry `iss: "wallex"` and `aud: "wallex-api"`; tokens without a session (issued
  before this version) are refused, so users sign in once after the upgrade.

### Where the refresh token lives

| Client | Refresh token | Access token |
|---|---|---|
| Web | **HttpOnly cookie** `wallex_refresh` (Secure, SameSite=Strict, path `/api/auth/`): send `X-Auth-Transport: cookie` and `withCredentials`; the JSON has only `access` | module memory only; a reload refreshes from the cookie |
| Mobile | JSON body, stored in Keychain / Keystore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) behind the optional biometric lock | memory only |

The cookie is read only together with the `X-Auth-Transport` header (CSRF protection).
Clients send `X-Client-Platform: web | ios | android` at sign-in to label the session.

### Signing in

1. `POST /api/auth/login/` `{email, password}` → `{access, refresh?}`, **or** with 2FA on
   `{"mfa_required": true, "mfa_token": "…", "expires_in": 300}`.
2. `POST /api/auth/login/verify/` `{mfa_token, code}` → tokens. `code` is the 6-digit
   authenticator code or an unused recovery code; each works once.

Wrong credentials → `401 no_active_account` (the same for unknown emails). **Per-account
lock:** after 5 wrong passwords or codes for one email within 15 minutes (from any IP), sign-in
answers `429 {"code": "account_locked", "retry_after": seconds}` with `Retry-After`, even with
the right password, until the oldest failure is 15 minutes old. Per-IP limits apply as well.

### Endpoints

| Endpoint | What it does |
|---|---|
| `POST /api/auth/refresh/` | New pair of the same session (body `{refresh}` for apps, the cookie for browsers); `401 session_ended` = sign in again |
| `POST /api/auth/logout/` | Ends this device's session (body optional); clears the cookie |
| `POST /api/auth/logout-all/` | Ends **every** session of the account → `{"revoked_sessions": n}` |
| `GET /api/auth/sessions/`, `DELETE …/{id}/` | Signed-in devices (`platform`, `user_agent`, `ip_address`, times, `current`); sign one out |
| `POST /api/auth/password/` | `{current_password, new_password}`; signs every **other** device out |
| `GET /api/auth/2fa/` | `{enabled, enabled_at, recovery_codes_left}` |
| `POST /api/auth/2fa/setup/` | `{password}` → `{secret, otpauth_uri}` (not active yet) |
| `POST /api/auth/2fa/confirm/` | `{code}` → turns it on → `{recovery_codes: [10]}`, shown once |
| `POST /api/auth/2fa/disable/`, `…/recovery-codes/` | `{password, code}` |
| `GET /api/auth/security-events/?category=login\|account\|data` | The user's own security log, paginated; `category=login` is the login history |
| `POST /api/auth/export/` | `{password}` → one JSON file (`Content-Disposition: attachment`) with everything stored about the account — except push tokens, session keys and the two-factor secret. `format_version` changes only when the structure does. Recorded in the security log (`data_exported`). |
| `POST /api/auth/delete-account/` | `{password}`, plus `{code}` (authenticator or recovery code) when two-factor is on → `204`. Erases the account and everything it owns, signs every device out, clears the cookie. No undo. |

Password policy: 12–128 characters, not common, not only digits, not similar to the email.
Password and 2FA changes, the data download and the account deletion: 20 per hour per user.
A Hungarian-language registration starts with HUF as its base currency (any other with EUR).

**Client functions:** web `services/authService.ts` (`login`, `verifyMfa`, `logout`,
`logoutEverywhere`) and `services/securityService.ts` (sessions, password, 2FA, log, `downloadMyData`) and `authService.deleteAccount`; mobile
`services/authService.ts` (`login`, `verifyMfa`, `exportMyData`, `deleteAccount`) and `services/session.ts`
(`revokeSession`, `revokeAllSessions`).

---

## Multi-device sync — `GET /api/sync/status/`, `ETag` / `If-Match`

The web app and the phones never keep their own copy of the truth: they all read and write the
same PostgreSQL data through this API, so there is nothing to merge. A device is in sync as soon
as it reloads what changed; the only question is *when*. (Offline mode on mobile — the read
cache and the create-only outbox — is separate and unchanged.)

### `GET /api/sync/status/`

One query, no data downloaded:

```json
{
  "version": "5f0c1e9b2a7d4c38e1aa",
  "server_time": "2026-09-27T14:05:12.861020Z",
  "resources": {
    "transactions": {"count": 128, "last_modified": "2026-09-27T14:05:10.004211Z"},
    "categories": {"count": 11, "last_modified": "2026-09-20T08:11:02.300118Z"},
    "budgets": {"count": 4, "last_modified": "2026-09-01T07:30:45.001922Z"},
    "recurring_transactions": {"count": 6, "last_modified": "2026-09-26T19:02:13.515003Z"},
    "savings_goals": {"count": 0, "last_modified": null}
  }
}
```

- `version` fingerprints all of it (plus the base currency). Reload when it differs from the
  last one seen. A deletion lowers `count`; every other write moves `last_modified`.
- Timestamps are the server's (`updated_at`, set by Django). Never compare them with a device
  clock.
- Reads never change it (tested for every list, analytics and achievements endpoint), so clients
  can't end up reloading in a loop.

**When the clients ask:**

| | Web (`hooks/useSync.tsx`) | Mobile (`hooks/useSync.tsx`) |
|---|---|---|
| Start | before the page's views load | before the screens load (also if started in the background) |
| Polling | every 30 s while the tab is visible | every 30 s while in the foreground and online |
| Coming back | tab visible / window focus / `online` | app to foreground / connection back |
| Own writes | right after every successful POST/PATCH/DELETE (`services/localWrites.ts`) | same |

On a change, every mounted view reloads **in the background** (`useAsyncData` → `revalidate`):
the old data stays on screen until the new data arrives, and unchanged data keeps its identity
(no re-render). A view that loaded after the change was detected skips the reload. Edit forms
opt out (`useAsyncData(fetcher, { live: false })` on mobile, a snapshot on web). They keep the
version the user started from.

### `ETag` / `If-Match` (optimistic concurrency)

Transactions, categories, budgets, recurring transactions, subscriptions and savings goals:

- `GET`/`PATCH` on an object answers with `ETag: "<updated_at>"`, the same value as in the body.
- `PATCH`/`PUT`/`DELETE` may send `If-Match: "<updated_at as loaded>"`. If the object has
  changed since, the answer is `412 Precondition Failed`, nothing is written, and the body
  includes the object as it is now:
  `{"detail": "This transaction was changed on another device after you loaded it. …", "current": {…}}`.
- The check and the write run in one transaction with the row locked, so two devices saving
  the same version at the same moment can't both succeed. `*` and weak tags (`W/"…"`) are
  accepted. Without the header the last write wins, as before.
- CORS allows the `If-Match` request header and exposes `ETag`.

The clients use it for transaction edits and deletes (web and mobile).

### No HTTP caching

Every `/api/` response carries `Cache-Control: max-age=0, no-cache, no-store, must-revalidate,
private` (`apps/common/middleware.py`). No browser, phone HTTP stack or proxy may hand one device
an old copy of data another device changed, and financial data isn't written to disk caches.
The mobile offline cache never stores `/sync/status/`, since an old answer would hide real
changes.

**Client functions:** `getSyncStatus()` in `services/syncService.ts` (both clients); `ifMatch()` in
`services/concurrency.ts`; `isConflict()`, `conflictCurrent()`, `isNotFound()` in `utils/errors.ts`.

---

## Client consistency

Both `web/src/services/` and `mobile/services/` implement this contract with the same file
names, function names, and signatures (`transactionsService.ts`, `categoriesService.ts`,
`budgetsService.ts`, `analyticsService.ts`), each a thin wrapper around the shared `apiClient`
axios instance (JWT attached automatically, 401 triggers the shared refresh-token flow). A
developer moving between the two codebases should find the same function under the same name
doing the same thing — the only difference is the underlying HTTP client's platform (browser
`localStorage` vs. `expo-secure-store` for tokens), never the API shape.

**Known asymmetry:** `web/src/services/transactionsService.ts` additionally exports
`updateTransaction`/`deleteTransaction` (backing the web Transactions page's edit/delete flows).
`mobile/services/transactionsService.ts` intentionally does **not** mirror these yet — the mobile
app has no edit/delete UI, and an unused exported function is dead code. Add them to the mobile
service, matching this same signature, whenever a mobile edit/delete screen is actually built.

This document and the type files are intentionally **not** shared via a monorepo package: `web/`
(Vite) and `mobile/` (Metro/Expo) resolve modules differently enough that cross-package imports
would add real bundler-configuration risk for little benefit at this project's size. Consistency
is instead enforced by convention — keep the type files and this document in sync by hand
whenever the backend contract changes.
