# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**Econova** is a multiplayer financial simulation platform used in academic/classroom settings. Teams trade assets, offer loans, bid in auctions, and navigate market shocks — while admin tracks behavioral data for research. Key roles: **ADMIN** (controls the simulation), **TEAM** (players trading assets), **BANKER** (special actors providing bailouts and short lending).

## Development Commands

### Backend (FastAPI)
```bash
# Install dependencies
pip install -r backend/requirements.txt

# Run local dev server
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Production start command (used by Render)
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

### Frontend (React + Vite)
```bash
cd frontend

# Install dependencies
npm install

# Dev server (connects to localhost:8000)
npm run dev

# Production build
npm run build
```

## Architecture Overview

### Backend (`backend/`)
- **`main.py`** — All 80+ FastAPI route handlers. Single large file; endpoints are grouped by domain (auth, market, auctions, loans, mortgages, trading, banking, admin).
- **`engine.py`** — `MarketEngine` class: handles `step_quarter()` (advances simulation one quarter), auction resolution, shock mechanics, short position fees. Called by admin endpoints.
- **`models.py`** — All SQLModel table definitions (~20 models). Source of truth for DB schema.
- **`auth.py`** — JWT creation/verification, role-based dependency injectors (`get_current_user`, `get_current_admin`, `get_active_user`, `get_current_banker`, `get_banker_or_admin`).
- **`database.py`** — SQLAlchemy engine setup with SQLite (local) or PostgreSQL (production via `DATABASE_URL` env var). Includes WAL mode and performance pragmas for SQLite.
- **`activity_logger.py`** — Research data capture: logs user actions with market context JSON for behavioral analytics.
- **`admin_tools.py`** — CSV export utilities, price nudging, admin credential management.

### Frontend (`frontend/src/`)
- **`services/api.js`** — Single Axios client file with 100+ named API methods and `connectRealtime()` (SSE primary, WebSocket fallback). API base URL auto-detects environment (Render/Vercel domains vs localhost).
- **`pages/Dashboard.jsx`** — Main team dashboard. Tabs route to child components (AuctionHouse, CreditNetwork, PrivateTrading, Treasury, etc.).
- **`pages/Login.jsx`** — Auth page, also handles research consent and team leader info collection.
- **`components/`** — Feature components: `AuctionHouse`, `CreditNetwork`, `PrivateTrading`, `BankerDashboard`, `AdminBankerApprovals`, `AdminBankerManagement`, `AdminMortgageApprovals`, `ShortSelling`, etc.

### Real-Time Updates
1. **SSE** at `GET /events` with 25s heartbeat — primary channel
2. **WebSocket** at `/ws` — fallback with exponential backoff (3s → 30s)
3. Broadcasts: `market_update`, `bid_placed`, `loan_pending`, `auction_update`, etc.

## Database

- **Local dev**: SQLite file `econova_v4.db` (auto-created)
- **Production**: PostgreSQL on Render (detected via `DATABASE_URL` env var)
- No migration framework — schema is created via `SQLModel.metadata.create_all()` on startup. Additive schema changes are handled by `database.py` ALTER TABLE logic.

## Key Domain Concepts

### Simulation Lifecycle
Admin calls `POST /admin/next-quarter` → `engine.step_quarter()` → price updates, interest accrual, default checks, shock progression, news generation. `POST /admin/next-turn` advances a full year (4 quarters).

### Auction System
LOT_CONFIGS in `engine.py` define lot sizes. Flow: admin opens auction on a ticker → lots created → each lot opened individually → bids placed → admin resolves (highest bidder wins) → next lot opened → repeat → admin ends auction. Seller gets 80% proceeds (20% capital gains tax on gains); system-created lots have no tax.

### Loan/Credit System
Peer-to-peer: lender offers → borrower accepts (queued for admin approval) → quarterly interest auto-accrues. After 2 missed quarterly payments → account frozen + loan defaulted. Grace period resets on any successful payment.

### Mortgage/Emergency Liquidation
Team pledges an asset as collateral for 80% LTV cash loan. Maturity countdown in quarters. Default → lender seizes collateral.

### Shock Mechanics
`MarketState.shock_stage`: `NONE → WARNING → CRASH → RECOVERY`. INFLATION and RECESSION shocks have different per-asset multipliers defined in `engine.py`. Shocks last multiple quarters; admin triggers via `POST /admin/trigger-shock`.

### Account Freezing
Frozen users can repay loans but cannot take any trading/bidding/offering actions. Triggered automatically on loan default or manually by admin.

## Deployment

- **Backend**: Render (Python 3.11), config in `render.yaml`
- **Frontend**: Vercel, config in `vercel.json` (builds from `frontend/`, outputs `frontend/dist`)
- CORS is explicitly handled in `main.py` to allow Vercel frontend domain

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (production) |
| `SECRET_KEY` | JWT signing secret |
| `ALGORITHM` | JWT algorithm (default HS256) |

Frontend auto-detects the API URL; no `.env` needed for local dev if backend runs on port 8000.
