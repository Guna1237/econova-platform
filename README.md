# Econova

A multiplayer financial simulation platform for academic/classroom settings. Teams trade assets, bid in auctions, extend loans, and navigate economic shocks in real time — while an admin controls the simulation and captures behavioral research data.

## Live

- **Frontend**: https://mu-aeon-econova-biddingwars.vercel.app
- **Backend**: https://econova-backend-ybiq.onrender.com

## Quick Start

```bash
# Backend
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

Default admin: `admin` / `admin123` — change after first login.

## Roles

| Role | Access |
|------|--------|
| Admin | Full simulation control + research data |
| Sub-Admin | Approvals only (loans, mortgages, trades) |
| Team | Trade, auction, borrow, manage portfolio |
| Banker | Bailouts + short-selling enablement |

## Asset Classes

| Ticker | Notes |
|--------|-------|
| GOLD | Safe haven; gains during shocks |
| NVDA | High-growth, rate-sensitive tech ETF |
| BRENT | Cyclical energy commodity |
| REITS | Rate-sensitive; pays quarterly dividends |
| TBILL | Risk-free guaranteed yield; bought directly |

## Key Features

- Real-time SSE/WebSocket market updates
- Multi-lot auction system with per-lot customization
- INFLATION / RECESSION shocks (WARNING → CRASH → RECOVERY)
- Advanced pricing: fat-tail noise, cross-asset correlation, momentum, mean reversion, interest rate environment, REITS dividends, herd-sell detection
- Price-nudge auto-news with customizable templates
- Admin-controlled public leaderboard overlay
- Full behavioral research tracking with GDPR consent

## Tech Stack

- **Backend**: FastAPI + SQLModel + SQLite (dev) / PostgreSQL (prod)
- **Frontend**: React 19 + Vite + Recharts + Framer Motion + Sonner
- **Auth**: JWT (python-jose)
- **Realtime**: SSE primary, WebSocket fallback
- **Deploy**: Render (backend) + Vercel (frontend)
- **Tests**: Playwright E2E (58 specs, `tests/`)

## Environment Variables (Production)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | JWT signing secret |
