# Spendly API contract — web ↔ mobile ↔ backend

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
  require a logged-in user; see the auth-flow steps for `/api/auth/*`).
- All list/detail responses are scoped to the authenticated user — there is no way to read
  another user's data through any of these endpoints.
- Money fields (`amount`, `total_income`, `total_expenses`, `balance`, `spent_amount`,
  `remaining_amount`, `budget_amount`, ...) are **decimal strings** (e.g. `"49.99"`), never
  JSON numbers — this avoids floating-point rounding on either client. Percentage fields
  (`usage_percentage`, `percentage`) are plain numbers.
- Errors follow DRF's default shape: `{"detail": "..."}` for auth/permission/not-found errors,
  or `{"field_name": ["message"]}` for validation errors. Both clients parse this uniformly via
  `utils/errors.ts` (`extractErrorMessage` / `extractFieldErrors`).

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

/** DRF's PageNumberPagination envelope — only the transaction list uses it. */
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
}
```

**Response** `201 Created` — a `Transaction`. **Validation errors** `400`:

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

**Client function:** `updateTransaction(id: number, payload: UpdateTransactionPayload): Promise<Transaction>`.
Used by both clients (web's Transactions page, mobile's transaction edit screen).

---

## `DELETE /api/transactions/{id}/`

Deletes a transaction owned by the current user (404 for any other user's transaction). No
`PROTECT` relations point at `Transaction` (unlike `Category`), so this never fails with a 409 —
it's always a clean `204 No Content` once ownership/existence checks pass.

**Client function:** `deleteTransaction(id: number): Promise<void>`. Used by both clients (web's
Transactions page, mobile's transaction details screen).

---

## `POST /api/transactions/import/`

Bulk-imports transactions from an uploaded bank CSV file. **Web only** — see
`apps/transactions/services.py` for the full pipeline. Multipart form upload, not JSON.

**Expected CSV format** — exactly these three columns (header names case-insensitive, extra
columns are ignored):

```csv
date,description,amount
2026-09-10,Albert Heijn,-42.50
2026-09-01,Salary,3000.00
```

- `date`: `YYYY-MM-DD` or `DD/MM/YYYY`.
- `description`: free text — also used for rule-based category detection (see below).
- `amount`: a **signed** decimal. Negative → expense, positive → income, zero is rejected.
  Period is the decimal separator; `,`, spaces, and `€`/`$`/`£` are stripped as thousands
  separators (a comma-as-decimal-separator CSV will parse wrong — not currently detected).

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
  amount: string;           // decimal string
  frequency: RecurringFrequency;
  start_date: string;        // "YYYY-MM-DD"
  end_date: string | null;
  next_occurrence_date: string; // server-derived, see below — never set this directly
  is_active: boolean;
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
