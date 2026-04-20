# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**Econova** is a multiplayer financial simulation platform used in academic/classroom settings. Teams trade assets, offer loans, bid in auctions, and navigate market shocks — while admin tracks behavioral data for research.

**Roles**: `ADMIN` (controls simulation, has 1T cash), `SUB_ADMIN` (approvals only), `TEAM` (players), `BANKER` (bailouts + short lending), `AI_AGENT` (market-maker bots).

## Development Commands

### Backend (FastAPI)
```bash
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev        # dev server → localhost:5173, proxies to localhost:8000
npm run build      # production build → frontend/dist/
npm run lint       # ESLint
```

### E2E Tests (Playwright)
```bash
cd tests
npm install
npx playwright test                        # all 58 specs
npx playwright test specs/01-login.spec.js # single spec
npx playwright show-report report/         # view HTML report
```
Tests run against the production Vercel URL (`mu-aeon-econova-biddingwars.vercel.app`) with `workers: 1` (serialized) — never set workers > 1 as it saturates the Render backend.

## Architecture

### Backend (`backend/`)
| File | Purpose |
|------|---------|
| `main.py` | All 90+ FastAPI route handlers, grouped by domain. Also defines Pydantic request bodies and rate-limiting. |
| `engine.py` | `MarketEngine` class — `step_quarter()`, auction lot lifecycle, trade execution, bot logic. |
| `models.py` | All ~22 SQLModel table definitions. Source of truth for DB schema. |
| `auth.py` | JWT creation/verification. Dependency injectors: `get_current_user`, `get_current_admin`, `get_active_user` (rejects frozen users), `get_current_banker`, `get_banker_or_admin`, `get_approver` (admin + sub_admin + banker). |
| `database.py` | Engine setup (SQLite locally, PostgreSQL in prod). Additive schema migrations via `ALTER TABLE` — add new columns here, never drop. |
| `activity_logger.py` | Research data capture: logs every user action with market context JSON. |
| `admin_tools.py` | Price nudging, credential management, CSV export for research. |

### Frontend (`frontend/src/`)
| Path | Purpose |
|------|---------|
| `services/api.js` | Single Axios client, 100+ named exports, `connectRealtime()` (SSE→WebSocket fallback). Base URL auto-detects Render/Vercel vs localhost. |
| `pages/Dashboard.jsx` | Main app shell for team/admin. Contains ALL admin panel logic, sidebar tab routing, SSE event handling, and sound/toast notifications. |
| `pages/Login.jsx` | Auth + research consent flow + team leader info collection. |
| `pages/SubAdminDashboard.jsx` | Approvals-only UI for sub-admin role. |
| `components/` | Feature components mounted by Dashboard tabs. |

**Logo files used everywhere**: `assets/ip.png` (university), `assets/image.png` (club). Don't use `univ_logo_clean.png` or `club_logo_clean.png`.

### Real-Time
1. **SSE** at `GET /events` with 25s heartbeat — primary channel
2. **WebSocket** at `/ws` — exponential backoff fallback (3s → 30s)
3. Key broadcast actions: `market_update`, `auction_update`, `bid_placed`, `loan_pending`, `news_update`, `leaderboard_toggled`, `interest_rate_changed`, `sentiment_changed`

All SSE messages hit `fetchData()` in Dashboard which refreshes the full market state.

## Database

- **Local**: SQLite `econova_v4.db` (auto-created on first run)
- **Production**: PostgreSQL via `DATABASE_URL` env var
- **Schema changes**: Add a tuple `("table", "column", "SQL_TYPE DEFAULT x")` to the migrations list in `database.py:_run_migrations()`. SQLModel `create_all()` handles new tables; ALTER TABLE handles new columns in existing tables.
- **JSON columns**: Use `sa_column=Column(JSON)` in models; stored as TEXT in SQLite, JSONB in PostgreSQL.

## Key Domain Concepts

### Simulation Lifecycle
`POST /admin/next-quarter` → `engine.step_quarter()` → price updates (see pricing model below) → interest accrual → shock progression → news generation. `POST /admin/next-turn` = 4 quarters.

### Pricing Model (engine.py `step_quarter`)
Prices use a multi-factor model. All improvements apply quarterly:
- **CAGR component**: `base_cagr + interest_rate_delta` × sentiment multiplier
- **Shock factor**: asset-specific multipliers for INFLATION/RECESSION/WARNING/RECOVERY
- **Mean reversion**: pulls toward 4-quarter rolling average
- **Momentum**: 15% carry of last quarter's return (capped ±3%)
- **Micro events**: `ActiveEvent` table, triggered probabilistically at Q1 each year
- **F — Fat-tail noise**: t-distribution (df=4) instead of Gaussian for realistic extreme moves
- **E — Interest rate environment**: `MarketState.global_interest_rate` (LOW/NEUTRAL/HIGH) shifts CAGRs: HIGH → REITS −8%, NVDA −5%, TBILL +2%, GOLD +2%
- **A — Cross-asset correlation**: GOLD↔BRENT +0.2, NVDA↔REITS +0.15, dampened during shocks
- **G — Herd sentiment**: ≥3 distinct teams selling same asset → −1.5% quarterly drag + auto-news
- **B — sqrt trade impact**: `min(0.30, 0.05 × √qty)` in `execute_trade`
- **D — REITS dividends**: 0.5%/quarter (varies with interest rate level) paid to all holders each step

### Auction System
`engine.LOT_CONFIGS` defines default lot sizes. Per-asset custom configs stored in `MarketState.auction_config` JSON. Flow: admin opens → lots created (skipping already-SOLD lot numbers) → each lot activated → bids placed (per unit price) → admin resolves → repeat → admin ends (remaining PENDING/ACTIVE lots → CANCELLED). SOLD lots persist across re-openings; only game reset wipes them.

### Auto-News on Price Nudge
`POST /admin/price/nudge` auto-generates and broadcasts news when change ≥ 0.5%. Templates stored in `MarketState.auto_news_config` JSON; built-in defaults in `_DEFAULT_AUTO_NEWS` dict in `main.py`. Configurable via `GET/POST /admin/auto-news/config`.

### Loan/Credit System
Peer-to-peer: lender offers → borrower accepts → queued for admin/sub-admin approval → quarterly interest auto-accrues. Missed payments trigger escalating warnings (not auto-freeze). Interest rate capped at 50%/quarter.

### Mortgage
Team pledges asset collateral for 80% LTV. Interest rate is **per-quarter**. Maturity countdown in quarters. Default → lender seizes collateral.

### Shock Mechanics
`MarketState.shock_stage`: `NORMAL → WARNING → CRASH → RECOVERY`. Admin triggers via `POST /admin/trigger-shock`. Per-asset shock multipliers in `engine.py`.

### Account Freezing
`get_active_user` blocks frozen users from all action endpoints. Frozen users can still read data and repay loans (uses `get_current_user` intentionally).

### Sub-Admin Role
Access only the approvals endpoints (`get_approver` dependency). Routes to `/subadmin` after login. Only handles mortgage, loan, and trade approval queues.

### Research Data
Every user action is logged to `ActivityLog` with market context. `ConsentRecord` tracks GDPR consent. `TeamLeaderInfo` stores demographics. Exportable via CSV endpoints in `admin_tools.py`.

## Deployment

- **Backend**: Render (Python 3.11), `render.yaml`
- **Frontend**: Vercel, `vercel.json` (builds `frontend/`, outputs `frontend/dist`)
- **CORS**: Explicitly configured in `main.py` for Vercel domain

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (production only) |
| `SECRET_KEY` | JWT signing secret — **must be set in production** |
| `ALGORITHM` | JWT algorithm (default HS256) |

Frontend auto-detects API URL; no `.env` needed for local dev with backend on port 8000.

## Gotchas

- `Holding` uses `asset_id` (int FK), NOT `asset_ticker`. Any code creating/querying Holdings must look up the Asset first.
- `AuctionBid.amount` is **per unit**. Total cost = `amount × quantity`.
- `global_interest_rate` in MarketState must be reset to `"NEUTRAL"` in `reset_game()`.
- The Playwright `.evaluate(el => el.click())` pattern is required for sidebar tab clicks — React re-renders detach elements between Playwright resolution and click.
- Rate limiting (`_check_rate_limit`) is in-memory and per-process; won't work with multi-worker deployments.
- Default admin bootstrap password is `admin123` — change immediately after first login.
