# WALLEX — what is stored about a person (privacy notes)

A factual inventory for whoever runs WALLEX, to build the public privacy policy and the store
questionnaires (App Store "App Privacy", Play "Data safety") from. It describes what the code does;
it is **not legal advice**, and the parts in *[brackets]* are for the operator to fill in.

## Who is responsible

*[Name and contact of the operator (the data controller), the e-mail for privacy requests, the country
the servers are in, the legal basis (usually the contract with the user: providing the app).]*

## What is stored, and why

| Data | Why | Where it comes from |
|---|---|---|
| E-mail, name (optional), password (only a salted hash), language, base currency, sign-up date | The account | The user |
| Categories, transactions, recurring items and subscriptions, budgets, savings goals | The app's purpose | The user (and CSV imports, receipt scans they confirm) |
| Achievements, notifications and their preferences | Features built on the above | Derived by the server |
| Assistant questions and answers | The AI assistant's history | The user's questions; answers are generated |
| Push tokens of the user's phones (Expo) | Delivering notifications | The app, with the user's permission |
| Signed-in devices: platform, browser/app name, IP address of the last refresh | Showing and ending sessions | The request |
| Security log: sign-ins (also failed ones), password and two-factor changes, data downloads, imports, deletions — with IP address and device name | Protecting the account | The request |
| Two-factor secret (encrypted) and recovery-code hashes | Two-factor sign-in | The user, when turned on |

Receipt photos are read in memory and **never stored**; only the fields the user confirms become a
transaction.

## How long

- Account data: until the user deletes the account (below).
- Security log: 365 days; failed sign-ins for an address without an account: 30 days. Ended sessions: 90 days.
  (`python manage.py prune_security_data`, run daily — see `docs/deployment.md`.)
- Backups: *[the operator's backup retention]*; a deleted account disappears from them as they age out.

## Who else sees data

| Recipient | What | Why |
|---|---|---|
| Expo push service | Push token, notification title and text | Delivering notifications to the phone |
| Google (Gemini API) or Anthropic (Claude) — whichever `AI_ASSISTANT_PROVIDER` names, only when the assistant is switched on | The question text and aggregated figures from the user's data (totals, category and merchant names). No e-mail, name or id, which a test enforces — but a question can contain whatever the user types. **Gemini's free tier lets Google use submitted content to improve its products (with human review); the paid tier does not** — real users' data needs the paid tier (see `docs/ai-assistant.md`). | Answering assistant questions |
| European Central Bank | Nothing about the user: WALLEX downloads the public daily rates | Currency conversion |

There are no analytics or advertising services in the apps or the API.

## Cookies and local storage

- The web app's sign-in is one `HttpOnly` cookie holding a refresh token — strictly necessary, set
  only on the API's own domain.
- Browser storage keeps the chosen theme and language. The phone app keeps the session in the
  Keychain / Keystore and a cache of the user's own data for offline use, removed on log-out.

## The person's rights, in the app

| Right | Where |
|---|---|
| Access and portability | **Security → Your data → Download my data** (web), **Settings → Your data** (phone): one JSON file with everything above except secrets (`POST /api/auth/export/`). Every download is entered in the security log. |
| Erasure | **Delete my account** next to it (`POST /api/auth/delete-account/`): the account and everything it owns are removed at once, every device is signed out. It asks for the password, and a code when two-factor sign-in is on. |
| Rectification | Profile, transactions and the rest can be edited in the app. |
| Objection / restriction | Notification categories can be switched off in the settings; other requests go to the operator's privacy e-mail. |

## For the operator before going live

- [ ] Fill in the bracketed parts and publish the policy where the app's sign-up screen can link to it.
- [ ] A data processing agreement with the hosting provider, and with Google (paid Gemini plan, never the free tier) or Anthropic if the assistant is enabled.
- [ ] Decide the backup retention, and write it above.
- [ ] Answer the store questionnaires from the tables above (data types: email, financial info, user content, device identifiers, diagnostics = none).
