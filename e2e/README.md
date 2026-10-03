# Browser tests

A few journeys through the real web app in Chrome, against the real API and database: sign up and
record a transaction, switch to Hungarian (default category names included), download your data,
erase the account. Each test creates its own account and removes it afterwards.

```bash
docker compose up -d && npm --prefix web run dev     # the stack, in one terminal
cd e2e && npm install && npx playwright test        # the tests, in another
```

- Chrome is used as it is installed (`channel: "chrome"`): no browser download.
- Registration is rate limited to 10 per hour per address, and one run signs up four people. After
  a few local runs, `docker compose restart backend` clears the counter (or raise
  `AUTH_REGISTER_RATE` in `backend/.env`). A fresh CI run is not affected.
- `WEB_URL` and `API_URL` point the tests at another stack.
