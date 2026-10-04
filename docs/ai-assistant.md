# AI finance assistant

A chat (web, iOS and Android — one API) that answers questions about the signed-in user's **own**
WALLEX data: *"Where did I spend the most this month?"*, *"Am I over budget?"*, *"Which
subscriptions am I paying for?"*. Answers can carry small **insight cards** (key figures) and offer
**follow-up questions**.

The model is a replaceable *provider* behind the Django API: **Google Gemini** by default, Claude
optionally. The API key lives on the server only.

## How it works

```
React (web) ─┐                                             ┌─ PostgreSQL
             ├─▶ Django REST API ─▶ engine ─▶ AI provider ─┤   (via the existing analytics,
React Native ┘   (JWT: request.user)    │      (Gemini /   │    budget, subscription and
 (Expo)                                 │       Claude)    │    savings services)
                                        ▼                  │
                                 tools (read-only) ◀───────┘
```

1. The app sends **only the question text** (`POST /api/assistant/conversations/`). Who is asking
   comes from the access token (`request.user`); a `user_id`, e-mail or conversation id in the body
   is ignored (tested).
2. The engine (`apps/analytics/assistant/engine.py`) sends the conversation to the configured
   provider together with seven **read-only tools** (monthly spending, spending by category, by
   merchant, budget status, subscription costs, savings progress, month comparison).
3. When the model wants data it calls a tool. The tool validates its arguments, runs the **same
   services the dashboard uses** — always for the signed-in user — and returns **aggregated
   figures** (no ids, name, e-mail or individual transactions). **Python and PostgreSQL calculate
   every number; the model only explains them.**
4. The answer is stored (text only — never the figures the tools returned) and returned with
   `sources` (which tools it used), `insights` and `suggested_questions`.

### Insight cards and follow-up questions

Both are **deterministic** (`apps/analytics/assistant/cards.py`): cards are built from the figures
the tools returned for *this* answer (largest category, spending change vs. the previous month,
exceeded budget, subscription total, savings progress, …), follow-ups from the tools the answer
used. The model never writes them, so a card can't disagree with the data, and they cost no extra
model call. Cards carry data (`amount`, `currency`, `percentage`, `tone`); the API writes
`label`/`detail` in the reader's language and the apps format money with their existing currency
utilities.

### How this relates to the original task description

The project already had an assistant (built on Claude). It was **extended**, not rebuilt:

| Task description | What exists |
|---|---|
| `apps/ai/` with providers, services, prompts | `apps/analytics/assistant/` — `providers/{base,gemini,anthropic}.py`, `engine.py`, `tools.py`, `cards.py`, `prompts.py`, `conversations.py` (no new Django app: the assistant's models already live in `analytics`) |
| `AIProvider` / `GeminiProvider` | `providers.AIProvider` (`generate_response`), `GeminiProvider`, `AnthropicProvider`; `AI_ASSISTANT_PROVIDER` picks one |
| `POST /api/ai/chat/`, `/api/ai/conversations/…` | The existing, tested contract was kept: `POST /api/assistant/conversations/` (new conversation), `POST /api/assistant/conversations/{id}/messages/` (follow-up), `GET/DELETE /api/assistant/conversations/{id}/`, `GET /api/assistant/conversations/`, `GET /api/assistant/` (status + suggestions) |
| `FinancialContextBuilder` | The **tools** are the context builder: the model asks for exactly the month/category/budget it needs and gets Python-calculated aggregates, instead of one fixed snapshot in every prompt |
| `AIConversation` / `AIMessage` | `AssistantConversation` / `AssistantMessage` (+ `insights`, `suggested_questions`) |
| `{"error": {"code", "message"}}` | The API's existing error shape: `{"detail": "…", "code": "assistant_unavailable"}` |
| AI transaction categorization | **Not implemented** (marked optional; it would touch the transaction flow) |

## Gemini setup

1. Create an API key at <https://aistudio.google.com/apikey>.
2. Put it in `backend/.env` (local) or your host's secret manager (production):
   ```
   GEMINI_API_KEY=your-key
   ```
   Nothing else is required: the provider defaults to Gemini and the model to `gemini-3.8-flash`.
3. Restart the backend. `GET /api/assistant/` now answers `"available": true`.

> **Privacy — read before using real data.** Google's terms for the **free** Gemini API tier allow
> it to use submitted content (prompts and answers) to improve its products, including human review,
> and ask developers not to send personal or confidential information. The **paid** tier does not use
> it that way. WALLEX sends questions and aggregated figures (totals, category/merchant/goal names),
> never name, e-mail or ids — but category and merchant names are the user's own text. Use the free
> tier for development and demos with test data; use a paid plan (and update `docs/privacy.md`) before
> real users' data goes through it.

### Models

`AI_ASSISTANT_MODEL` takes any Gemini model name that supports function calling. At the time of
writing Google's model list names `gemini-3.8-flash` (the default here) and the cheaper
`gemini-3.5-flash-lite`. Model names change: if the log shows
`Assistant: model API answered 404 NOT_FOUND`, check the current names at
<https://ai.google.dev/gemini-api/docs/models>.

### Using Claude instead

```
ANTHROPIC_API_KEY=your-key
AI_ASSISTANT_PROVIDER=anthropic     # optional when it is the only key that is set
```

## Environment variables (backend only)

| Variable | Default | Meaning |
|---|---|---|
| `GEMINI_API_KEY` | — | Turns the assistant on with Gemini. **Secret.** |
| `ANTHROPIC_API_KEY` | — | Turns it on with Claude. **Secret.** |
| `AI_ASSISTANT_PROVIDER` | `gemini` (`anthropic` if only the Claude key is set) | `gemini` or `anthropic`. An unknown value stops the server at start-up. |
| `AI_ASSISTANT_MODEL` | `gemini-3.8-flash` / `claude-opus-5` | Model name. |
| `AI_ASSISTANT_EFFORT` | `low` / `medium` | Reasoning effort. Gemini: `minimal`, `low`, `medium`, `high` (empty = the model's default). |
| `AI_ASSISTANT_MAX_TOKENS` | `16000` | Longest answer of one model call, thinking included. |
| `AI_ASSISTANT_TIMEOUT` | `90` | Seconds one answer may take in total (all model calls and tool rounds). |
| `AI_ASSISTANT_RATE` | `30/hour` | Questions per user (DRF throttle scope `assistant`; `ASSISTANT_RATE` still works). |
| `AI_ASSISTANT_MAX_QUESTION_LENGTH` | `1000` | Characters per question. |
| `AI_ASSISTANT_HISTORY_MESSAGES` | `20` | Earlier messages sent along with a new question. |
| `AI_ASSISTANT_MAX_MESSAGES` | `50` | Messages per conversation (questions + answers); then a new chat starts. |

Hard limits in code: at most 5 tool rounds per answer, 5 categories in a monthly summary, 50 listed
subscriptions or goals, one retry on a Google-side 5xx.

## Local development

```
React (npm run dev) ─▶ http://localhost:8000/api ─▶ Gemini API
Expo (phone/emulator) ─▶ http://<LAN-IP>:8000/api ─▶ Gemini API
```

1. `backend/.env`: add `GEMINI_API_KEY=…` (see `backend/.env.example`), then `docker compose up`.
   Run `docker compose exec backend python manage.py migrate` once (the new
   `analytics.0004_assistantmessage_insights` migration).
2. Web: `web/.env` keeps `VITE_API_BASE_URL=http://localhost:8000/api` — no AI variable.
3. Mobile: `mobile/.env` — only the API address, never a key:
   - iOS simulator: `localhost` works (`EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api`).
   - Android emulator: `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000/api`.
   - A physical phone with Expo Go: nothing to set (the app finds the dev machine through Expo's
     dev-server address), or `http://<your-computer-LAN-IP>:8000/api` if it doesn't. Phone and
     computer must be on the same Wi-Fi, and the firewall must allow port 8000.
4. Open **Assistant** in the web app (`/assistant`) or the phone's Assistant tab.

## Production

The browser and the phone only ever talk to the Django API. Neither gets the Gemini key.

**Render (API)** — `render.yaml` asks for `GEMINI_API_KEY` when the Blueprint is created (or add it
under *Environment*; redeploy). Optional: `AI_ASSISTANT_MODEL`, `AI_ASSISTANT_RATE`. The rest of
the variables are in `docs/deployment.md`.

**Vercel (web)** — build variable:

```
VITE_API_BASE_URL=https://<your-api>.onrender.com/api
```

and on Render `CORS_ALLOWED_ORIGINS=https://<your-web-domain>` (https only). **Never** add
`GEMINI_API_KEY` to Vercel: anything starting with `VITE_` ends up in the browser bundle.

> **Check before demoing from Vercel:** the web app keeps its refresh token in an HttpOnly cookie
> with `SameSite=Strict`. A page on one site (`*.vercel.app`) calling an API on another
> (`*.onrender.com`) is a cross-site request, and browsers don't send Strict cookies on those — as far
> as the code shows, a reload would then sign the user out. The setup this project was built and tested
> for is the same-origin one (`docs/deployment.md` §8: the web server proxies `/api`). On Vercel the
> equivalent is a rewrite of `/api/*` to the Render service with `VITE_API_BASE_URL=/api`. This is not
> specific to the assistant and has not been tried on Vercel.

**Expo (mobile)** — EAS environment variable (it is the only one the app reads):

```
npx eas-cli@latest env:set --name EXPO_PUBLIC_API_BASE_URL --value https://<your-api>.onrender.com/api \
  --environment production --visibility plaintext
```

Release builds refuse non-https URLs. Never put a key in an `EXPO_PUBLIC_*` variable: they are
readable in the app bundle. See `docs/mobile-release.md`.

## API

All endpoints require a signed-in user (`Authorization: Bearer <access token>`), like every other
endpoint. Full schema: `backend/openapi.yaml` (Swagger UI at `/api/docs/` when enabled).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/assistant/` | `available`, up to 6 suggested first questions (picked from the user's data), `max_question_length` |
| `POST` | `/api/assistant/conversations/` | Ask in a **new** conversation |
| `POST` | `/api/assistant/conversations/{id}/messages/` | Ask a **follow-up**; earlier messages (server-side) give "that" its meaning |
| `GET` | `/api/assistant/conversations/` | The user's conversations, newest first (paginated) |
| `GET` | `/api/assistant/conversations/{id}/` | One conversation with all messages |
| `DELETE` | `/api/assistant/conversations/{id}/` | Delete it (on every device) |

Request: `{"message": "Where did I spend the most this month?"}` — nothing else is read.

Response (`201`):

```json
{
  "conversation": {"id": 5, "title": "Where did I spend the most this month?", "created_at": "…", "updated_at": "…"},
  "messages": [
    {"id": 17, "role": "user", "content": "Where did I spend the most this month?", "sources": [], "insights": [], "suggested_questions": [], "created_at": "…"},
    {
      "id": 18, "role": "assistant",
      "content": "You spent the most on **Food**: €412.30 this month, 38% of your €1,085.10 expenses.",
      "sources": [{"tool": "get_monthly_spending", "label": "Monthly spending", "detail": "September 2026"}],
      "insights": [
        {"type": "largest_category", "label": "Largest category", "detail": "Food", "amount": "412.30", "currency": "EUR", "percentage": 38.0, "tone": "neutral"}
      ],
      "suggested_questions": ["How much did I spend on Food last month?", "How does that compare to the previous month?"],
      "created_at": "…"
    }
  ],
  "usage": {"input_tokens": 2310, "output_tokens": 164}
}
```

Errors (never a traceback, never a key, never the provider's own message):

| Status | Body | When |
|---|---|---|
| `400` | `{"message": ["…"]}` | empty, missing or too long question; a full conversation (`non_field_errors`) |
| `401` | `{"detail": "…"}` | not signed in |
| `404` | `{"detail": "Not found."}` | a conversation that doesn't exist **or belongs to someone else** |
| `429` | `{"detail": "Request was throttled…"}` | over `AI_ASSISTANT_RATE` (reading is not limited) |
| `503` | `{"detail": "…", "code": "assistant_unavailable"}` | provider down, quota used up, timeout, invalid key or model name — nothing is stored, the question can be sent again |
| `503` | `{"detail": "…", "code": "assistant_not_configured"}` | no key for the chosen provider |

The assistant is an add-on: when it is down, transactions, budgets, analytics and sign-in are
unaffected.

## Security

- **Authorization is the token, nothing else.** Every query behind a tool is scoped to
  `request.user`; conversations are fetched with `user=request.user` (another user's conversation is
  a `404`, whether read, asked in or deleted).
- **Minimal data to the provider:** the question, the conversation text, and aggregated tool
  results. A test fails if the user's e-mail, username or name appears in anything sent.
- **The model can't change anything** (tools only read) and can't be talked into other users' data
  (there is no tool that takes a user).
- **Prompt injection:** names in tool results are labelled as data, not instructions; the system
  prompt forbids revealing instructions, tools, keys or internals.
- **Keys:** read from the environment into `settings`, sent in a request header by the SDK, never
  returned by the API, never logged (a test checks the error log doesn't contain the key or the
  provider's error text).
- **Cost:** rate limit per user, question length, history length, conversation size, output
  tokens, total time per answer, tool rounds — all above.

## Adding another provider

1. Subclass `AIProvider` (`providers/base.py`): translate `generate_response(system, messages,
   tools, allow_tools, timeout)` to the vendor API and return a `ModelResponse`; turn every vendor
   error into `AssistantError`.
2. Register it in `PROVIDERS` (`providers/__init__.py`) and `AI_PROVIDER_DEFAULTS` (settings).
3. Test it like `test_assistant_providers.py` does for Gemini.

## Tests

```bash
docker compose exec -T backend python -m pytest apps/analytics tests/test_ai_settings.py
cd web && npx vitest run src/pages/AssistantPage.test.tsx --pool=threads --maxWorkers=2
cd mobile && npx jest __tests__/assistant --maxWorkers=2
```

What is covered: provider selection and settings; Gemini request/response mapping, thought
signatures, parallel tool calls, safety blocks, every failure class; the real Gemini SDK talking HTTP
to a local stand-in server (the wire format); the engine against a neutral provider; cards and
follow-ups; the API (authentication, ownership, `user_id` ignored, limits, rate limit, errors,
Hungarian); the UI on web and mobile (cards, follow-ups, loading, errors, offline).

**What is not covered:** a real call to Gemini. No test and no development session had an API key, so
the model's behaviour (does it call the right tool, are its answers good, does Google accept every
request field for your chosen model) is unverified until you try it once with a key. A few questions
from the list in the task description are a good first check.

## Troubleshooting

| Symptom | Look at |
|---|---|
| App says the assistant "isn't set up" | `GEMINI_API_KEY` missing on the server, or `AI_ASSISTANT_PROVIDER` names the other provider |
| "temporarily unavailable" on every question | the backend log: `Assistant: model API answered 400/403/404 …` = key, permissions or model name; `unreachable or misconfigured (…)` = network or SDK |
| "busy right now" | `429`: the Gemini quota (free-tier limits are low) — wait or use a paid plan |
| Answers are slow | lower `AI_ASSISTANT_EFFORT` (`minimal`), or use a lighter model |
