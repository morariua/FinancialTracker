# FinTracker

A multi-user personal finance tracker. Track transactions, set monthly budgets,
allocate income across categories with proven strategies (50/30/20), watch
upcoming bills, and receive alerts when budgets run low or money is short.

Stack: **Express + TypeScript + SQLite** API and **React + Vite + Tailwind +
Recharts** SPA. Designed to be small enough to self-host and secure enough to
trust with real data.

## Features

- Secure signup / login (bcrypt + JWT access tokens + rotating refresh tokens)
- Per-user data isolation, account lock after repeated failed logins, audit log
- Manual transactions, CSV bank statement import, Plaid sandbox link
- Categories, monthly budgets, auto-allocation (50/30/20)
- Bills with due-day tracking and "mark paid" flow that posts a transaction
- Alerts: low budget, over-budget, low monthly funds, upcoming bills, overdue
- Dashboard with daily spend, category split, six-month trend, balances
- Dark UI, responsive layout, keyboard-friendly modals
- Background scheduler re-evaluates alerts every 15 minutes

## Quick start

### Backend

```bash
cd backend
cp .env.example .env   # edit JWT secrets if running in production
npm install
npm run dev            # http://localhost:4000
npm test               # 34 integration tests
```

### Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 (proxies /api -> :4000)
```

Open [http://localhost:5173](http://localhost:5173), create an account, set
your monthly income in **Settings**, then **Auto-allocate** budgets and start
tracking. Use **Accounts → Link bank** to provision sandbox accounts for a
quick demo.

## Security notes

- Passwords hashed with bcrypt (cost 12). Minimum 10 chars, mixed case + digit.
- Access tokens are short-lived JWTs (15 min). Refresh tokens are rotated on
  every use; reusing a previously rotated refresh token revokes the chain.
- Helmet, CORS allowlist, JSON body limit, and per-route rate limits.
- Every query parameterised; user data scoped by `user_id` on every read/write.
- Plaid access tokens encrypted at rest with AES-256-GCM derived from
  `JWT_SECRET`.
- `JWT_SECRET` must be ≥32 chars in production and required (`NODE_ENV=production`).

## Connecting real bank transactions

The system links real-bank transactions through **Plaid**, the same network
used by Venmo, Robinhood and Coinbase. Set `PLAID_CLIENT_ID` and `PLAID_SECRET`
in `backend/.env` and the `/api/plaid/link-token` and `/api/plaid/sync`
endpoints become live; the frontend swaps the sandbox button for the official
Plaid Link UI.

Without Plaid keys you can still:

- Import CSV statements from any major bank
- Manually enter transactions on phone or web
- Provision sandbox accounts for testing

## Project layout

```
backend/        Node 22 + Express 4 + better-sqlite3
  src/
    config/     env loading
    db/         schema migrations
    middleware/ auth, error, rate limit
    routes/     auth, transactions, budgets, bills, alerts, dashboard…
    services/   business logic (auth, alerts)
    jobs/       cron schedulers
    tests/      black-box test runner (npm test)
frontend/       React 18 + Vite 5 + Tailwind + Recharts + Zustand
  src/
    api/        axios client with auto-refresh
    components/ Layout, Modal
    pages/      LoginPage, DashboardPage, BudgetsPage, …
    store/      auth store
```

## Scaling notes

- SQLite suffices for thousands of users; switch the `db/database.ts` driver to
  Postgres (`pg`) or MySQL with no schema changes for higher concurrency.
- The alerts scheduler is per-process. Run a single worker, or move the cron to
  an external scheduler (cron / Cloud Scheduler) and call
  `/api/alerts/evaluate` per user.
- The frontend bundle is a single SPA; serve `frontend/dist` from any static
  CDN and point `VITE_*` to your API origin.

## Running on a fresh machine

```bash
git clone <repo> && cd FinancialTracker
( cd backend && npm i && cp .env.example .env && npm run dev ) &
( cd frontend && npm i && npm run dev ) &
```

Then visit http://localhost:5173.
