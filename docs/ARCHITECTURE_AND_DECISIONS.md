# Architecture and Design Decisions

## Database Schema

### Core tables

**User** — one row per participant. Fields: `cash`, `debt`, `is_frozen`, `role` (admin / sub_admin / team / banker / ai_agent), `last_login`, `session_id`. Bots are stored as regular users with role `team` and usernames `market_maker_1` / `market_maker_2`.

**Asset** — one row per tradeable instrument. Fields: `ticker`, `base_price`, `current_price`, `volatility` (0–1), `macro_sensitivity` (beta), `base_cagr`. Assets in production: GOLD, NVDA, BRENT, REITS, TBILL.

**Holding** — user × asset × quantity. `avg_cost` is updated using cost-basis averaging on every buy. `realized_pnl` is updated on every sell.

**PriceHistory** — one row per (asset, year, quarter). `quarter=0` is an annual snapshot; `quarter=1–4` are quarterly snapshots written by `step_quarter()`. Powers the price chart.

**Order** — open limit orders on the central order book. Fields: `type` (BUY/SELL), `price`, `quantity`, `status` (OPEN/FILLED/CANCELLED). Matched in `main.py:place_order()`.

**Transaction** — immutable record of every completed trade. Fields: `buyer_id`, `seller_id`, `asset_ticker`, `quantity`, `price_per_unit`, `total_value`, `is_flagged`, `flag_reason`. Flagged when trade price deviates >15% from mid-price at execution time.

**MarketState** — single-row table. Controls simulation state. Key fields:

| Field | Purpose |
|---|---|
| `current_year`, `current_quarter` | Simulation clock |
| `phase` | PRE_GAME / AUCTION / TRADING / FINISHED |
| `marketplace_open` | Trade and offer gate |
| `credit_facility_open` | Loan offer gate |
| `trade_requires_approval` | Forces human-approved private trades |
| `shock_stage` | NORMAL / WARNING / CRASH / RECOVERY |
| `shock_type` | INFLATION / RECESSION |
| `active_auction_asset` | Ticker currently in auction |
| `sentiment` | BULLISH / NEUTRAL / BEARISH (admin-controlled) |
| `bots_enabled` | Whether market-maker bots run each quarter |

**TeamLoan** — peer-to-peer loan between two teams (or banker → team). Interest rate is per quarter. `missed_quarters` tracks the grace period: after 2 missed payments, the loan defaults and the borrower is frozen.

**AuctionLot** — one lot per auction round. `seller_id = NULL` means a system-created lot; `seller_id IS NOT NULL` means a secondary lot listed by a team. `status`: PENDING → ACTIVE → SOLD/CANCELLED.

**AuctionBid** — bids placed on a specific `lot_id`. Winning bid is the highest amount when admin resolves.

**MortgageLoan** — team pledges an asset as collateral for 80% LTV cash. `collateral_quantity` is locked (deducted from available holdings). If not repaid by `maturity_quarters`, collateral transfers to the lender.

**PrivateOffer** — a pending bilateral trade proposal. `status`: PENDING → ACCEPTED/REJECTED/EXPIRED/CANCELLED. When `trade_requires_approval` is ON, accepting an offer creates a `TradeApproval` record instead of executing immediately.

**TradeApproval** / **LoanApproval** — admin queues for trades and loan acceptances. PENDING → APPROVED/REJECTED.

**BankerRequest** — unified queue for banker-initiated requests: `ASSET_REQUEST` (banker wants shares from admin) or `BAILOUT` (banker requests to bail out a frozen team).

**BailoutRecord** — tracks completed bailouts. Creates a `TeamLoan` on approval.

**ActiveEvent** — micro-events that boost or suppress a specific asset's annual growth for a set duration. Decremented each year. Removed when `remaining_years <= 0`.

**NewsItem** — articles visible in the news feed. `is_published=True` means teams can see it. `sim_year` / `sim_quarter` tags news to a simulation period. `category`: market, company, macro, decoy, bait, fun.

**SecondaryAuctionRequest** — team submits a request to list their holdings in the secondary auction hall. Admin approves, which creates an `AuctionLot` with `seller_id` set.

**ConsentRecord**, **TeamLeaderInfo**, **ActivityLog** — research data. `ActivityLog` captures every significant user action (BID, TRADE, LOAN_OFFER, SECONDARY_LISTING, etc.) with market context JSON for behavioral analysis.

---

## Pricing Formula

Each quarter, `engine.step_quarter()` updates every non-TBILL asset's price:

```
growth = cagr_component + shock_factor + k_reversion + momentum + micro_impact + noise
new_price = current_price × (1 + growth)
new_price = max(0.10, new_price)    # hard floor
```

### CAGR component

```
cagr_component = base_cagr × quarter_scale
```

`quarter_scale = 0.25` (one quarter = 25% of annual). Sentiment multiplier modifies both noise and CAGR:

```
SENTIMENT_MULT = { BULLISH: 1.25, NEUTRAL: 1.0, BEARISH: 0.75 }
cagr_component = cagr_component + cagr_component × (sent_mult - 1.0) × 0.3
```

### Shock factor

During WARNING: `−0.02 × quarter_scale` (market-wide jitters).

During CRASH:

| Ticker | INFLATION | RECESSION |
|---|---|---|
| GOLD | +0.12 | +0.08 |
| BRENT | +0.10 | −0.15 |
| NVDA | −0.15 | `−0.12 × |beta|` |
| REITS | −0.06 | −0.15 |

All factors scaled by `quarter_scale`.

During RECOVERY: `+0.08 to +0.15 × quarter_scale` (random, same for all assets).

### Mean reversion

Fetches the last 4 `PriceHistory` entries for the asset. If 4+ exist, reversion anchor = their average. Otherwise anchor = `base_price`.

```
price_ratio = current_price / reversion_anchor
k_reversion = 0.0
if price_ratio < 0.5:   k_reversion = +0.15 × quarter_scale   # far below anchor, strong pull up
elif price_ratio < 0.8: k_reversion = +0.08 × quarter_scale
elif price_ratio > 2.0: k_reversion = −0.10 × quarter_scale   # far above anchor, pull down
elif price_ratio > 1.5: k_reversion = −0.05 × quarter_scale
```

### Momentum

```
last_return = (price[t-1] - price[t-2]) / price[t-2]
momentum = clamp(last_return × 0.15, −0.03, +0.03)
```

### Micro-event impact

Each `ActiveEvent` on the asset contributes `annual_impact × quarter_scale`. Events are ticked down at year-end.

### Noise

```
noise = Gaussian(0, volatility × 0.8 × sqrt(quarter_scale))
if random() < 0.05:   noise += choice([-0.02, +0.02])   # 5% chance of extra ±2% surprise
noise = noise × sentiment_multiplier
```

### Trade price impact (intra-quarter)

Trades and accepted private offers move the price immediately:

```
trade_impact = min(0.30, 0.05 × qty)
new_price = (1 − trade_impact) × current_price + trade_impact × trade_price
```

1 unit = 5% weight, 6+ units = capped at 30%.

Auction resolves also update price: `new_price = 0.70 × current_price + 0.30 × winning_bid`.

Bot trades produce a smaller nudge: `1% per unit, max 5%`, applied as a directional multiplier (`×(1 ± impact)`).

---

## Shock Mechanism

`MarketState.shock_stage` transitions: **NORMAL → WARNING → CRASH → RECOVERY → NORMAL**.

Admin triggers a shock via `POST /admin/trigger-shock?shock_type=INFLATION&mode=CRASH` (or `mode=HINT` for a WARNING without full crash). The engine applies the shock_factor table above on each `step_quarter()` call while `shock_stage == 'CRASH'`. Admin triggers recovery via `POST /admin/trigger-recovery`, which sets stage to RECOVERY. After one RECOVERY quarter, stage returns to NORMAL automatically.

---

## Auction Logic

`LOT_CONFIGS` in `engine.py` defines how many lots and what quantity per lot for each asset. Admin opens an auction for a ticker → lots are created with `status=PENDING`. Admin opens each lot individually (status → ACTIVE) → participants bid → admin resolves the lot (highest bidder wins, status → SOLD) → repeat for next lot → admin ends auction.

**Settlement**: `engine.resolve_lot()` transfers the winning bid's cash from buyer to seller (or to the system if no seller). For team-listed lots, capital gains tax of 20% applies on profit above cost basis. Seller keeps 80% of proceeds above cost.

**Price impact**: Winning bid moves price: `0.70 × current + 0.30 × winning_bid`.

---

## Bot Logic

Two bots run at the start of each quarter (if `bots_enabled`). They use the same `User` records as other participants but bypass `execute_trade()` — they directly manipulate `Holding` and `User.cash`.

**Bot 1 (value trader)**:
- Buys assets that are >12% below `base_price` (5–8 units, capped at 20 held)
- Sells assets that are >18% above `base_price` (3–5 units)
- During CRASH: buys only GOLD
- Cash floor: $20,000

**Bot 2 (contrarian / momentum)**:
- Buys assets that fell >8% last quarter (3–5 units, capped at 15 held)
- Sells assets that rose >12% last quarter (2–3 units)
- Cash floor: $20,000

Each buy nudges price up 1% per unit (max 5%); each sell nudges down 1% per unit (max 5%). Bots are excluded from the leaderboard display.

---

## Anti-Cheat

**Wash trade block**: `execute_trade()` raises a `ValueError` if `buyer_id == seller_id`. The same check is applied before private offer execution.

**Collusion flag**: After every completed private trade, the trade price is compared to `asset.current_price`. If deviation > 15%, `Transaction.is_flagged = True` and a reason string is stored. Admin can see flagged trades at `GET /admin/flagged-trades`.

**Rate limit**: In-memory per-user counter (`_trade_times` dict). Max 30 trade-related actions per 60-second rolling window across `/offers/create`, `/offers/{id}/accept`, `/auction/bid`, `/orders`. Returns HTTP 429 on breach.

---

## Event State Machine

```
PRE_GAME ──────────────────────────────────────────┐
    │ (admin opens marketplace)                     │
    ▼                                               │
AUCTION (admin controls lot open/resolve flow)      │
    │ (admin ends auction)                          │
    ▼                                               │
TRADING (marketplace_open = true)                   │
    │ (POST /admin/end-trading)                     │
    ▼                                               │
FINISHED (marketplace_open = false, credit = false) │
```

FINISHED is terminal. Trades, bids, and private offers are blocked by guards in `execute_trade()`, `/offers/create`, and `/auction/bid`.

---

## Key Trade-offs

**SQLite vs PostgreSQL**: SQLite is used locally with WAL mode, 64 MB page cache, and memory-mapped I/O. This handles 40+ concurrent connections for a single-process event. PostgreSQL is used in production for reliability. The database module detects the environment via `DATABASE_URL`.

**Monolithic main.py**: All 80+ routes live in one file. This was a deliberate choice for a time-limited classroom simulation — it makes every endpoint easy to find and cross-reference without navigating a multi-module structure. The downside is a large file; the trade-off is acceptable given the project scope.

**In-memory rate limiting**: The `_trade_times` dict is process-local. It works for the single-process Uvicorn deployment on Render. It would not work across multiple worker processes. For a multi-worker deployment, a Redis-backed counter would be needed.

**SSE over WebSocket**: Server-Sent Events are simpler to deploy through reverse proxies and Vercel/Render without custom configuration. WebSocket is kept as a fallback because SSE is unidirectional (server → client only) and some proxies close long-lived HTTP connections.

**No migration framework**: The `_run_migrations()` function handles additive changes with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`-equivalent logic. Destructive migrations are not supported. This is intentional — the database is reset between events.
