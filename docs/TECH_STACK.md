# Tech Stack

## Frontend

| Layer | Library | Notes |
|---|---|---|
| Framework | React 19 + Vite | Dev server on port 5173 |
| Routing | React Router v6 | |
| HTTP client | Axios | Single configured instance in `frontend/src/services/api.js` |
| Animation | Framer Motion | Page and tab transitions |
| Icons | Lucide React | |
| Notifications | Sonner | Toast alerts |
| Styling | Plain CSS + inline styles | `frontend/src/index.css` for shared classes |

The frontend is a single-page app. All API calls go through named functions in `api.js` — there are no raw `axios` calls scattered through components.

Real-time updates come in over SSE (`GET /events`), with a WebSocket fallback (`/ws`). The connection is managed in `connectRealtime()` in `api.js`. Components do not connect directly; they receive a `lastUpdate` prop from Dashboard and re-fetch when it changes.

## Backend

| Layer | Library | Notes |
|---|---|---|
| Framework | FastAPI 0.110+ | Async request handlers |
| ORM | SQLModel (wraps SQLAlchemy + Pydantic) | |
| Auth | python-jose (JWT) + passlib (bcrypt) | |
| Server | Uvicorn | |

All route handlers are in `backend/main.py`. Simulation logic (price updates, auction resolution) lives in `backend/engine.py` as the `MarketEngine` class.

## Database

**Local development**: SQLite file `econova_v4.db`, created automatically on first run. WAL mode enabled for concurrent reads during live events.

**Production**: PostgreSQL on Render, detected via `DATABASE_URL` environment variable. Pool: `pool_size=20`, `max_overflow=20`.

No migration framework is used. `SQLModel.metadata.create_all()` creates tables on startup. Additive schema changes are handled by ALTER TABLE statements in `database.py:_run_migrations()`.

## Auth

JWT tokens (HS256) with a 60-minute expiry. Each token embeds a `session_id` that is also stored on the `User` row. Every authenticated request checks that the token's `session_id` matches the database value — concurrent logins from different browsers are rejected.

Roles: `admin`, `sub_admin`, `team`, `banker`, `ai_agent`. Role checks are enforced by FastAPI dependency injectors in `backend/auth.py`.

## Deployment

| Service | Provider | Config file |
|---|---|---|
| Backend | Render (Python 3.11) | `render.yaml` |
| Frontend | Vercel | `vercel.json` |

The frontend build output is `frontend/dist/`. Vercel serves it as a static site. CORS on the backend explicitly allows the Vercel domain.

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Production only | PostgreSQL connection string |
| `SECRET_KEY` | Required | JWT signing secret |
| `ALGORITHM` | Optional | JWT algorithm (default: `HS256`) |

For local development, no `.env` file is needed if the backend runs on port 8000 and the frontend on port 5173.
