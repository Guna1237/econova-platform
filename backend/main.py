from contextlib import asynccontextmanager
from typing import List, Optional, Literal
import asyncio
import random
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select, func
from .database import create_db_and_tables, get_session, engine
from .engine import MarketEngine
from fastapi.security import OAuth2PasswordRequestForm
from .auth import create_access_token, get_current_admin, get_current_user, get_active_user, get_password_hash, verify_password, validate_password_strength, ACCESS_TOKEN_EXPIRE_MINUTES, get_current_banker, get_banker_or_admin, get_approver, SECRET_KEY, ALGORITHM
from .models import Asset, MarketState, Order, OrderStatus, User, Role, TeamLoan, AuctionBid, Holding, OrderType, PriceHistory, ConsentRecord, TeamLeaderInfo, ActivityLog, AuctionLot, LotStatus, PrivateOffer, Transaction, OfferStatus, NewsItem, TradeApproval, TradeApprovalStatus, LoanApproval, LoanApprovalStatus, LoanStatus, BailoutRecord, BankerRequest, BankerRequestType, BankerRequestStatus, MortgageLoan, MortgageStatus, SecondaryAuctionRequest
from .activity_logger import ActivityLogger
from .admin_tools import AdminTools
from pydantic import BaseModel, EmailStr, field_validator
from fastapi.responses import Response, StreamingResponse
from datetime import datetime, timezone
import os
import json
import logging
import secrets
import time as _time

logger = logging.getLogger(__name__)

# ─── Trade rate limiter (in-memory, single-process) ──────────────────────────
from collections import defaultdict as _defaultdict
_trade_times: dict = _defaultdict(list)
TRADE_RATE_LIMIT = 30  # max trades per team per 60 seconds

def _check_rate_limit(user_id: int):
    now = _time.monotonic()
    times = _trade_times[user_id]
    _trade_times[user_id] = [t for t in times if now - t < 60]
    if len(_trade_times[user_id]) >= TRADE_RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many trades. Wait a minute.")
    _trade_times[user_id].append(now)

# ─── Auction bid cooldown (in-memory, per user) ───────────────────────────────
_bid_last_time: dict = {}          # {user_id: monotonic timestamp of last bid}
BID_COOLDOWN_SECONDS = 15          # seconds a team must wait between bids

def _check_bid_cooldown(user_id: int):
    now = _time.monotonic()
    last = _bid_last_time.get(user_id, 0)
    elapsed = now - last
    if elapsed < BID_COOLDOWN_SECONDS:
        remaining = round(BID_COOLDOWN_SECONDS - elapsed, 1)
        raise HTTPException(
            status_code=429,
            detail=f"Bid cooldown active: {remaining}s remaining",
            headers={"X-Cooldown-Remaining": str(remaining)},
        )

def _record_bid(user_id: int):
    _bid_last_time[user_id] = _time.monotonic()

# Valid asset tickers for validation
VALID_TICKERS = {"GOLD", "NVDA", "BRENT", "REITS", "TBILL"}

# ─── In-memory TTL cache for hot read-only endpoints ────────────────────────
# Serves market state and asset lists from RAM instead of hitting SQLite
# on every poll from every device. Cache is invalidated on state changes.
class _TTLCache:
    def __init__(self, ttl_seconds: float = 2.0):
        self._data = None
        self._expires = 0.0
        self._ttl = ttl_seconds

    def get(self):
        if _time.monotonic() < self._expires:
            return self._data
        return None

    def set(self, value):
        self._data = value
        self._expires = _time.monotonic() + self._ttl

    def invalidate(self):
        self._expires = 0.0

_market_state_cache = _TTLCache(ttl_seconds=2.0)
_assets_cache = _TTLCache(ttl_seconds=2.0)

def _invalidate_read_caches():
    """Call this after any write that changes market state or asset prices."""
    _market_state_cache.invalidate()
    _assets_cache.invalidate()


# Valid tickers for whitelisting
VALID_TICKERS = {'GOLD', 'NVDA', 'BRENT', 'REITS', 'TBILL'}

# --- Pydantic Schemas for Requests ---
class BidCreate(BaseModel):
    amount: float

class LoanOfferCreate(BaseModel):
    borrower_username: str
    principal: float
    interest_rate: float
    
    @field_validator('principal')
    @classmethod
    def principal_positive(cls, v):
        if v <= 0:
            raise ValueError('Principal must be positive')
        return v

    @field_validator('interest_rate')
    @classmethod
    def rate_non_negative(cls, v):
        if v < 0:
            raise ValueError('Interest rate cannot be negative')
        if v > 50:
            raise ValueError('Interest rate cannot exceed 50% per quarter')
        return v

class PrivateOfferCreate(BaseModel):
    to_username: Optional[str] = None # empty means open market
    asset_ticker: str
    offer_type: str # buy/sell
    quantity: int
    price_per_unit: float
    message: Optional[str] = None
    listing_type: Optional[str] = "FIXED"  # FIXED or AUCTION (for open sell offers)

class ShockTrigger(BaseModel):
    type: Literal['INFLATION', 'RECESSION']
    action: Literal['HINT', 'WARNING', 'CRASH']

class ConsentAccept(BaseModel):
    leader_name: str
    email: EmailStr
    age: int
    team_size: int = 1

class NewsCreate(BaseModel):
    title: str
    content: str
    is_published: bool = False
    image_url: Optional[str] = None
    source: str = "Global News Network"

class BidLotCreate(BaseModel):
    lot_id: int
    amount: float
    
    @field_validator('amount')
    @classmethod
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError('Bid amount must be positive')
        return v

class PriceNudge(BaseModel):
    ticker: str
    adjustment_pct: Optional[float] = None
    adjustment_abs: Optional[float] = None
    
    @field_validator('ticker')
    @classmethod
    def ticker_valid(cls, v):
        if v.upper() not in VALID_TICKERS:
            raise ValueError(f'Invalid ticker: {v}')
        return v.upper()

class AdminCredUpdate(BaseModel):
    new_username: Optional[str] = None
    new_password: Optional[str] = None

class CashAdjustment(BaseModel):
    amount: float
    reason: Optional[str] = None

class TradeApprovalAction(BaseModel):
    admin_note: Optional[str] = None

class ActivityLogRequest(BaseModel):
    action_type: str
    action_details: dict
    duration_ms: Optional[int] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    with Session(engine) as session:
        sim = MarketEngine(session)
        sim.initialize_assets()
        
        # Ensure Admin
        admin = session.exec(select(User).where(User.username == "admin")).first()
        if not admin:
            from .auth import get_password_hash
            session.add(User(username="admin", hashed_password=get_password_hash("admin123"), role=Role.ADMIN, cash=1_000_000_000_000))
            
        subadmin = session.exec(select(User).where(User.username == "subadmin")).first()
        if not subadmin:
            from .auth import get_password_hash
            session.add(User(username="subadmin", hashed_password=get_password_hash("subadmin123"), role=Role.SUB_ADMIN))
        
        session.commit()
        sim.initialize_bots()
    yield

# --- SSE (Server-Sent Events) Manager ---
class SSEManager:
    """Manages SSE client connections using async queues."""
    def __init__(self):
        self.clients: list[asyncio.Queue] = []

    def add_client(self) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=50)
        self.clients.append(q)
        return q

    def remove_client(self, q: asyncio.Queue):
        if q in self.clients:
            self.clients.remove(q)

    async def broadcast(self, event_type: str, data: dict = None):
        message = json.dumps({"type": event_type, "data": data or {}})
        dead = []
        for q in self.clients:
            try:
                q.put_nowait(message)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self.remove_client(q)

sse_manager = SSEManager()

# --- WebSocket Connection Manager ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, event_type: str, data: dict = None):
        # Broadcast to WebSocket clients
        message = json.dumps({"type": event_type, "data": data or {}})
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)
        # Also broadcast to SSE clients
        await sse_manager.broadcast(event_type, data)

ws_manager = ConnectionManager()

app = FastAPI(title="Econova API", lifespan=lifespan)

# Global exception handler — prevents any unhandled exception from crashing the worker
from fastapi import Request as _Request
from fastapi.responses import JSONResponse as _JSONResponse
@app.exception_handler(Exception)
async def _global_exc_handler(request: _Request, exc: Exception):
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return _JSONResponse(status_code=500, content={"detail": "Internal server error"})

# Health check — used by Render to verify the service is alive
@app.get("/health")
def health_check(session: Session = Depends(get_session)):
    try:
        state = session.exec(select(MarketState)).first()
        return {
            "status": "healthy",
            "year": state.current_year if state else 0,
            "quarter": state.current_quarter if state else 0,
            "phase": state.phase if state else "UNKNOWN",
            "sse_clients": len(sse_manager.clients),
        }
    except Exception as e:
        logger.error("Health check failed: %s", e)
        return _JSONResponse(status_code=503, content={"status": "degraded", "error": str(e)})

# Restrict CORS in production
environment = os.getenv("ENVIRONMENT", "development")

# Specify exact origins so allow_credentials works in modern browsers
allow_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://mu-aeon-econova-biddingwars.vercel.app"
]

# Add CORS middleware with specific allowed origins for credential support
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- SSE Endpoint ---
@app.get("/events")
async def sse_events(token: Optional[str] = None):
    """Server-Sent Events endpoint for real-time updates (WebSocket alternative)."""
    from jose import JWTError, jwt as jose_jwt
    if not token:
        return Response(status_code=401, content="Missing token")
    try:
        jose_jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return Response(status_code=401, content="Invalid token")
    q = sse_manager.add_client()

    async def event_stream():
        try:
            # Send initial heartbeat so the client knows the connection is alive
            yield f"data: {json.dumps({'type': 'connected', 'data': {}})}\n\n"
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=25.0)
                    yield f"data: {msg}\n\n"
                except asyncio.TimeoutError:
                    # Send heartbeat to keep connection alive
                    yield f": heartbeat\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            sse_manager.remove_client(q)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering
        }
    )

# --- WebSocket Endpoint ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == 'ping':
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

# --- PUBLIC ENDPOINTS ---

@app.get("/health")
@app.head("/health")
def health_check(): return {"status": "healthy"}

@app.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    logger.info(f"Login attempt for user: {form_data.username}")
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user:
        logger.warning(f"Login failed: User {form_data.username} not found")
        raise HTTPException(status_code=401, detail="Incorrect username or password")
        
    if not verify_password(form_data.password, user.hashed_password):
        logger.warning(f"Login failed: Incorrect password for user {form_data.username}")
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    # Update last login time and generate new session ID
    user.last_login = datetime.now(timezone.utc)
    user.session_id = secrets.token_hex(16)
    session.add(user)
    session.commit()
    
    logger.info(f"Login successful for user: {form_data.username} (Role: {user.role})")
    access_token = create_access_token(data={"sub": user.username, "sid": user.session_id})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role,
        "has_consented": user.has_consented
    }



# Helper to avoid Pydantic dependency in params if not using body ...
# Actually let's just stick to the existing register pattern if it existed, or simpler:
# @app.post("/register-simple") 
# def register(username: str, password: str, session: Session = Depends(get_session)):
#     if session.exec(select(User).where(User.username == username)).first():
#         raise HTTPException(status_code=400, detail="User already exists")
#     user = User(username=username, hashed_password=get_password_hash(password))
#     session.add(user)
#     session.commit()
#     return {"message": "User created"}

# --- MARKET DATA ---

@app.get("/market/state")
def get_state(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    cached = _market_state_cache.get()
    if cached is not None:
        return cached
    sim = MarketEngine(session)
    result = sim.get_state()
    _market_state_cache.set(result)
    return result

@app.get("/market/assets")
def get_assets(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    cached = _assets_cache.get()
    if cached is not None:
        return cached
    result = session.exec(select(Asset)).all()
    _assets_cache.set(result)
    return result

@app.get("/users/me")
def get_me(user: User = Depends(get_current_user)):
    return user

@app.get("/users/portfolio")
def get_portfolio(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    holdings = session.exec(select(Holding).where(Holding.user_id == user.id)).all()
    # Enrich with Asset Data
    res = []
    for h in holdings:
        asset = session.get(Asset, h.asset_id)
        res.append({
            "ticker": asset.ticker,
            "name": asset.name,
            "quantity": h.quantity,
            "avg_cost": h.avg_cost,
            "current_price": asset.current_price,
            "market_value": h.quantity * asset.current_price,
            "unrealized_pnl": (asset.current_price - h.avg_cost) * h.quantity
        })
    return res


# --- HISTORICAL DATA ---
@app.get("/market/history/{asset_id}")
def get_price_history(asset_id: int, quarterly: bool = False, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Get price history. Use quarterly=true for quarterly data, false for yearly snapshots."""
    # Validate asset exists
    asset = session.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    query = select(PriceHistory).where(PriceHistory.asset_id == asset_id)
    # Always return all data points — the frontend controls label density per view mode
    query = query.order_by(PriceHistory.year, PriceHistory.quarter)
    return session.exec(query).all()

class UserRegister(BaseModel):
    username: str
    password: str

@app.post("/register-simple")
def register(data: UserRegister, admin: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Create a new user (admin-only)"""
    validate_password_strength(data.password)
    if len(data.username) < 2 or len(data.username) > 30:
        raise HTTPException(status_code=400, detail="Username must be 2-30 characters")
    if session.exec(select(User).where(User.username == data.username)).first():
        raise HTTPException(status_code=400, detail="User already exists")
    user = User(username=data.username, hashed_password=get_password_hash(data.password))
    session.add(user)
    session.commit()
    return {"message": "User created"}


class BulkTeamEntry(BaseModel):
    username: str
    password: str
    starting_capital: Optional[float] = None

class BulkTeamCreate(BaseModel):
    teams: List[BulkTeamEntry]

@app.post("/admin/teams/bulk-create")
def bulk_create_teams(
    data: BulkTeamCreate,
    admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Bulk-create team accounts from an imported spreadsheet."""
    state = session.exec(select(MarketState)).first()
    default_capital = state.team_starting_capital if state else 1_000_000.0

    created, skipped, errors = [], [], []

    for entry in data.teams:
        username = (entry.username or "").strip()
        password = (entry.password or "").strip()
        capital = entry.starting_capital if entry.starting_capital is not None else default_capital

        if not username or not password:
            errors.append({"username": username or "(empty)", "reason": "Missing username or password"})
            continue
        if len(username) < 2 or len(username) > 30:
            errors.append({"username": username, "reason": "Username must be 2–30 characters"})
            continue

        existing = session.exec(select(User).where(User.username == username)).first()
        if existing:
            skipped.append(username)
            continue

        team = User(
            username=username,
            hashed_password=get_password_hash(password),
            role=Role.TEAM,
            cash=max(0.0, float(capital)),
        )
        session.add(team)
        created.append(username)

    session.commit()
    return {
        "created": created,
        "skipped": skipped,
        "errors": errors,
        "summary": f"{len(created)} created, {len(skipped)} skipped (already exist), {len(errors)} errors",
    }

# --- MARKET DATA ---
# ...

# --- ADMIN USER MANAGEMENT ---

@app.get("/admin/users")
def get_all_users(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    return session.exec(select(User).where(User.role == Role.TEAM)).all()

@app.get("/admin/leaderboard")
def get_leaderboard(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Return ranked team leaderboard with net worth breakdown."""
    teams = session.exec(select(User).where(User.role == Role.TEAM)).all()
    assets = session.exec(select(Asset)).all()
    asset_map = {a.id: a for a in assets}

    result = []
    for team in teams:
        holdings = session.exec(select(Holding).where(Holding.user_id == team.id)).all()
        portfolio_value = sum(
            h.quantity * asset_map[h.asset_id].current_price
            for h in holdings
            if h.asset_id in asset_map
        )
        net_worth = team.cash + portfolio_value - team.debt
        result.append({
            "id": team.id,
            "username": team.username,
            "cash": team.cash,
            "portfolio_value": round(portfolio_value, 2),
            "debt": team.debt,
            "net_worth": round(net_worth, 2),
            "is_frozen": team.is_frozen,
        })

    result.sort(key=lambda x: x["net_worth"], reverse=True)
    for i, entry in enumerate(result):
        entry["rank"] = i + 1
    return result


@app.get("/leaderboard")
def get_public_leaderboard(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Public leaderboard — returns data only when leaderboard_visible is True (or caller is admin/sub_admin)."""
    state = session.exec(select(MarketState)).first()
    is_privileged = user.role in (Role.ADMIN, Role.SUB_ADMIN)
    if not is_privileged and (not state or not state.leaderboard_visible):
        return []

    # Hidden teams are invisible to regular participants; privileged users see everyone
    hidden_filter = [] if is_privileged else [User.is_hidden == False]
    teams = session.exec(select(User).where(User.role == Role.TEAM, *hidden_filter)).all()
    assets = session.exec(select(Asset)).all()
    asset_map = {a.id: a for a in assets}

    result = []
    for team in teams:
        if team.username.startswith("market_maker_"):
            continue
        holdings = session.exec(select(Holding).where(Holding.user_id == team.id)).all()
        portfolio_value = sum(
            h.quantity * asset_map[h.asset_id].current_price
            for h in holdings
            if h.asset_id in asset_map
        )
        net_worth = team.cash + portfolio_value - team.debt
        result.append({
            "id": team.id,
            "username": team.username,
            "cash": team.cash,
            "portfolio_value": round(portfolio_value, 2),
            "debt": team.debt,
            "net_worth": round(net_worth, 2),
            "is_frozen": team.is_frozen,
        })

    result.sort(key=lambda x: x["net_worth"], reverse=True)
    for i, entry in enumerate(result):
        entry["rank"] = i + 1
    return result


@app.post("/admin/leaderboard/toggle")
async def toggle_leaderboard(
    admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Toggle public leaderboard visibility for all players."""
    state = session.exec(select(MarketState)).first()
    if not state:
        raise HTTPException(status_code=404, detail="No market state")
    state.leaderboard_visible = not state.leaderboard_visible
    session.add(state)
    session.commit()
    await ws_manager.broadcast("market_update", {
        "action": "leaderboard_toggled",
        "visible": state.leaderboard_visible,
    })
    return {"leaderboard_visible": state.leaderboard_visible}


class AuctionConfigBody(BaseModel):
    ticker: str
    lots: list  # Array of unit counts per lot, e.g. [5, 10, 15, 20]


@app.post("/admin/auction/config")
def set_auction_config(
    body: AuctionConfigBody,
    admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Set per-asset auction lot configuration. lots = array of unit counts per lot."""
    if not body.lots or len(body.lots) < 1:
        raise HTTPException(status_code=400, detail="At least 1 lot required")
    if any(u < 1 for u in body.lots):
        raise HTTPException(status_code=400, detail="Each lot must have at least 1 unit")
    state = session.exec(select(MarketState)).first()
    if not state:
        raise HTTPException(status_code=404, detail="No market state")
    current = dict(state.auction_config or {})
    current[body.ticker.upper()] = {"lots": [int(u) for u in body.lots]}
    state.auction_config = current
    session.add(state)
    session.commit()
    return {"auction_config": state.auction_config}


@app.get("/admin/auction/config")
def get_auction_config(
    admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Get current per-asset auction lot configuration."""
    state = session.exec(select(MarketState)).first()
    return state.auction_config or {}


class TeamCapitalBody(BaseModel):
    amount: float


@app.post("/admin/team-capital")
def set_team_starting_capital(
    body: TeamCapitalBody,
    admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Set the starting cash given to newly created team accounts."""
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    state = session.exec(select(MarketState)).first()
    if not state:
        raise HTTPException(status_code=404, detail="No market state")
    state.team_starting_capital = body.amount
    session.add(state)
    session.commit()
    return {"team_starting_capital": state.team_starting_capital}


@app.post("/admin/users/create")
def create_team_user(data: UserRegister, user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    validate_password_strength(data.password)
    if len(data.username) < 2 or len(data.username) > 30:
        raise HTTPException(status_code=400, detail="Username must be 2-30 characters")
    if session.exec(select(User).where(User.username == data.username)).first():
        raise HTTPException(status_code=400, detail="User exists")
    state = session.exec(select(MarketState)).first()
    starting_capital = state.team_starting_capital if state else 1_000_000.0
    new_user = User(username=data.username, hashed_password=get_password_hash(data.password), role=Role.TEAM, cash=starting_capital)
    session.add(new_user)
    session.commit()
    return {"message": f"Team {data.username} created"}



# --- ACTIONS ---

@app.post("/auction/bid")
async def place_bid(bid: BidLotCreate, user: User = Depends(get_active_user), session: Session = Depends(get_session)):
    """Place bid on a specific auction lot"""
    _check_rate_limit(user.id)
    _check_bid_cooldown(user.id)
    state = session.exec(select(MarketState)).first()
    if state and state.phase == "FINISHED":
        raise HTTPException(status_code=400, detail="Trading has ended")
    sim = MarketEngine(session)
    logger = ActivityLogger(session)

    try:
        sim.place_bid(user, bid.lot_id, bid.amount)
        _record_bid(user.id)
        from .models import AuctionLot
        lot = session.get(AuctionLot, bid.lot_id)
        quantity = lot.quantity if lot else 0
        asset_ticker = lot.asset_ticker if lot else sim.get_state().active_auction_asset
        logger.log_bid(user.id, asset_ticker, bid.lot_id, bid.amount, quantity)
        await ws_manager.broadcast("bid_placed", {"lot_id": bid.lot_id, "amount": bid.amount, "user": user.username})
        return {"message": "Bid placed successfully", "cooldown_seconds": BID_COOLDOWN_SECONDS}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/auction/bids")
def get_live_bids(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    sim = MarketEngine(session)
    state = sim.get_state()
    ticker = state.active_auction_asset
    if not ticker: return []
    bids = session.exec(select(AuctionBid).where(AuctionBid.asset_ticker == ticker)).all()
    # Mask usernames? Maybe allow full visibility for auction transparency
    # For now return full
    return sorted(bids, key=lambda x: x.amount, reverse=True)

@app.post("/loans/offer")
async def offer_loan(offer: LoanOfferCreate, user: User = Depends(get_active_user), session: Session = Depends(get_session)):
    # Check credit facility
    state = session.exec(select(MarketState)).first()
    if not state or not state.credit_facility_open:
        raise HTTPException(status_code=400, detail="Credit facility is currently locked by admin")
    borrower = session.exec(select(User).where(User.username == offer.borrower_username)).first()
    if not borrower: raise HTTPException(status_code=404, detail="User not found")
    if borrower.id == user.id: raise HTTPException(status_code=400, detail="Cannot lend to yourself")
    if user.cash < offer.principal: raise HTTPException(status_code=400, detail="Insufficient funds")
    
    loan = TeamLoan(
        lender_id=user.id, 
        borrower_id=borrower.id, 
        principal=offer.principal, 
        remaining_balance=offer.principal,  # Initialize remaining balance
        interest_rate=offer.interest_rate
    )
    session.add(loan)
    session.commit()
    await ws_manager.broadcast("market_update", {"action": "loan_offered", "from": user.username, "to": borrower.username})
    return {"message": "Loan offer sent"}

@app.post("/loans/accept/{loan_id}")
async def accept_loan(loan_id: int, user: User = Depends(get_active_user), session: Session = Depends(get_session)):
    # Check credit facility
    state = session.exec(select(MarketState)).first()
    if not state or not state.credit_facility_open:
        raise HTTPException(status_code=400, detail="Credit facility is currently locked by admin")
    loan = session.get(TeamLoan, loan_id)
    if not loan or loan.borrower_id != user.id: raise HTTPException(status_code=404, detail="Loan not found")
    if loan.status != "pending": raise HTTPException(status_code=400, detail="Loan not pending")
    
    # Check if already queued for approval
    existing_approval = session.exec(select(LoanApproval).where(LoanApproval.loan_id == loan_id)).first()
    if existing_approval and existing_approval.status == LoanApprovalStatus.PENDING:
        raise HTTPException(status_code=400, detail="Loan acceptance is already awaiting admin approval")
    
    lender = session.get(User, loan.lender_id)
    if lender.cash < loan.principal: raise HTTPException(status_code=400, detail="Lender funds unavailable")
    
    # Queue for admin approval instead of executing immediately
    approval = LoanApproval(loan_id=loan_id)
    session.add(approval)
    session.commit()
    await ws_manager.broadcast("market_update", {"action": "loan_pending_approval", "loan_id": loan.id})
    return {"message": "Loan acceptance submitted for admin approval", "approval_required": True}

@app.get("/loans/pending")
def get_pending_loans(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    loans = session.exec(select(TeamLoan).where(TeamLoan.borrower_id == user.id, TeamLoan.status == "pending")).all()
    # Enrich with lender username
    result = []
    for loan in loans:
        lender = session.get(User, loan.lender_id)
        result.append({
            **loan.model_dump(),
            "lender_username": lender.username if lender else "Unknown"
        })
    return result

@app.get("/loans/teams")
def get_all_teams(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Get all registered team users (excluding current user and admins)"""
    teams = session.exec(
        select(User).where(
            User.role == Role.TEAM,
            User.id != user.id,
            User.is_hidden == False,
        )
    ).all()
    return [{"id": t.id, "username": t.username} for t in teams]

@app.get("/loans/active")
def get_active_loans(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Get all active loans where user is borrower or lender"""
    loans = session.exec(
        select(TeamLoan).where(
            (TeamLoan.borrower_id == user.id) | (TeamLoan.lender_id == user.id),
            TeamLoan.status == "active"
        )
    ).all()

    result = []
    for loan in loans:
        lender = session.get(User, loan.lender_id)
        borrower = session.get(User, loan.borrower_id)
        result.append({
            **loan.model_dump(),
            "lender_username": lender.username if lender else "Unknown",
            "borrower_username": borrower.username if borrower else "Unknown",
            "is_borrower": loan.borrower_id == user.id,
            "is_lender": loan.lender_id == user.id
        })
    return result

class RepaymentRequest(BaseModel):
    loan_id: int
    amount: float

@app.post("/loans/repay")
async def repay_loan(req: RepaymentRequest, user: User = Depends(get_current_user), session: Session = Depends(get_session)):  # Use get_current_user so frozen teams CAN repay
    """Make a partial or full repayment on a loan"""
    loan = session.get(TeamLoan, req.loan_id)
    if not loan or loan.borrower_id != user.id:
        raise HTTPException(status_code=404, detail="Loan not found")
    if loan.status != "active":
        raise HTTPException(status_code=400, detail="Loan not active")
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if user.cash < req.amount:
        raise HTTPException(status_code=400, detail="Insufficient cash")
    
    # Process repayment
    lender = session.get(User, loan.lender_id)
    user.cash -= req.amount
    lender.cash += req.amount
    user.debt -= req.amount
    
    loan.total_repaid += req.amount
    loan.remaining_balance -= req.amount
    
    # Check if fully repaid
    if loan.remaining_balance <= 0:
        was_defaulted = loan.status == "defaulted"
        loan.status = "closed"
        loan.remaining_balance = 0
        user.debt = max(0.0, user.debt)  # Clamp to 0, never negative
        # Unfreeze if team was frozen owing to this loan default
        if user.is_frozen and was_defaulted:
            user.is_frozen = False
        message = f"Loan fully repaid! Total: ${loan.total_repaid:,.2f}." + (" Account unfrozen." if was_defaulted else "")
    else:
        user.debt = max(0.0, user.debt)  # Clamp to 0, never negative
        message = f"Repaid ${req.amount:,.2f}. Remaining: ${loan.remaining_balance:,.2f}"
    
    session.add(user)
    session.add(lender)
    session.add(loan)
    session.commit()
    
    await ws_manager.broadcast("market_update", {"action": "loan_repaid", "loan_id": loan.id})
    return {"message": message, "remaining_balance": loan.remaining_balance}


# ============ EMERGENCY LIQUIDATION / MORTGAGE LOANS ============

class MortgageRequest(BaseModel):
    collateral_asset_ticker: str
    collateral_quantity: int
    interest_rate: float   # per quarter
    maturity_quarters: int  # 1-8

    @field_validator('collateral_quantity')
    @classmethod
    def qty_positive(cls, v):
        if v <= 0: raise ValueError('Quantity must be positive')
        return v

    @field_validator('interest_rate')
    @classmethod
    def rate_floor(cls, v):
        if v < 5.0: raise ValueError('Interest rate must be at least 5% per quarter')
        if v > 50.0: raise ValueError('Interest rate cannot exceed 50% per quarter')
        return v

    @field_validator('maturity_quarters')
    @classmethod
    def maturity_bounds(cls, v):
        if v < 1 or v > 8: raise ValueError('Maturity must be 1-8 quarters')
        return v


class MortgageRepayRequest(BaseModel):
    mortgage_id: int
    amount: float

    @field_validator('amount')
    @classmethod
    def amount_positive(cls, v):
        if v <= 0: raise ValueError('Amount must be positive')
        return v


def _get_escrowed_quantity(session: Session, user_id: int, asset_id: int) -> int:
    """Sum collateral quantity pledged in PENDING mortgages (approved ones already deducted from holding)."""
    mortgages = session.exec(
        select(MortgageLoan).where(
            MortgageLoan.borrower_id == user_id,
            MortgageLoan.collateral_asset_id == asset_id,
            MortgageLoan.status == MortgageStatus.PENDING
        )
    ).all()
    return sum(m.collateral_quantity for m in mortgages)


@app.post("/mortgage/request")
async def request_mortgage(req: MortgageRequest, user: User = Depends(get_active_user), session: Session = Depends(get_session)):
    """Team requests an emergency mortgage loan by pledging assets as collateral."""
    # Validate asset
    asset = session.exec(select(Asset).where(Asset.ticker == req.collateral_asset_ticker)).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset.ticker == "TBILL":
        raise HTTPException(status_code=400, detail="T-Bills cannot be used as collateral")

    # Check ownership minus existing escrows
    holding = session.exec(select(Holding).where(Holding.user_id == user.id, Holding.asset_id == asset.id)).first()
    escrowed = _get_escrowed_quantity(session, user.id, asset.id)
    available = (holding.quantity if holding else 0) - escrowed
    if available < req.collateral_quantity:
        raise HTTPException(status_code=400, detail=f"Insufficient available assets. You have {available} available ({escrowed} escrowed)")

    # Check for duplicate pending requests
    existing = session.exec(
        select(MortgageLoan).where(
            MortgageLoan.borrower_id == user.id,
            MortgageLoan.status == MortgageStatus.PENDING
        )
    ).all()
    if len(existing) >= 3:
        raise HTTPException(status_code=400, detail="Maximum 3 pending mortgage requests allowed")

    # Calculate loan amount at 80% LTV
    collateral_value = req.collateral_quantity * asset.current_price
    loan_amount = round(collateral_value * 0.80, 2)  # 80% Loan-to-Value

    # Calculate total due at maturity (compound quarterly interest)
    total_due = loan_amount
    for _ in range(req.maturity_quarters):
        total_due *= (1 + req.interest_rate / 100.0)
    total_due = round(total_due, 2)

    mortgage = MortgageLoan(
        borrower_id=user.id,
        collateral_asset_id=asset.id,
        collateral_quantity=req.collateral_quantity,
        collateral_value_at_lock=collateral_value,
        loan_amount=loan_amount,
        interest_rate=req.interest_rate,
        maturity_quarters=req.maturity_quarters,
        quarters_remaining=req.maturity_quarters,
        total_due=total_due,
        remaining_balance=total_due,
        status=MortgageStatus.PENDING
    )
    session.add(mortgage)
    session.commit()

    await ws_manager.broadcast("market_update", {"action": "mortgage_requested", "user": user.username})
    return {
        "message": f"Mortgage request submitted. Pledging {req.collateral_quantity} {asset.ticker} (value: ${collateral_value:,.2f}) for ${loan_amount:,.2f} loan. Total due at maturity: ${total_due:,.2f}",
        "mortgage_id": mortgage.id,
        "loan_amount": loan_amount,
        "total_due": total_due
    }


@app.get("/mortgage/my")
def get_my_mortgages(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Get all mortgage loans for the current user."""
    mortgages = session.exec(
        select(MortgageLoan).where(MortgageLoan.borrower_id == user.id).order_by(MortgageLoan.id.desc())
    ).all()
    result = []
    for m in mortgages:
        asset = session.get(Asset, m.collateral_asset_id)
        result.append({
            **m.model_dump(),
            "collateral_ticker": asset.ticker if asset else "???",
            "collateral_name": asset.name if asset else "???",
            "current_collateral_value": (m.collateral_quantity * asset.current_price) if asset else 0
        })
    return result


@app.post("/mortgage/repay")
async def repay_mortgage(req: MortgageRepayRequest, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Repay a mortgage loan partially or fully."""
    mortgage = session.get(MortgageLoan, req.mortgage_id)
    if not mortgage or mortgage.borrower_id != user.id:
        raise HTTPException(status_code=404, detail="Mortgage not found")
    if mortgage.status != MortgageStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Mortgage is not active")
    if user.cash < req.amount:
        raise HTTPException(status_code=400, detail="Insufficient cash")

    # Cap repayment at remaining balance
    actual_amount = min(req.amount, mortgage.remaining_balance)
    user.cash -= actual_amount
    mortgage.total_repaid += actual_amount
    mortgage.remaining_balance -= actual_amount

    if mortgage.remaining_balance <= 0:
        # Fully repaid — return collateral to borrower's holding
        mortgage.status = MortgageStatus.REPAID
        mortgage.remaining_balance = 0
        mortgage.closed_at = datetime.now(timezone.utc)

        col_asset = session.get(Asset, mortgage.collateral_asset_id)
        if col_asset:
            col_holding = session.exec(
                select(Holding).where(Holding.user_id == user.id, Holding.asset_id == col_asset.id)
            ).first()
            col_avg = (mortgage.collateral_value_at_lock / mortgage.collateral_quantity) if mortgage.collateral_quantity > 0 else 0
            if col_holding:
                total_val = (col_holding.quantity * col_holding.avg_cost) + (mortgage.collateral_quantity * col_avg)
                new_qty = col_holding.quantity + mortgage.collateral_quantity
                col_holding.avg_cost = total_val / new_qty
                col_holding.quantity = new_qty
                session.add(col_holding)
            else:
                session.add(Holding(user_id=user.id, asset_id=col_asset.id, quantity=mortgage.collateral_quantity, avg_cost=col_avg))
        message = f"Mortgage fully repaid! {mortgage.collateral_quantity} {col_asset.ticker if col_asset else 'units'} collateral returned to your portfolio."
    else:
        message = f"Repaid ${actual_amount:,.2f}. Remaining: ${mortgage.remaining_balance:,.2f}"

    session.add_all([user, mortgage])
    session.commit()

    await ws_manager.broadcast("market_update", {"action": "mortgage_repaid", "mortgage_id": mortgage.id})
    return {"message": message, "remaining_balance": mortgage.remaining_balance}


# --- ADMIN MORTGAGE APPROVALS ---

class MortgageApprovalAction(BaseModel):
    admin_note: Optional[str] = None


@app.get("/admin/mortgage-requests")
def get_mortgage_requests(user: User = Depends(get_banker_or_admin), session: Session = Depends(get_session)):
    """List all mortgage requests for admin review."""
    mortgages = session.exec(
        select(MortgageLoan).order_by(MortgageLoan.created_at.desc())
    ).all()
    result = []
    for m in mortgages:
        borrower = session.get(User, m.borrower_id)
        asset = session.get(Asset, m.collateral_asset_id)
        result.append({
            **m.model_dump(),
            "borrower_username": borrower.username if borrower else "???",
            "collateral_ticker": asset.ticker if asset else "???",
            "collateral_name": asset.name if asset else "???",
            "current_collateral_value": (m.collateral_quantity * asset.current_price) if asset else 0
        })
    return result


@app.post("/admin/mortgage/{mortgage_id}/approve")
async def approve_mortgage(mortgage_id: int, body: MortgageApprovalAction, user: User = Depends(get_banker_or_admin), session: Session = Depends(get_session)):
    """Approve a mortgage — escrow assets, fund the borrower."""
    mortgage = session.get(MortgageLoan, mortgage_id)
    if not mortgage:
        raise HTTPException(status_code=404, detail="Mortgage not found")
    if mortgage.status != MortgageStatus.PENDING:
        raise HTTPException(status_code=400, detail="Mortgage is not pending")

    borrower = session.get(User, mortgage.borrower_id)
    asset = session.get(Asset, mortgage.collateral_asset_id)

    # Verify borrower still has the assets (exclude THIS mortgage from PENDING count since we're approving it now)
    holding = session.exec(select(Holding).where(Holding.user_id == borrower.id, Holding.asset_id == asset.id)).first()
    other_escrowed = _get_escrowed_quantity(session, borrower.id, asset.id) - mortgage.collateral_quantity
    available = (holding.quantity if holding else 0) - max(0, other_escrowed)
    if available < mortgage.collateral_quantity:
        raise HTTPException(status_code=400, detail=f"Borrower no longer has enough assets ({available} available, {mortgage.collateral_quantity} needed)")

    # Approve: fund the borrower, lock collateral value
    mortgage.collateral_value_at_lock = mortgage.collateral_quantity * asset.current_price
    mortgage.status = MortgageStatus.ACTIVE
    mortgage.approved_at = datetime.now(timezone.utc)
    mortgage.admin_note = body.admin_note

    # Give cash to borrower
    borrower.cash += mortgage.loan_amount
    borrower.debt += mortgage.total_due

    # Escrow collateral: deduct from borrower's holding immediately (returned on repayment, seized on default)
    if holding:  # guaranteed by availability check above, but be explicit
        if holding.quantity <= mortgage.collateral_quantity:
            session.delete(holding)
        else:
            holding.quantity -= mortgage.collateral_quantity
            session.add(holding)

    session.add_all([mortgage, borrower])
    session.commit()
    _invalidate_read_caches()

    await ws_manager.broadcast("market_update", {"action": "mortgage_approved", "mortgage_id": mortgage.id, "user": borrower.username})
    return {"message": f"Mortgage approved. ${mortgage.loan_amount:,.2f} funded to {borrower.username}. Collateral: {mortgage.collateral_quantity} {asset.ticker} escrowed."}


@app.post("/admin/mortgage/{mortgage_id}/reject")
async def reject_mortgage(mortgage_id: int, body: MortgageApprovalAction, user: User = Depends(get_banker_or_admin), session: Session = Depends(get_session)):
    """Reject a mortgage request."""
    mortgage = session.get(MortgageLoan, mortgage_id)
    if not mortgage:
        raise HTTPException(status_code=404, detail="Mortgage not found")
    if mortgage.status != MortgageStatus.PENDING:
        raise HTTPException(status_code=400, detail="Mortgage is not pending")

    mortgage.status = MortgageStatus.REJECTED
    mortgage.admin_note = body.admin_note
    mortgage.closed_at = datetime.now(timezone.utc)
    session.add(mortgage)
    session.commit()

    await ws_manager.broadcast("market_update", {"action": "mortgage_rejected", "mortgage_id": mortgage.id})
    return {"message": "Mortgage request rejected"}


# --- TRADING ---

class OrderCreate(BaseModel):
    asset_id: int
    type: str # buy/sell
    quantity: int
    price: float

    @field_validator('quantity')
    @classmethod
    def quantity_positive(cls, v):
        if v <= 0:
            raise ValueError('Quantity must be positive')
        return v

    @field_validator('price')
    @classmethod
    def price_positive(cls, v):
        if v <= 0:
            raise ValueError('Price must be positive')
        return v

@app.post("/orders")
async def place_order_endpoint(order: OrderCreate, user: User = Depends(get_active_user), session: Session = Depends(get_session)):
    _check_rate_limit(user.id)
    sim = MarketEngine(session)
    # Map string to Enum
    otype = OrderType.BUY if order.type.lower() == "buy" else OrderType.SELL
    try:
        sim.place_order(user.id, order.asset_id, otype, order.quantity, order.price)
        await ws_manager.broadcast("trade_executed", {"type": "order", "asset_id": order.asset_id, "user": user.username})
        return {"message": "Order placed"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- T-BILL TREASURY (Direct Purchase) ---

class TBillOrder(BaseModel):
    quantity: int
    
    @field_validator('quantity')
    @classmethod
    def quantity_positive(cls, v):
        if v <= 0:
            raise ValueError('Quantity must be positive')
        return v

@app.post("/treasury/buy")
async def buy_tbills(order: TBillOrder, user: User = Depends(get_active_user), session: Session = Depends(get_session)):
    """Buy T-Bills at current face value (risk-free, no auction)"""
    asset = session.exec(select(Asset).where(Asset.ticker == "TBILL")).first()
    if not asset:
        raise HTTPException(status_code=404, detail="T-Bill asset not found")
    
    total_cost = asset.current_price * order.quantity
    if user.cash < total_cost:
        raise HTTPException(status_code=400, detail=f"Insufficient cash. Need ${total_cost:,.2f}, have ${user.cash:,.2f}")
    
    # Deduct cash
    user.cash -= total_cost
    
    # Add to holdings
    holding = session.exec(select(Holding).where(Holding.user_id == user.id, Holding.asset_id == asset.id)).first()
    if holding:
        holding.quantity += order.quantity
    else:
        holding = Holding(user_id=user.id, asset_id=asset.id, quantity=order.quantity)
    
    session.add(user)
    session.add(holding)
    session.commit()
    
    # Log activity
    act_logger = ActivityLogger(session)
    act_logger.log_action(user_id=user.id, action_type="TBILL_BUY", action_details={
        "quantity": order.quantity, "price_per_unit": asset.current_price, "total_cost": total_cost
    })
    
    await ws_manager.broadcast("trade_executed", {"type": "tbill_buy", "user": user.username, "quantity": order.quantity})
    return {"message": f"Purchased {order.quantity} T-Bills at ${asset.current_price:.2f} each", "total_cost": total_cost}

@app.post("/treasury/sell")
async def sell_tbills(order: TBillOrder, user: User = Depends(get_active_user), session: Session = Depends(get_session)):
    """Sell T-Bills back at current face value"""
    asset = session.exec(select(Asset).where(Asset.ticker == "TBILL")).first()
    if not asset:
        raise HTTPException(status_code=404, detail="T-Bill asset not found")
    
    holding = session.exec(select(Holding).where(Holding.user_id == user.id, Holding.asset_id == asset.id)).first()
    if not holding or holding.quantity < order.quantity:
        raise HTTPException(status_code=400, detail="Insufficient T-Bill holdings")
    
    total_value = asset.current_price * order.quantity
    
    # Credit cash, deduct holdings
    user.cash += total_value
    holding.quantity -= order.quantity
    
    session.add(user)
    session.add(holding)
    session.commit()
    
    # Log activity
    act_logger = ActivityLogger(session)
    act_logger.log_action(user_id=user.id, action_type="TBILL_SELL", action_details={
        "quantity": order.quantity, "price_per_unit": asset.current_price, "total_value": total_value
    })
    
    await ws_manager.broadcast("trade_executed", {"type": "tbill_sell", "user": user.username, "quantity": order.quantity})
    return {"message": f"Sold {order.quantity} T-Bills at ${asset.current_price:.2f} each", "total_value": total_value}

@app.get("/treasury/info")
def get_tbill_info(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Get T-Bill info including current price and user holdings"""
    asset = session.exec(select(Asset).where(Asset.ticker == "TBILL")).first()
    if not asset:
        raise HTTPException(status_code=404, detail="T-Bill asset not found")
    
    holding = session.exec(select(Holding).where(Holding.user_id == user.id, Holding.asset_id == asset.id)).first()
    
    return {
        "asset_id": asset.id,
        "ticker": "TBILL",
        "name": asset.name,
        "current_price": asset.current_price,
        "base_price": asset.base_price,
        "annual_yield": asset.base_cagr * 100,
        "description": asset.description,
        "user_holdings": holding.quantity if holding else 0,
        "user_holdings_value": (holding.quantity * asset.current_price) if holding else 0.0
    }

# --- PRIVATE TRADING ---

@app.post("/offers/create")
async def create_private_offer(
    offer: PrivateOfferCreate,
    user: User = Depends(get_active_user),
    session: Session = Depends(get_session)
):
    """Create a private buy/sell offer"""
    _check_rate_limit(user.id)
    # Check if marketplace is open
    state = session.exec(select(MarketState)).first()
    if not state or not state.marketplace_open:
        raise HTTPException(status_code=400, detail="Marketplace is currently closed")
    if state.phase == "FINISHED":
        raise HTTPException(status_code=400, detail="Trading has ended")

    # Validation
    if offer.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")
    if offer.price_per_unit <= 0:
        raise HTTPException(status_code=400, detail="Price must be positive")
        
    # Get to_user if specified
    to_user_id = None
    if offer.to_username:
        to_user = session.exec(select(User).where(User.username == offer.to_username)).first()
        if not to_user:
            raise HTTPException(status_code=404, detail="Target user not found")
        if to_user.id == user.id:
            raise HTTPException(status_code=400, detail="Cannot offer to self")
        to_user_id = to_user.id
    
    # Check asset validity
    asset = session.exec(select(Asset).where(Asset.ticker == offer.asset_ticker)).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # If selling, check ownership (minus escrowed collateral)
    if offer.offer_type.upper() == "SELL":
        holding = session.exec(select(Holding).where(Holding.user_id == user.id, Holding.asset_id == asset.id)).first()
        escrowed = _get_escrowed_quantity(session, user.id, asset.id)
        available_qty = (holding.quantity if holding else 0) - escrowed
        if available_qty < offer.quantity:
             raise HTTPException(status_code=400, detail=f"Insufficient assets to sell ({escrowed} units escrowed as mortgage collateral)")
    
    # If buying, check cash (optional, but good practice)
    # total_cost = offer.quantity * offer.price_per_unit
    # if offer.offer_type.upper() == "BUY" and user.cash < total_cost:
    #    raise HTTPException(status_code=400, detail="Insufficient cash")

    # Create offer
    otype = OrderType.BUY if offer.offer_type.upper() == "BUY" else OrderType.SELL
    
    # --- AUCTION ROUTING ---
    if not offer.to_username and offer.offer_type.upper() == "SELL" and offer.listing_type == "AUCTION":
        # Submit a secondary auction request — admin approves and creates the live lot
        try:
            # Check for duplicate pending request
            existing_req = session.exec(
                select(SecondaryAuctionRequest).where(
                    SecondaryAuctionRequest.seller_id == user.id,
                    SecondaryAuctionRequest.asset_ticker == offer.asset_ticker.upper(),
                    SecondaryAuctionRequest.status == "pending"
                )
            ).first()
            if existing_req:
                raise HTTPException(status_code=400, detail="You already have a pending auction listing request for this asset")

            new_req = SecondaryAuctionRequest(
                seller_id=user.id,
                asset_ticker=offer.asset_ticker.upper(),
                quantity=offer.quantity,
                reserve_price=offer.price_per_unit,
            )
            session.add(new_req)
            session.commit()
            session.refresh(new_req)

            logger.info(f"User {user.username} submitted secondary auction request for {offer.quantity} {offer.asset_ticker}")
            await ws_manager.broadcast("market_update", {"action": "secondary_request_created", "seller": user.username})
            return {"message": "Auction listing request submitted — waiting for admin approval.", "request_id": new_req.id}
        except HTTPException:
            raise
        except Exception as e:
            session.rollback()
            logger.error(f"Error creating secondary auction request for {user.username}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to submit listing request: {str(e)}")
            
    # --- NORMAL PRIVATE/OPEN OFFER ---
    try:
        new_offer = PrivateOffer(
            from_user_id=user.id,
            to_user_id=to_user_id,
            asset_ticker=offer.asset_ticker,
            offer_type=otype,
            quantity=offer.quantity,
            price_per_unit=offer.price_per_unit,
            total_value=offer.quantity * offer.price_per_unit,
            message=offer.message,
            status=OfferStatus.PENDING
        )
        
        session.add(new_offer)
        session.commit()
        
        await ws_manager.broadcast("market_update", {"action": "offer_created", "from": user.username, "to": offer.to_username})
        return {"message": "Offer created successfully", "offer_id": new_offer.id}
    except Exception as e:
        logger.error(f"Error creating private offer: {e}")
        raise HTTPException(status_code=500, detail="Failed to create offer")

@app.get("/offers/my")
def get_my_offers(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Get all offers sent by or received by current user"""
    sent = session.exec(
        select(PrivateOffer).where(PrivateOffer.from_user_id == user.id).order_by(PrivateOffer.id.desc())
    ).all()
    
    received = session.exec(
        select(PrivateOffer).where(PrivateOffer.to_user_id == user.id).order_by(PrivateOffer.id.desc())
    ).all()
    
    # Also get open offers if user didn't create them
    open_offers = session.exec(
        select(PrivateOffer).where(PrivateOffer.to_user_id == None, PrivateOffer.from_user_id != user.id, PrivateOffer.status == OfferStatus.PENDING)
    ).all()
    
    return {
        "sent": sent,
        "received": received,
        "open_market": open_offers
    }

@app.post("/offers/{offer_id}/accept")
async def accept_offer(offer_id: int, user: User = Depends(get_active_user), session: Session = Depends(get_session)):
    """Accept a pending offer (or queue for admin approval if approval mode is on)"""
    _check_rate_limit(user.id)
    # Check market open
    state = session.exec(select(MarketState)).first()
    if not state or not state.marketplace_open:
        raise HTTPException(status_code=400, detail="Marketplace is currently closed")

    offer = session.get(PrivateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
        
    if offer.status != OfferStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Offer is {offer.status}")
        
    # Verify recipient (if targeted)
    if offer.to_user_id and offer.to_user_id != user.id:
        raise HTTPException(status_code=403, detail="This offer is not for you")
        
    if offer.from_user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot accept your own offer")

    # ── APPROVAL GATE ────────────────────────────────────────────────────────
    if state.trade_requires_approval:
        # Check if approval already queued
        existing_approval = session.exec(
            select(TradeApproval).where(TradeApproval.offer_id == offer_id)
        ).first()
        if existing_approval:
            raise HTTPException(status_code=400, detail="This trade is already awaiting admin approval")
            
        # Lock open offer to the accepting user so admin knows who the counterparty is
        if not offer.to_user_id:
            offer.to_user_id = user.id
            session.add(offer)
            
        approval = TradeApproval(offer_id=offer_id)
        session.add(approval)
        session.commit()
        await ws_manager.broadcast("market_update", {"action": "trade_pending_approval", "offer_id": offer_id})
        return {"message": "Trade submitted for admin approval", "approval_required": True}
    # ── END APPROVAL GATE ────────────────────────────────────────────────────
        
    # Lock open offer to the accepting user for execution tracking
    if not offer.to_user_id:
        offer.to_user_id = user.id
        session.add(offer)
        
    # Execute Trade
    buyer_id = None
    seller_id = None
    
    if offer.offer_type == OrderType.SELL:
        # Offerer is SELLING, User is BUYING
        seller_id = offer.from_user_id
        buyer_id = user.id
    else:
        # Offerer is BUYING, User is SELLING
        buyer_id = offer.from_user_id
        seller_id = user.id
        
    buyer = session.get(User, buyer_id)
    seller = session.get(User, seller_id)
    asset = session.exec(select(Asset).where(Asset.ticker == offer.asset_ticker)).first()
    
    total_cost = offer.total_value
    
    # Check constraints
    if buyer.cash < total_cost:
        raise HTTPException(status_code=400, detail="Buyer has insufficient cash")
        
    seller_holding = session.exec(select(Holding).where(Holding.user_id == seller.id, Holding.asset_id == asset.id)).first()
    if not seller_holding or seller_holding.quantity < offer.quantity:
        raise HTTPException(status_code=400, detail="Seller has insufficient assets")
        
    # Execute Transfer
    buyer.cash -= total_cost
    seller.cash += total_cost
    
    seller_holding.quantity -= offer.quantity
    
    buyer_holding = session.exec(select(Holding).where(Holding.user_id == buyer.id, Holding.asset_id == asset.id)).first()
    if not buyer_holding:
        buyer_holding = Holding(user_id=buyer.id, asset_id=asset.id, quantity=0, avg_cost=0)
        session.add(buyer_holding)
        
    # Update average cost
    current_val = buyer_holding.quantity * buyer_holding.avg_cost
    new_val = current_val + total_cost
    buyer_holding.quantity += offer.quantity
    buyer_holding.avg_cost = new_val / buyer_holding.quantity if buyer_holding.quantity > 0 else offer.price_per_unit
    
    # Update Offer Status
    offer.status = OfferStatus.ACCEPTED
    offer.responded_at = datetime.now(timezone.utc)
    
    # Create Transaction Record
    txn = Transaction(
        buyer_id=buyer.id,
        seller_id=seller.id,
        asset_ticker=offer.asset_ticker,
        quantity=offer.quantity,
        price_per_unit=offer.price_per_unit,
        total_value=total_cost
    )
    # Collusion flag: price deviates >15% from current market mid
    if asset and asset.current_price > 0:
        deviation = abs(offer.price_per_unit - asset.current_price) / asset.current_price
        if deviation > 0.15:
            txn.is_flagged = True
            txn.flag_reason = f"Price {offer.price_per_unit:.2f} deviates {deviation*100:.1f}% from mid {asset.current_price:.2f}"

    session.add(buyer)
    session.add(seller)
    session.add(seller_holding)
    session.add(buyer_holding)
    session.add(offer)
    session.add(txn)

    # Update price impact
    if asset:
        trade_impact = min(0.30, 0.05 * offer.quantity)
        asset.current_price = ((1 - trade_impact) * asset.current_price) + (trade_impact * offer.price_per_unit)
        session.add(asset)

    session.commit()

    act_logger = ActivityLogger(session)
    act_logger.log_action(user_id=user.id, action_type="TRADE", action_details={
        "asset": offer.asset_ticker, "quantity": offer.quantity,
        "price": offer.price_per_unit, "buyer": buyer.username, "seller": seller.username,
        "flagged": txn.is_flagged
    })

    await ws_manager.broadcast("trade_executed", {"type": "private_trade", "offer_id": offer.id, "buyer": buyer.username, "seller": seller.username})
    return {"message": "Offer accepted and trade executed", "transaction_id": txn.id}

@app.post("/offers/{offer_id}/reject")
async def reject_offer(offer_id: int, user: User = Depends(get_active_user), session: Session = Depends(get_session)):
    """Reject an offer sent to you"""
    offer = session.get(PrivateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
        
    if offer.to_user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to reject this offer")
        
    if offer.status != OfferStatus.PENDING:
        raise HTTPException(status_code=400, detail="Offer not pending")
        
    offer.status = OfferStatus.REJECTED
    offer.responded_at = datetime.now(timezone.utc)
    session.add(offer)
    session.commit()
    
    await ws_manager.broadcast("market_update", {"action": "offer_rejected", "offer_id": offer.id})
    return {"message": "Offer rejected"}

@app.get("/transactions")
def get_transactions(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Get all public transactions for transparency"""
    txns = session.exec(select(Transaction).order_by(Transaction.timestamp.desc())).all()
    
    # Enrich with usernames
    result = []
    for txn in txns:
        buyer = session.get(User, txn.buyer_id)
        seller = session.get(User, txn.seller_id)
        result.append({
            **txn.model_dump(),
            "buyer_username": buyer.username if buyer else "Unknown",
            "seller_username": seller.username if seller else "Unknown"
        })
    return result

# --- ADMIN ---

@app.post("/admin/marketplace/open")
def open_marketplace(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    state = session.exec(select(MarketState)).first()
    state.marketplace_open = True
    session.add(state)
    session.commit()
    return {"message": "Marketplace opened for trading"}

@app.post("/admin/marketplace/close")
def close_marketplace(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    state = session.exec(select(MarketState)).first()
    state.marketplace_open = False
    session.add(state)
    session.commit()
    return {"message": "Marketplace closed"}

@app.post("/admin/next-turn")
async def next_turn(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    sim = MarketEngine(session)
    logger = ActivityLogger(session)
    sim.step_simulation()
    state = sim.get_state()
    logger.log_action(user_id=user.id, action_type="ADMIN_ADVANCE_YEAR", action_details={"new_year": state.current_year, "new_quarter": state.current_quarter})
    await ws_manager.broadcast("market_update", {"action": "year_advanced", "year": state.current_year, "quarter": state.current_quarter})
    return {"message": f"Advanced to Year {state.current_year}"}

@app.post("/admin/next-quarter")
async def next_quarter(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Advance simulation by one quarter"""
    sim = MarketEngine(session)
    logger = ActivityLogger(session)
    sim.step_quarter()
    state = sim.get_state()
    logger.log_action(user_id=user.id, action_type="ADMIN_ADVANCE_QUARTER", action_details={"year": state.current_year, "quarter": state.current_quarter})

    # ── MORTGAGE MATURITY CHECK ────────────────────────────────────
    active_mortgages = session.exec(
        select(MortgageLoan).where(MortgageLoan.status == MortgageStatus.ACTIVE)
    ).all()
    defaulted_count = 0
    for mortgage in active_mortgages:
        mortgage.quarters_remaining -= 1
        if mortgage.quarters_remaining <= 0:
            # DEFAULT — transfer collateral to bank
            mortgage.status = MortgageStatus.DEFAULTED
            mortgage.closed_at = datetime.now(timezone.utc)

            borrower = session.get(User, mortgage.borrower_id)
            asset = session.get(Asset, mortgage.collateral_asset_id)

            # Collateral was already removed from borrower's holding at approval time — transfer to banker
            banker = session.exec(select(User).where(User.role == "banker")).first()
            if banker:
                bank_holding = session.exec(
                    select(Holding).where(Holding.user_id == banker.id, Holding.asset_id == asset.id)
                ).first()
                if bank_holding:
                    bank_holding.quantity += mortgage.collateral_quantity
                    session.add(bank_holding)
                else:
                    session.add(Holding(
                        user_id=banker.id, asset_id=asset.id,
                        quantity=mortgage.collateral_quantity, avg_cost=asset.current_price
                    ))

            # Reduce borrower debt by remaining balance (write-off)
            borrower.debt = max(0.0, borrower.debt - mortgage.remaining_balance)
            borrower.is_frozen = True  # Freeze borrower after collateral seizure

            session.add_all([mortgage, borrower])
            defaulted_count += 1
            logger.log_action(
                user_id=borrower.id, action_type="MORTGAGE_DEFAULTED",
                action_details={
                    "mortgage_id": mortgage.id,
                    "collateral": f"{mortgage.collateral_quantity} {asset.ticker}",
                    "remaining_balance": mortgage.remaining_balance,
                }
            )
        else:
            session.add(mortgage)

    if defaulted_count > 0:
        session.commit()
    # ── END MORTGAGE CHECK ─────────────────────────────────────────

    await ws_manager.broadcast("market_update", {"action": "quarter_advanced", "year": state.current_year, "quarter": state.current_quarter})
    return {"message": f"Advanced to Year {state.current_year} Q{state.current_quarter}" + (f" ({defaulted_count} mortgage(s) defaulted)" if defaulted_count else "")}


@app.post("/admin/trigger-shock")
async def trigger_shock(shock: ShockTrigger, user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    sim = MarketEngine(session)
    logger = ActivityLogger(session)
    sim.trigger_shock(shock.type, shock.action)
    logger.log_action(user_id=user.id, action_type="ADMIN_TRIGGER_SHOCK", action_details={"type": shock.type, "action": shock.action})
    await ws_manager.broadcast("shock_triggered", {"type": shock.type, "action": shock.action})
    return {"message": f"Shock {shock.action} triggered for {shock.type}"}

@app.post("/admin/auction/open/{ticker}")
async def open_auction(ticker: str, user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    sim = MarketEngine(session)
    logger = ActivityLogger(session)
    if ticker == 'TBILL':
        raise HTTPException(status_code=400, detail="US Treasury Bills are not auctioned. Players buy them directly.")
    try:
        sim.start_auction(ticker)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    logger.log_action(user_id=user.id, action_type="ADMIN_OPEN_AUCTION", action_details={"ticker": ticker})
    await ws_manager.broadcast("auction_update", {"action": "opened", "ticker": ticker})
    return {"message": f"Auction opened for {ticker}"}

@app.post("/admin/auction/resolve")
async def resolve_auction_endpoint(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Hammer down — closes current active lot. Does NOT auto-advance to next lot."""
    sim = MarketEngine(session)
    logger = ActivityLogger(session)
    result = sim.resolve_auction()
    logger.log_action(user_id=user.id, action_type="ADMIN_RESOLVE_LOT", action_details=result)
    await ws_manager.broadcast("auction_update", {"action": "lot_resolved", "result": result})
    return result

@app.post("/admin/auction/next-lot")
async def open_next_lot_endpoint(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Admin manually opens the next pending lot for bidding."""
    sim = MarketEngine(session)
    logger = ActivityLogger(session)
    result = sim.open_next_lot()
    logger.log_action(user_id=user.id, action_type="ADMIN_OPEN_NEXT_LOT", action_details=result)
    if result.get("opened"):
        await ws_manager.broadcast("auction_update", {"action": "next_lot_opened", "lot_number": result.get("lot_number")})
    return result

@app.post("/admin/auction/end")
async def end_auction_endpoint(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Admin manually ends the auction and returns market to TRADING phase."""
    sim = MarketEngine(session)
    logger = ActivityLogger(session)
    result = sim.end_auction()
    logger.log_action(user_id=user.id, action_type="ADMIN_END_AUCTION", action_details=result)
    await ws_manager.broadcast("auction_update", {"action": "auction_ended"})
    return result

@app.post("/admin/reset-prices")
def reset_asset_prices(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Reset all asset prices to their base prices (recovery from crashes)"""
    assets = session.exec(select(Asset)).all()
    reset_count = 0
    for asset in assets:
        if asset.current_price < asset.base_price * 0.5:  # Only reset if price is below 50% of base
            asset.current_price = asset.base_price
            session.add(asset)
            reset_count += 1
    session.commit()
    return {"message": f"Reset {reset_count} asset(s) to base prices", "reset_count": reset_count}


# ============ NEW ENDPOINTS FOR RESEARCH TRACKING ============

# --- CONSENT & ONBOARDING ---



@app.get("/auction/lots")
def get_auction_lots(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Get all lots for the active auction"""
    state = session.exec(select(MarketState)).first()
    if not state or not state.active_auction_asset:
        return []
    
    lots = session.exec(
        select(AuctionLot).where(AuctionLot.asset_ticker == state.active_auction_asset)
    ).all()
    
    # Enrich with current highest bid for each lot
    result = []
    for lot in lots:
        highest_bid = session.exec(
            select(AuctionBid).where(AuctionBid.lot_id == lot.id)
            .order_by(AuctionBid.amount.desc())
        ).first()
        
        # Get bidder username if there is a highest bid
        highest_bidder_username = None
        if highest_bid:
            bidder = session.get(User, highest_bid.user_id)
            if bidder:
                highest_bidder_username = bidder.username
        
        result.append({
            **lot.model_dump(),
            "highest_bid": highest_bid.amount if highest_bid else None,
            "highest_bidder_id": highest_bid.user_id if highest_bid else None,
            "highest_bidder_username": highest_bidder_username
        })
    
    return result

@app.get("/auction/secondary-lots")
def get_secondary_lots(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Get all active secondary auction lots (team-listed, seller_id is set)"""
    lots = session.exec(
        select(AuctionLot).where(
            AuctionLot.seller_id.isnot(None),
            AuctionLot.status == LotStatus.ACTIVE
        )
    ).all()
    result = []
    for lot in lots:
        highest_bid = session.exec(
            select(AuctionBid).where(AuctionBid.lot_id == lot.id)
            .order_by(AuctionBid.amount.desc())
        ).first()
        seller = session.get(User, lot.seller_id) if lot.seller_id else None
        highest_bidder = session.get(User, highest_bid.user_id) if highest_bid else None
        result.append({
            **lot.model_dump(),
            "seller_username": seller.username if seller else None,
            "highest_bid": highest_bid.amount if highest_bid else None,
            "highest_bidder_id": highest_bid.user_id if highest_bid else None,
            "highest_bidder_username": highest_bidder.username if highest_bidder else None,
        })
    return result


@app.get("/auction/bids/{lot_id}")
def get_lot_bids(lot_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Get all bids for a specific lot"""
    bids = session.exec(
        select(AuctionBid).where(AuctionBid.lot_id == lot_id)
        .order_by(AuctionBid.amount.desc())
    ).all()
    
    # Enrich with usernames
    result = []
    for bid in bids:
        user = session.get(User, bid.user_id)
        result.append({
            **bid.model_dump(),
            "username": user.username if user else "Unknown"
        })
    
    return result


# --- ADMIN PRICE NUDGE ---

# Default auto-news templates when admin hasn't configured custom ones
_DEFAULT_AUTO_NEWS = {
    "up": [
        {"title": "{asset_name} Surges on Strong Demand", "content": "{ticker} prices jumped {change_pct}% amid renewed investor confidence. Analysts cite robust fundamentals and favourable macro conditions driving the rally from ${old_price} to ${new_price}."},
        {"title": "Bullish Momentum Lifts {ticker}", "content": "Strong buying pressure pushed {asset_name} up {change_pct}% today. Market observers note increased institutional interest as prices moved from ${old_price} to ${new_price}."},
        {"title": "{ticker} Rally: Growth Outlook Improves", "content": "{asset_name} advanced {change_pct}% as positive economic indicators bolster growth expectations. The asset moved from ${old_price} to ${new_price}, outpacing sector peers."},
    ],
    "down": [
        {"title": "{asset_name} Slides on Market Concerns", "content": "{ticker} fell {change_pct}% as investors weighed rising uncertainty. The decline from ${old_price} to ${new_price} reflects growing caution across markets."},
        {"title": "Selloff Hits {ticker} Amid Headwinds", "content": "{asset_name} dropped {change_pct}% under pressure from adverse market conditions. Prices retreated from ${old_price} to ${new_price} on elevated selling volume."},
        {"title": "{ticker} Under Pressure: Analysts Flag Risks", "content": "Mounting concerns sent {asset_name} down {change_pct}% today. The move from ${old_price} to ${new_price} has traders watching key support levels closely."},
    ],
}

@app.post("/admin/price/nudge")
async def nudge_asset_price(
    nudge: PriceNudge,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Adjust asset price by percentage or absolute amount, with optional auto-news generation"""
    admin_tools = AdminTools(session)
    logger = ActivityLogger(session)

    try:
        result = admin_tools.nudge_price(
            ticker=nudge.ticker,
            adjustment_pct=nudge.adjustment_pct,
            adjustment_abs=nudge.adjustment_abs,
            admin_username=user.username
        )

        # Log the action
        logger.log_action(
            user_id=user.id,
            action_type="ADMIN_PRICE_NUDGE",
            action_details=result
        )

        # --- Auto-news generation ---
        change_pct = result.get("change_pct", 0)
        if abs(change_pct) >= 0.5:  # Only generate news for moves >= 0.5%
            state = session.exec(select(MarketState)).first()
            asset = session.exec(select(Asset).where(Asset.ticker == nudge.ticker)).first()
            asset_name = asset.name if asset else nudge.ticker

            # Determine direction
            direction = "up" if change_pct > 0 else "down"

            # Get templates: custom per-ticker first, then custom defaults, then built-in defaults
            custom_config = (state.auto_news_config or {}) if state else {}
            ticker_templates = custom_config.get(nudge.ticker, {}).get(direction)
            default_templates = custom_config.get("_default", {}).get(direction)
            templates = ticker_templates or default_templates or _DEFAULT_AUTO_NEWS[direction]

            if templates:
                template = random.choice(templates)
                fmt = {
                    "ticker": nudge.ticker,
                    "asset_name": asset_name,
                    "change_pct": f"{abs(change_pct):.1f}",
                    "old_price": f"{result['old_price']:,.2f}",
                    "new_price": f"{result['new_price']:,.2f}",
                }
                title = template["title"].format(**fmt)
                content = template["content"].format(**fmt)

                news_item = NewsItem(
                    title=title,
                    content=content,
                    is_published=True,
                    source="Market Wire",
                    published_at=datetime.now(timezone.utc),
                    sim_year=state.current_year if state else None,
                    sim_quarter=state.current_quarter if state else None,
                    category="market",
                )
                session.add(news_item)
                session.commit()

                await ws_manager.broadcast("news_update", {"title": title})
                result["auto_news"] = title

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- AUTO-NEWS CONFIG ---

class AutoNewsTemplate(BaseModel):
    title: str
    content: str

class AutoNewsConfigBody(BaseModel):
    ticker: str  # asset ticker or "_default" for fallback templates
    up: list[dict]  # [{title, content}] — templates for price increases
    down: list[dict]  # [{title, content}] — templates for price decreases

@app.get("/admin/auto-news/config")
def get_auto_news_config(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Get current auto-news template configuration"""
    state = session.exec(select(MarketState)).first()
    return {
        "config": state.auto_news_config or {} if state else {},
        "defaults": _DEFAULT_AUTO_NEWS,
        "placeholders": ["{ticker}", "{asset_name}", "{change_pct}", "{old_price}", "{new_price}"],
    }

@app.post("/admin/auto-news/config")
def set_auto_news_config(body: AutoNewsConfigBody, user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Set auto-news templates for a specific ticker (or '_default' for fallback)"""
    state = session.exec(select(MarketState)).first()
    if not state:
        raise HTTPException(status_code=404, detail="MarketState not found")

    config = dict(state.auto_news_config or {})
    config[body.ticker] = {
        "up": [{"title": t["title"], "content": t["content"]} for t in body.up],
        "down": [{"title": t["title"], "content": t["content"]} for t in body.down],
    }
    state.auto_news_config = config
    session.add(state)
    session.commit()
    return {"message": f"Auto-news templates saved for {body.ticker}"}

@app.delete("/admin/auto-news/config/{ticker}")
def delete_auto_news_config(ticker: str, user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Remove custom auto-news templates for a ticker (reverts to defaults)"""
    state = session.exec(select(MarketState)).first()
    if not state or not state.auto_news_config:
        raise HTTPException(status_code=404, detail="No auto-news config found")

    config = dict(state.auto_news_config)
    if ticker in config:
        del config[ticker]
        state.auto_news_config = config if config else None
        session.add(state)
        session.commit()
    return {"message": f"Auto-news templates removed for {ticker}. Using defaults."}


# --- ADMIN CREDENTIALS ---

@app.post("/admin/credentials/update")
def update_admin_credentials(
    cred_update: AdminCredUpdate,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Update admin username and/or password"""
    admin_tools = AdminTools(session)
    
    try:
        result = admin_tools.change_admin_credentials(
            new_username=cred_update.new_username,
            new_password=cred_update.new_password,
            current_admin_username=user.username
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# --- NEWS SYSTEM ---

@app.get("/news")
def get_news(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Get all published news"""
    news = session.exec(select(NewsItem).where(NewsItem.is_published == True).order_by(NewsItem.published_at.desc())).all()
    return news

@app.get("/admin/news/all")
def get_all_news_admin(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Get ALL news (including drafts) for admin"""
    news = session.exec(select(NewsItem).order_by(NewsItem.published_at.desc())).all()
    return news

@app.post("/admin/news/create")
async def create_news(
    news: NewsCreate,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    try:
        item = NewsItem(
            title=news.title,
            content=news.content,
            is_published=news.is_published,
            image_url=news.image_url,
            source=news.source,
            published_at=datetime.now(timezone.utc)
        )
        session.add(item)
        session.commit()

        act_logger = ActivityLogger(session)
        act_logger.log_action(user_id=user.id, action_type="NEWS_PUBLISHED", action_details={
            "title": item.title, "is_published": item.is_published, "news_id": item.id
        })

        if item.is_published:
            await ws_manager.broadcast("news_update", {"title": item.title})

        return {"message": "News item created", "id": item.id}
    except Exception as e:
        print(f"Error creating news: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create news: {str(e)}")

@app.put("/admin/news/{news_id}")
async def update_news(
    news_id: int,
    news: NewsCreate,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    item = session.get(NewsItem, news_id)
    if not item:
        raise HTTPException(status_code=404, detail="News item not found")
        
    item.title = news.title
    item.content = news.content
    item.is_published = news.is_published
    item.image_url = news.image_url
    item.source = news.source
    
    session.add(item)
    session.commit()
    
    if item.is_published:
        await ws_manager.broadcast("news_update", {"title": item.title})
        
    return {"message": "News item updated"}

@app.delete("/admin/news/{news_id}")
async def delete_news(
    news_id: int,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    item = session.get(NewsItem, news_id)
    if item:
        session.delete(item)
        session.commit()
        await ws_manager.broadcast("news_update", {"action": "deleted"})
    return {"message": "News item deleted"}

# --- DATA EXPORT ---

@app.get("/admin/export/activity")
def export_activity_data(
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Export all activity logs as CSV"""
    admin_tools = AdminTools(session)
    csv_data = admin_tools.export_activity_data_csv()
    
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=activity_logs.csv"}
    )

@app.get("/admin/export/teams")
def export_team_data(
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Export team leader information as CSV"""
    admin_tools = AdminTools(session)
    csv_data = admin_tools.export_team_info_csv()
    
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=team_info.csv"}
    )

@app.get("/admin/export/summary")
def get_research_summary(
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Get summary statistics for research data"""
    admin_tools = AdminTools(session)
    return admin_tools.get_research_summary()


# --- ACTIVITY LOGGING (for frontend to track views) ---

@app.post("/activity/log")
def log_activity(
    log_request: ActivityLogRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Log user activity from frontend"""
    logger = ActivityLogger(session)
    logger.log_action(
        user_id=user.id,
        action_type=log_request.action_type,
        action_details=log_request.action_details,
        duration_ms=log_request.duration_ms
    )
    return {"message": "Activity logged"}


# --- TEAM CREDENTIAL MANAGEMENT ---

@app.post("/users/change-password")
def change_team_password(
    current_password: str,
    new_password: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Allow team users to change their own password"""
    # Verify current password
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    
    # Validate new password
    validate_password_strength(new_password)
    
    # Update password
    user.hashed_password = get_password_hash(new_password)
    session.add(user)
    session.commit()
    
    return {"message": "Password changed successfully"}


@app.get("/admin/login-status")
def get_login_status(
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Get login status of all team users"""
    teams = session.exec(select(User).where(User.role == Role.TEAM)).all()
    
    result = []
    now = datetime.now(timezone.utc)
    
    for team in teams:
        # Consider online if last_seen within last 2 minutes
        is_online = False
        if team.last_seen:
            # Ensure timezone awareness
            last_seen_aware = team.last_seen
            if last_seen_aware.tzinfo is None:
                last_seen_aware = last_seen_aware.replace(tzinfo=timezone.utc)
                
            time_since_seen = now - last_seen_aware
            is_online = time_since_seen.total_seconds() < 120 # 2 minutes
        
        result.append({
            "id": team.id,
            "username": team.username,
            "is_online": is_online,
            "last_login": team.last_login,
            "last_seen": team.last_seen,
            "is_frozen": team.is_frozen,
            "has_consented": team.has_consented
        })
        
    return result


@app.put("/admin/teams/{team_id}/credentials")
def admin_change_team_credentials(
    team_id: int,
    new_username: Optional[str] = None,
    new_password: Optional[str] = None,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Admin can change a team's username and/or password"""
    team = session.get(User, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team.role != Role.TEAM:
        raise HTTPException(status_code=400, detail="Can only modify team accounts")
    
    # Update username if provided
    if new_username:
        # Check if username already exists
        existing = session.exec(select(User).where(User.username == new_username)).first()
        if existing and existing.id != team_id:
            raise HTTPException(status_code=400, detail="Username already exists")
        team.username = new_username
    
    # Update password if provided
    if new_password:
        if len(new_password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        team.hashed_password = get_password_hash(new_password)
    
    session.add(team)
    session.commit()
    session.refresh(team)
    
    return {"message": "Team credentials updated successfully", "username": team.username}


@app.delete("/admin/teams/{team_id}")
def admin_delete_team(
    team_id: int,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Admin can delete a team account"""
    team = session.get(User, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    if team.role != Role.TEAM:
        raise HTTPException(status_code=400, detail="Can only delete team accounts")
    
    # Delete related data
    # Delete holdings
    holdings = session.exec(select(Holding).where(Holding.user_id == team_id)).all()
    for holding in holdings:
        session.delete(holding)
    
    # Delete orders
    orders = session.exec(select(Order).where(Order.user_id == team_id)).all()
    for order in orders:
        session.delete(order)
    
    # Delete loans (both as lender and borrower)
    loans = session.exec(select(TeamLoan).where(
        (TeamLoan.borrower_id == team_id) | (TeamLoan.lender_id == team_id)
    )).all()
    for loan in loans:
        session.delete(loan)
    
    # Delete auction bids
    bids = session.exec(select(AuctionBid).where(AuctionBid.user_id == team_id)).all()
    for bid in bids:
        session.delete(bid)
    
    # Delete activity logs
    logs = session.exec(select(ActivityLog).where(ActivityLog.user_id == team_id)).all()
    for log in logs:
        session.delete(log)
    
    # Delete consent record
    consent = session.exec(select(ConsentRecord).where(ConsentRecord.user_id == team_id)).first()
    if consent:
        session.delete(consent)
    
    # Delete team leader info
    team_info = session.exec(select(TeamLeaderInfo).where(TeamLeaderInfo.user_id == team_id)).first()
    if team_info:
        session.delete(team_info)
    
    # Finally delete the user
    session.delete(team)
    session.commit()
    
    return {"message": f"Team '{team.username}' deleted successfully"}

@app.post("/admin/users/{user_id}/freeze")
def freeze_user(
    user_id: int,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Toggle freeze status for a user"""
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    
    target.is_frozen = not target.is_frozen
    session.add(target)
    session.commit()
    
    status = "FROZEN" if target.is_frozen else "ACTIVE"
    return {"message": f"User {target.username} remains now {status}", "is_frozen": target.is_frozen}

@app.post("/admin/users/{user_id}/hide")
def toggle_hide_user(
    user_id: int,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Toggle hidden status — hidden teams are invisible to other teams (leaderboard, loan partners)."""
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.is_hidden = not target.is_hidden
    session.add(target)
    session.commit()
    status = "HIDDEN" if target.is_hidden else "VISIBLE"
    return {"message": f"User {target.username} is now {status}", "is_hidden": target.is_hidden}

@app.post("/admin/users/{user_id}/liquidate")
def liquidate_user(
    user_id: int,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Liquidate all assets of a team to cash at current market prices"""
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
        
    holdings = session.exec(select(Holding).where(Holding.user_id == user_id)).all()
    total_value = 0.0
    
    for holding in holdings:
        asset = session.get(Asset, holding.asset_id)
        if asset:
            market_value = holding.quantity * asset.current_price
            total_value += market_value
            # "Sell" to market (system absorbs)
            session.delete(holding)
            
    target.cash += total_value
    session.add(target)
    session.commit()
    
    return {"message": f"Liquidated all assets for ${total_value:,.2f}", "cash_added": total_value}


# --- CONSENT ENDPOINTS (Fixing Missing Implementation) ---

@app.post("/consent/accept")
def submit_consent(
    form_data: ConsentAccept,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Record user consent and team leader info"""
    # 1. Check if already consented
    existing = session.exec(select(ConsentRecord).where(ConsentRecord.user_id == user.id)).first()
    if existing:
        return {"message": "Already consented"}
        
    # 2. Create Consent Record
    consent = ConsentRecord(
        user_id=user.id,
        ip_address="0.0.0.0", # Placeholder, would get from request in real deploys
        consent_text_version="v1.0"
    )
    session.add(consent)
    
    # 3. Save Leader Info
    info = TeamLeaderInfo(
        user_id=user.id,
        leader_name=form_data.leader_name,
        email=form_data.email,
        age=form_data.age,
        team_size=form_data.team_size
    )
    session.add(info)
    
    # 4. Update User Profile
    user.has_consented = True
    session.add(user)
    
    session.commit()
    return {"message": "Consent recorded successfully"}

@app.get("/consent/status")
def check_consent_status(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Check if current user has provided consent"""
    # Check both the user flag and the record for robustness
    record = session.exec(select(ConsentRecord).where(ConsentRecord.user_id == user.id)).first()
    has_consented = user.has_consented or (record is not None)
    
    return {"has_consented": has_consented}


# ============ NEW ADMIN CONTROL ENDPOINTS ============

@app.post("/admin/teams/{team_id}/add-cash")
async def admin_add_cash(
    team_id: int,
    body: CashAdjustment,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Grant additional capital (cap) to a specific team"""
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    team = session.get(User, team_id)
    if not team or team.role != Role.TEAM:
        raise HTTPException(status_code=404, detail="Team not found")

    team.cash += body.amount
    session.add(team)

    act_logger = ActivityLogger(session)
    act_logger.log_action(user_id=user.id, action_type="ADMIN_ADD_CASH", action_details={
        "team_id": team_id, "team": team.username, "amount": body.amount, "reason": body.reason or ""
    })

    session.commit()
    await ws_manager.broadcast("market_update", {"action": "cash_added", "team": team.username, "amount": body.amount})
    return {"message": f"Added ${body.amount:,.2f} to {team.username}", "new_balance": team.cash}


@app.post("/admin/teams/{team_id}/penalty")
async def admin_penalty(
    team_id: int,
    body: CashAdjustment,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Deduct a penalty from a team's cash balance (floors at $0)"""
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Penalty amount must be positive")
    team = session.get(User, team_id)
    if not team or team.role != Role.TEAM:
        raise HTTPException(status_code=404, detail="Team not found")

    deducted = min(body.amount, team.cash)  # floor at 0
    team.cash = max(0.0, team.cash - body.amount)
    session.add(team)

    act_logger = ActivityLogger(session)
    act_logger.log_action(user_id=user.id, action_type="ADMIN_PENALTY", action_details={
        "team_id": team_id, "team": team.username, "amount": body.amount, "deducted": deducted, "reason": body.reason or ""
    })

    session.commit()
    await ws_manager.broadcast("market_update", {"action": "penalty_applied", "team": team.username, "amount": deducted})
    return {"message": f"Penalty of ${deducted:,.2f} applied to {team.username}", "new_balance": team.cash}


class DividendBody(BaseModel):
    ticker: str
    amount_per_unit: float
    note: Optional[str] = None

    @field_validator('amount_per_unit')
    @classmethod
    def amount_positive(cls, v):
        if v <= 0: raise ValueError('Dividend must be positive')
        return v


@app.post("/admin/dividends")
async def issue_dividend(
    body: DividendBody,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Issue a cash dividend to all holders of an asset, proportional to their holdings."""
    ticker = body.ticker.upper()
    asset = session.exec(select(Asset).where(Asset.ticker == ticker)).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    state = session.exec(select(MarketState)).first()

    # Find all holdings of this asset
    holdings = session.exec(select(Holding).where(Holding.asset_id == asset.id)).all()
    if not holdings:
        raise HTTPException(status_code=400, detail=f"No teams currently hold {ticker}")

    total_paid = 0.0
    recipients = 0
    for holding in holdings:
        payout = round(body.amount_per_unit * holding.quantity, 2)
        holder = session.get(User, holding.user_id)
        if holder and holder.role not in (Role.ADMIN,):
            holder.cash += payout
            session.add(holder)
            total_paid += payout
            recipients += 1

    # Create a news item so it appears in the news feed
    note_text = f" — {body.note}" if body.note else ""
    news = NewsItem(
        title=f"{ticker} Dividend Issued: ${body.amount_per_unit:,.2f}/unit",
        content=(
            f"The market authority has issued a dividend of ${body.amount_per_unit:,.2f} per unit "
            f"on {asset.name} ({ticker}). All {recipients} holding team(s) received a proportional payout "
            f"totalling ${total_paid:,.2f}.{note_text}"
        ),
        is_published=True,
        published_at=datetime.now(timezone.utc),
        sim_year=state.current_year if state else None,
        sim_quarter=state.current_quarter if state else None,
        category="market",
    )
    session.add(news)
    session.commit()

    await ws_manager.broadcast("news_update", {"title": news.title, "action": "dividend_issued"})
    await ws_manager.broadcast("market_update", {
        "action": "dividend_issued",
        "ticker": ticker,
        "amount_per_unit": body.amount_per_unit,
        "total_paid": total_paid,
        "recipients": recipients,
    })
    return {"message": f"Dividend issued: ${body.amount_per_unit:,.2f}/unit × {recipients} teams = ${total_paid:,.2f} distributed.", "total_paid": total_paid, "recipients": recipients}


@app.post("/admin/market/toggle-trade-approval")
async def toggle_trade_approval(
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Toggle whether private trades require admin approval before executing"""
    state = session.exec(select(MarketState)).first()
    state.trade_requires_approval = not state.trade_requires_approval
    session.add(state)
    session.commit()
    status = "ENABLED" if state.trade_requires_approval else "DISABLED"
    await ws_manager.broadcast("market_update", {"action": "trade_approval_toggled", "enabled": state.trade_requires_approval})
    return {"message": f"Trade approval mode {status}", "trade_requires_approval": state.trade_requires_approval}


@app.get("/admin/trade-approvals")
def get_trade_approvals(
    user: User = Depends(get_approver),
    session: Session = Depends(get_session)
):
    """List all trade approvals (pending and resolved)"""
    approvals = session.exec(
        select(TradeApproval).order_by(TradeApproval.id.desc())
    ).all()

    result = []
    for approval in approvals:
        offer = session.get(PrivateOffer, approval.offer_id)
        if not offer:
            continue
        from_user = session.get(User, offer.from_user_id)
        to_user = session.get(User, offer.to_user_id) if offer.to_user_id else None
        result.append({
            "id": approval.id,
            "offer_id": approval.offer_id,
            "status": approval.status,
            "admin_note": approval.admin_note,
            "created_at": approval.created_at,
            "resolved_at": approval.resolved_at,
            "resolved_by": approval.resolved_by,
            # Offer details
            "asset_ticker": offer.asset_ticker,
            "offer_type": offer.offer_type,
            "quantity": offer.quantity,
            "price_per_unit": offer.price_per_unit,
            "total_value": offer.total_value,
            "from_username": from_user.username if from_user else "Unknown",
            "to_username": to_user.username if to_user else "Open Market",
            "message": offer.message,
        })
    return result


@app.post("/admin/trade-approvals/{approval_id}/approve")
async def approve_trade(
    approval_id: int,
    body: TradeApprovalAction,
    user: User = Depends(get_approver),
    session: Session = Depends(get_session)
):
    """Approve a pending trade — executes the underlying offer"""
    approval = session.get(TradeApproval, approval_id)
    if not approval:
        raise HTTPException(status_code=404, detail="Approval record not found")
    if approval.status != TradeApprovalStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Trade is already {approval.status}")

    offer = session.get(PrivateOffer, approval.offer_id)
    if not offer or offer.status != OfferStatus.PENDING:
        raise HTTPException(status_code=400, detail="Offer is no longer pending")

    asset = session.exec(select(Asset).where(Asset.ticker == offer.asset_ticker)).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Determine buyer / seller
    if offer.offer_type == OrderType.SELL:
        seller_id, buyer_id = offer.from_user_id, offer.to_user_id
    else:
        buyer_id, seller_id = offer.from_user_id, offer.to_user_id

    if not buyer_id or not seller_id:
        raise HTTPException(status_code=400, detail="Cannot approve an open-market offer with no counterparty yet")

    buyer = session.get(User, buyer_id)
    seller = session.get(User, seller_id)
    total_cost = offer.total_value

    if not buyer or not seller:
        raise HTTPException(status_code=400, detail="Buyer or seller not found")
    if buyer.cash < total_cost:
        raise HTTPException(status_code=400, detail="Buyer has insufficient cash")

    seller_holding = session.exec(
        select(Holding).where(Holding.user_id == seller.id, Holding.asset_id == asset.id)
    ).first()
    if not seller_holding or seller_holding.quantity < offer.quantity:
        raise HTTPException(status_code=400, detail="Seller has insufficient assets")

    # Execute Transfer
    buyer.cash -= total_cost
    seller.cash += total_cost
    seller_holding.quantity -= offer.quantity

    buyer_holding = session.exec(
        select(Holding).where(Holding.user_id == buyer.id, Holding.asset_id == asset.id)
    ).first()
    if not buyer_holding:
        buyer_holding = Holding(user_id=buyer.id, asset_id=asset.id, quantity=0, avg_cost=0)
        session.add(buyer_holding)

    current_val = buyer_holding.quantity * buyer_holding.avg_cost
    buyer_holding.quantity += offer.quantity
    buyer_holding.avg_cost = (current_val + total_cost) / buyer_holding.quantity

    offer.status = OfferStatus.ACCEPTED
    offer.responded_at = datetime.now(timezone.utc)

    txn = Transaction(
        buyer_id=buyer.id,
        seller_id=seller.id,
        asset_ticker=offer.asset_ticker,
        quantity=offer.quantity,
        price_per_unit=offer.price_per_unit,
        total_value=total_cost
    )
    # Collusion flag on admin-approved trades
    if asset.current_price > 0:
        deviation = abs(offer.price_per_unit - asset.current_price) / asset.current_price
        if deviation > 0.15:
            txn.is_flagged = True
            txn.flag_reason = f"Price {offer.price_per_unit:.2f} deviates {deviation*100:.1f}% from mid {asset.current_price:.2f}"

    # Price impact
    trade_impact = min(0.30, 0.05 * offer.quantity)
    asset.current_price = ((1 - trade_impact) * asset.current_price) + (trade_impact * offer.price_per_unit)
    session.add(asset)

    approval.status = TradeApprovalStatus.APPROVED
    approval.admin_note = body.admin_note
    approval.resolved_at = datetime.now(timezone.utc)
    approval.resolved_by = user.username

    session.add_all([buyer, seller, seller_holding, buyer_holding, offer, txn, approval])
    session.commit()

    act_logger = ActivityLogger(session)
    act_logger.log_action(user_id=user.id, action_type="TRADE_APPROVED", action_details={
        "approval_id": approval_id, "asset": offer.asset_ticker,
        "quantity": offer.quantity, "price": offer.price_per_unit,
        "buyer": buyer.username, "seller": seller.username, "flagged": txn.is_flagged
    })

    await ws_manager.broadcast("trade_executed", {
        "type": "admin_approved_trade", "offer_id": offer.id,
        "buyer": buyer.username, "seller": seller.username
    })
    return {"message": f"Trade approved and executed. Transaction ID: {txn.id}"}


@app.post("/admin/trade-approvals/{approval_id}/reject")
async def reject_trade(
    approval_id: int,
    body: TradeApprovalAction,
    user: User = Depends(get_approver),
    session: Session = Depends(get_session)
):
    """Reject a pending trade — offer is cancelled"""
    approval = session.get(TradeApproval, approval_id)
    if not approval:
        raise HTTPException(status_code=404, detail="Approval record not found")
    if approval.status != TradeApprovalStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Trade is already {approval.status}")

    offer = session.get(PrivateOffer, approval.offer_id)
    if offer:
        offer.status = OfferStatus.CANCELLED
        offer.responded_at = datetime.now(timezone.utc)
        session.add(offer)

    approval.status = TradeApprovalStatus.REJECTED
    approval.admin_note = body.admin_note
    approval.resolved_at = datetime.now(timezone.utc)
    approval.resolved_by = user.username
    session.add(approval)
    session.commit()

    await ws_manager.broadcast("market_update", {"action": "trade_rejected", "offer_id": approval.offer_id})
    return {"message": "Trade rejected. Offer has been cancelled."}


@app.get("/admin/flagged-trades")
async def get_flagged_trades(
    _admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Return all transactions flagged for potential collusion (price >15% off mid)."""
    txns = session.exec(select(Transaction).where(Transaction.is_flagged == True)).all()
    result = []
    for t in txns:
        buyer = session.get(User, t.buyer_id)
        seller = session.get(User, t.seller_id)
        result.append({
            "id": t.id,
            "asset": t.asset_ticker,
            "quantity": t.quantity,
            "price": t.price_per_unit,
            "total": t.total_value,
            "flag_reason": t.flag_reason,
            "timestamp": t.timestamp.isoformat(),
            "buyer": buyer.username if buyer else str(t.buyer_id),
            "seller": seller.username if seller else str(t.seller_id),
        })
    return result


@app.post("/admin/end-trading")
async def end_trading_endpoint(
    admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Lock the market, close credit facility, and set phase to FINISHED."""
    state = session.exec(select(MarketState)).first()
    if not state:
        raise HTTPException(status_code=404, detail="No market state")
    state.marketplace_open = False
    state.phase = "FINISHED"
    state.credit_facility_open = False
    session.add(state)
    session.commit()
    await ws_manager.broadcast("market_update", {"action": "trading_ended", "phase": "FINISHED"})
    return {"message": "Trading ended. Market is now closed."}


# ============ NEW ENDPOINTS ============

# --- USER AUCTION LOTS ---

@app.get("/auction/my-lots")
def get_my_auction_lots(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Get all auction lots listed by the current user (seller)"""
    lots = session.exec(
        select(AuctionLot).where(AuctionLot.seller_id == user.id)
        .order_by(AuctionLot.id.desc())
    ).all()
    result = []
    for lot in lots:
        winner = session.get(User, lot.winner_id) if lot.winner_id else None
        result.append({
            **lot.model_dump(),
            "winner_username": winner.username if winner else None
        })
    return result


# --- CREDIT FACILITY CONTROL ---

@app.post("/admin/credit/open")
async def open_credit_facility(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    state = session.exec(select(MarketState)).first()
    state.credit_facility_open = True
    session.add(state)
    session.commit()
    await ws_manager.broadcast("market_update", {"action": "credit_opened"})
    return {"message": "Credit facility opened", "credit_facility_open": True}


@app.post("/admin/credit/close")
async def close_credit_facility(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    state = session.exec(select(MarketState)).first()
    state.credit_facility_open = False
    session.add(state)
    session.commit()
    await ws_manager.broadcast("market_update", {"action": "credit_closed"})
    return {"message": "Credit facility locked", "credit_facility_open": False}


# --- ADMIN LOAN APPROVALS ---

class LoanApprovalAction(BaseModel):
    admin_note: Optional[str] = None


@app.get("/admin/loan-approvals")
def get_loan_approvals(user: User = Depends(get_banker_or_admin), session: Session = Depends(get_session)):
    """List all loan approval requests"""
    approvals = session.exec(select(LoanApproval).order_by(LoanApproval.id.desc())).all()
    result = []
    for approval in approvals:
        loan = session.get(TeamLoan, approval.loan_id)
        if not loan:
            continue
        lender = session.get(User, loan.lender_id)
        borrower = session.get(User, loan.borrower_id)
        result.append({
            "id": approval.id,
            "loan_id": approval.loan_id,
            "status": approval.status,
            "admin_note": approval.admin_note,
            "created_at": approval.created_at,
            "resolved_at": approval.resolved_at,
            "resolved_by": approval.resolved_by,
            "principal": loan.principal,
            "interest_rate": loan.interest_rate,
            "lender_username": lender.username if lender else "Unknown",
            "borrower_username": borrower.username if borrower else "Unknown",
        })
    return result


@app.post("/admin/loan-approvals/{approval_id}/approve")
async def approve_loan(approval_id: int, body: LoanApprovalAction, user: User = Depends(get_banker_or_admin), session: Session = Depends(get_session)):
    """Approve a loan — executes the cash transfer"""
    approval = session.get(LoanApproval, approval_id)
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    if approval.status != LoanApprovalStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Approval is already {approval.status}")
    
    loan = session.get(TeamLoan, approval.loan_id)
    if not loan or loan.status != "pending":
        raise HTTPException(status_code=400, detail="Loan is no longer pending")
    
    lender = session.get(User, loan.lender_id)
    borrower = session.get(User, loan.borrower_id)
    
    if not lender or not borrower:
        raise HTTPException(status_code=404, detail="Lender or borrower not found")
    if lender.cash < loan.principal:
        raise HTTPException(status_code=400, detail="Lender has insufficient funds")
    
    # Execute transfer
    lender.cash -= loan.principal
    borrower.cash += loan.principal
    borrower.debt += loan.principal
    loan.status = "active"
    if loan.remaining_balance == 0:
        loan.remaining_balance = loan.principal
    
    approval.status = LoanApprovalStatus.APPROVED
    approval.admin_note = body.admin_note
    approval.resolved_at = datetime.now(timezone.utc)
    approval.resolved_by = user.username
    
    session.add_all([lender, borrower, loan, approval])
    session.commit()
    
    await ws_manager.broadcast("market_update", {"action": "loan_approved", "loan_id": loan.id})
    return {"message": f"Loan of ${loan.principal:,.2f} approved. Funds transferred to {borrower.username}."}


@app.post("/admin/loan-approvals/{approval_id}/reject")
async def reject_loan(approval_id: int, body: LoanApprovalAction, user: User = Depends(get_banker_or_admin), session: Session = Depends(get_session)):
    """Reject a loan approval — loan reverts to pending status"""
    approval = session.get(LoanApproval, approval_id)
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    if approval.status != LoanApprovalStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Approval is already {approval.status}")
    
    approval.status = LoanApprovalStatus.REJECTED
    approval.admin_note = body.admin_note
    approval.resolved_at = datetime.now(timezone.utc)
    approval.resolved_by = user.username
    session.add(approval)
    session.commit()
    
    await ws_manager.broadcast("market_update", {"action": "loan_rejected", "loan_id": approval.loan_id})
    return {"message": "Loan rejected"}


# --- ADMIN TEAM PORTFOLIO VIEW ---

@app.get("/admin/teams/{team_id}/portfolio")
def get_team_portfolio(team_id: int, user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Get full portfolio view for a specific team"""
    team = session.get(User, team_id)
    if not team or team.role != Role.TEAM:
        raise HTTPException(status_code=404, detail="Team not found")
    
    # Holdings
    holdings = session.exec(select(Holding).where(Holding.user_id == team_id)).all()
    assets = {a.id: a for a in session.exec(select(Asset)).all()}
    holdings_data = []
    portfolio_value = 0.0
    for h in holdings:
        asset = assets.get(h.asset_id)
        if asset:
            mv = h.quantity * asset.current_price
            portfolio_value += mv
            holdings_data.append({
                "ticker": asset.ticker,
                "name": asset.name,
                "quantity": h.quantity,
                "avg_cost": round(h.avg_cost, 2),
                "current_price": round(asset.current_price, 2),
                "market_value": round(mv, 2),
                "unrealized_pnl": round((asset.current_price - h.avg_cost) * h.quantity, 2)
            })
    
    # Active loans
    loans = session.exec(
        select(TeamLoan).where(
            ((TeamLoan.borrower_id == team_id) | (TeamLoan.lender_id == team_id)),
            TeamLoan.status == "active"
        )
    ).all()
    loans_data = []
    for loan in loans:
        lender = session.get(User, loan.lender_id)
        borrower = session.get(User, loan.borrower_id)
        loans_data.append({
            "id": loan.id,
            "role": "borrower" if loan.borrower_id == team_id else "lender",
            "counterparty": lender.username if loan.borrower_id == team_id else borrower.username,
            "principal": loan.principal,
            "remaining_balance": loan.remaining_balance,
            "interest_rate": loan.interest_rate,
            "missed_quarters": loan.missed_quarters,
        })
    
    # Recent activity (last 15)
    activity = session.exec(
        select(ActivityLog).where(ActivityLog.user_id == team_id)
        .order_by(ActivityLog.timestamp.desc()).limit(15)
    ).all()
    
    return {
        "username": team.username,
        "cash": round(team.cash, 2),
        "debt": round(team.debt, 2),
        "is_frozen": team.is_frozen,
        "net_worth": round(team.cash + portfolio_value - team.debt, 2),
        "portfolio_value": round(portfolio_value, 2),
        "holdings": holdings_data,
        "loans": loans_data,
        "recent_activity": [
            {
                "action_type": a.action_type,
                "action_details": a.action_details,
                "timestamp": a.timestamp
            } for a in activity
        ]
    }


# --- ADMIN GLOBAL ACTIVITY FEED ---

@app.get("/admin/activity-feed")
def get_activity_feed(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Get last 50 activity log entries across all teams"""
    logs = session.exec(
        select(ActivityLog).order_by(ActivityLog.timestamp.desc()).limit(50)
    ).all()
    result = []
    for log in logs:
        team = session.get(User, log.user_id)
        result.append({
            "id": log.id,
            "username": team.username if team else "Unknown",
            "action_type": log.action_type,
            "action_details": log.action_details,
            "timestamp": log.timestamp,
            "duration_ms": log.duration_ms,
        })
    return result


@app.get("/admin/teams/{team_id}/activity")
def get_team_activity(team_id: int, user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Get last 20 activity log entries for a specific team"""
    logs = session.exec(
        select(ActivityLog).where(ActivityLog.user_id == team_id)
        .order_by(ActivityLog.timestamp.desc()).limit(20)
    ).all()
    return logs


@app.post("/admin/migrate-assets")
def migrate_asset_tickers(
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """
    One-time migration: rename old asset tickers to new names.
    TECH -> NVDA, OIL -> BRENT, REAL -> REITS
    Safe to run multiple times (idempotent).
    """
    RENAMES = {
        "TECH": ("NVDA", "NVIDIA Growth ETF", "High growth, high risk AI & semiconductor sector."),
        "OIL": ("BRENT", "S&P Brent Crude Oil", "Cyclical energy commodity benchmarked to Brent crude."),
        "REAL": ("REITS", "REITs Index", "Real Estate Investment Trust diversified index."),
    }
    migrated = []
    for old_ticker, (new_ticker, new_name, new_desc) in RENAMES.items():
        asset = session.exec(select(Asset).where(Asset.ticker == old_ticker)).first()
        if asset:
            asset.ticker = new_ticker
            asset.name = new_name
            asset.description = new_desc
            session.add(asset)
            migrated.append(f"{old_ticker} → {new_ticker}")

    session.commit()
    if migrated:
        return {"message": f"Migration complete: {', '.join(migrated)}"}
    return {"message": "Nothing to migrate — tickers are already up to date."}


# ============ BANKING SYSTEM & SHORT SELLING (v2 — Approval-Based) ============

# --- Pydantic Schemas ---

class ShortCoverRequest(BaseModel):
    position_id: int


class BankerCreateRequest(BaseModel):
    username: str
    password: str
    initial_capital: float = 10_000_000.0


class BankerCapitalRequest(BaseModel):
    amount: float
    reason: Optional[str] = None


class BankerAssetRequestBody(BaseModel):
    """Banker requests shares from admin"""
    asset_ticker: str
    quantity: int
    reason: Optional[str] = None

    @field_validator('quantity')
    @classmethod
    def quantity_positive(cls, v):
        if v <= 0:
            raise ValueError('Quantity must be positive')
        return v

    @field_validator('asset_ticker')
    @classmethod
    def ticker_valid(cls, v):
        if v.upper() not in VALID_TICKERS:
            raise ValueError(f'Invalid ticker: {v}')
        return v.upper()


class BankerShortRequestBody(BaseModel):
    """Banker files short sell request on behalf of a team"""
    team_id: int
    asset_ticker: str
    quantity: int

    @field_validator('quantity')
    @classmethod
    def quantity_positive(cls, v):
        if v <= 0:
            raise ValueError('Quantity must be positive')
        return v

    @field_validator('asset_ticker')
    @classmethod
    def ticker_valid(cls, v):
        if v.upper() not in VALID_TICKERS:
            raise ValueError(f'Invalid ticker: {v}')
        return v.upper()


class BankerBailoutRequestBody(BaseModel):
    """Banker files bailout request for a team"""
    team_id: int
    amount: float
    terms: Optional[str] = None
    interest_rate: float = 2.0
    unfreeze_team: bool = True

    @field_validator('amount')
    @classmethod
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError('Bailout amount must be positive')
        return v


class AdminBankerRequestAction(BaseModel):
    admin_note: Optional[str] = None


class ShortLimitsUpdate(BaseModel):
    short_limit_gold: Optional[int] = None
    short_limit_nvda: Optional[int] = None
    short_limit_brent: Optional[int] = None
    short_limit_reits: Optional[int] = None


@app.post("/banker/request/assets")
async def banker_request_assets(
    req: BankerAssetRequestBody,
    user: User = Depends(get_current_banker),
    session: Session = Depends(get_session)
):
    """Banker raises a request to admin for shares"""
    asset = session.exec(select(Asset).where(Asset.ticker == req.asset_ticker)).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Check for duplicate pending request
    existing = session.exec(
        select(BankerRequest).where(
            BankerRequest.banker_id == user.id,
            BankerRequest.request_type == BankerRequestType.ASSET_REQUEST,
            BankerRequest.asset_ticker == req.asset_ticker,
            BankerRequest.status == BankerRequestStatus.PENDING
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"You already have a pending request for {req.asset_ticker}")

    request_obj = BankerRequest(
        banker_id=user.id,
        request_type=BankerRequestType.ASSET_REQUEST,
        asset_ticker=req.asset_ticker,
        quantity=req.quantity,
        request_reason=req.reason
    )
    session.add(request_obj)

    act_logger = ActivityLogger(session)
    act_logger.log_action(user_id=user.id, action_type="BANKER_REQUEST_ASSETS", action_details={
        "asset_ticker": req.asset_ticker,
        "quantity": req.quantity,
        "reason": req.reason or "",
        "action": f"Banker requested {req.quantity} {req.asset_ticker} shares from admin"
    })

    session.commit()

    await ws_manager.broadcast("market_update", {
        "action": "banker_request_created",
        "banker": user.username,
        "type": "asset_request"
    })

    return {
        "message": f"Request submitted: {req.quantity} {req.asset_ticker}. Awaiting admin approval.",
        "request_id": request_obj.id
    }


@app.get("/banker/dashboard")
def get_banker_dashboard(
    user: User = Depends(get_current_banker),
    session: Session = Depends(get_session)
):
    """Full banker dashboard overview"""
    holdings = session.exec(select(Holding).where(Holding.user_id == user.id)).all()
    assets_map = {a.id: a for a in session.exec(select(Asset)).all()}

    holdings_data = []
    total_portfolio_value = 0.0
    for h in holdings:
        asset = assets_map.get(h.asset_id)
        if not asset:
            continue
        mv = h.quantity * asset.current_price
        total_portfolio_value += mv

        total_lent = 0

        holdings_data.append({
            "ticker": asset.ticker,
            "name": asset.name,
            "total_quantity": h.quantity,
            "lent_out": total_lent,
            "available": h.quantity - total_lent,
            "current_price": round(asset.current_price, 2),
            "market_value": round(mv, 2)
        })

    active_shorts = []
    total_fees_earned = 0.0

    bailouts = session.exec(
        select(BailoutRecord).where(BailoutRecord.banker_id == user.id)
        .order_by(BailoutRecord.id.desc())
    ).all()

    # Pending requests count
    pending_requests = session.exec(
        select(BankerRequest).where(
            BankerRequest.banker_id == user.id,
            BankerRequest.status == BankerRequestStatus.PENDING
        )
    ).all()

    return {
        "username": user.username,
        "cash": round(user.cash, 2),
        "portfolio_value": round(total_portfolio_value, 2),
        "total_capital": round(user.cash + total_portfolio_value, 2),
        "holdings": holdings_data,
        "active_shorts_lent": len(active_shorts),
        "total_fees_earned": round(total_fees_earned, 2),
        "total_bailouts": len(bailouts),
        "total_bailout_amount": round(sum(b.amount for b in bailouts), 2),
        "pending_requests": len(pending_requests)
    }


@app.get("/banker/teams")
def get_banker_team_list(
    user: User = Depends(get_current_banker),
    session: Session = Depends(get_session)
):
    """List all teams with financial summary for banker monitoring"""
    teams = session.exec(select(User).where(User.role == Role.TEAM)).all()
    assets_map = {a.id: a for a in session.exec(select(Asset)).all()}

    result = []
    for team in teams:
        holdings = session.exec(select(Holding).where(Holding.user_id == team.id)).all()
        portfolio_value = sum(
            h.quantity * assets_map[h.asset_id].current_price
            for h in holdings if h.asset_id in assets_map
        )

        active_shorts = []
        short_exposure = 0.0

        net_worth = team.cash + portfolio_value - team.debt
        result.append({
            "id": team.id,
            "username": team.username,
            "cash": round(team.cash, 2),
            "portfolio_value": round(portfolio_value, 2),
            "debt": round(team.debt, 2),
            "net_worth": round(net_worth, 2),
            "is_frozen": team.is_frozen,
            "active_shorts": len(active_shorts),
            "short_exposure": round(short_exposure, 2),
            "bankrupt": team.is_frozen and net_worth < 0
        })

    result.sort(key=lambda x: x["net_worth"], reverse=True)
    return result


@app.get("/banker/team/{team_id}/overview")
def get_banker_team_detail(
    team_id: int,
    user: User = Depends(get_current_banker),
    session: Session = Depends(get_session)
):
    """Get detailed financial overview of a specific team"""
    team = session.get(User, team_id)
    if not team or team.role != Role.TEAM:
        raise HTTPException(status_code=404, detail="Team not found")

    holdings = session.exec(select(Holding).where(Holding.user_id == team_id)).all()
    assets_map = {a.id: a for a in session.exec(select(Asset)).all()}
    holdings_data = []
    portfolio_value = 0.0
    for h in holdings:
        asset = assets_map.get(h.asset_id)
        if asset:
            mv = h.quantity * asset.current_price
            portfolio_value += mv
            holdings_data.append({
                "ticker": asset.ticker, "name": asset.name,
                "quantity": h.quantity, "avg_cost": round(h.avg_cost, 2),
                "current_price": round(asset.current_price, 2),
                "market_value": round(mv, 2),
                "unrealized_pnl": round((asset.current_price - h.avg_cost) * h.quantity, 2)
            })

    loans = session.exec(
        select(TeamLoan).where(
            ((TeamLoan.borrower_id == team_id) | (TeamLoan.lender_id == team_id)),
            TeamLoan.status == "active"
        )
    ).all()
    loans_data = []
    for loan in loans:
        lender = session.get(User, loan.lender_id)
        borrower = session.get(User, loan.borrower_id)
        loans_data.append({
            "id": loan.id,
            "role": "borrower" if loan.borrower_id == team_id else "lender",
            "counterparty": lender.username if loan.borrower_id == team_id else borrower.username,
            "principal": loan.principal, "remaining_balance": loan.remaining_balance,
            "interest_rate": loan.interest_rate, "missed_quarters": loan.missed_quarters,
        })

    shorts_data = []

    activity = session.exec(
        select(ActivityLog).where(ActivityLog.user_id == team_id)
        .order_by(ActivityLog.timestamp.desc()).limit(20)
    ).all()

    return {
        "username": team.username, "cash": round(team.cash, 2),
        "debt": round(team.debt, 2), "is_frozen": team.is_frozen,
        "net_worth": round(team.cash + portfolio_value - team.debt, 2),
        "portfolio_value": round(portfolio_value, 2),
        "holdings": holdings_data, "loans": loans_data,
        "short_positions": shorts_data,
        "recent_activity": [
            {"action_type": a.action_type, "action_details": a.action_details, "timestamp": a.timestamp}
            for a in activity
        ]
    }


@app.get("/banker/transactions")
def get_banker_transactions(
    user: User = Depends(get_current_banker),
    session: Session = Depends(get_session)
):
    """Get all activity logs for the banker"""
    logs = session.exec(
        select(ActivityLog).where(ActivityLog.user_id == user.id)
        .order_by(ActivityLog.timestamp.desc()).limit(100)
    ).all()
    return [
        {"id": log.id, "action_type": log.action_type, "action_details": log.action_details, "timestamp": log.timestamp}
        for log in logs
    ]




@app.get("/banker/bailout-history")
def get_bailout_history(
    user: User = Depends(get_current_banker),
    session: Session = Depends(get_session)
):
    """Get bailout history for this banker"""
    bailouts = session.exec(
        select(BailoutRecord).where(BailoutRecord.banker_id == user.id)
        .order_by(BailoutRecord.id.desc())
    ).all()
    result = []
    for b in bailouts:
        team = session.get(User, b.team_id)
        result.append({
            "id": b.id, "team": team.username if team else "Unknown",
            "amount": round(b.amount, 2), "terms": b.terms,
            "bailout_type": b.bailout_type, "interest_rate": b.interest_rate,
            "loan_id": b.loan_id, "unfreeze_team": b.unfreeze_team,
            "created_at": b.created_at
        })
    return result


# --- ADMIN BANKER MANAGEMENT ---

@app.post("/admin/bankers/create")
async def create_banker_account(
    req: BankerCreateRequest,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Create a new banker account (admin only)"""
    validate_password_strength(req.password)
    if len(req.username) < 2 or len(req.username) > 30:
        raise HTTPException(status_code=400, detail="Username must be 2-30 characters")
    if session.exec(select(User).where(User.username == req.username)).first():
        raise HTTPException(status_code=400, detail="Username already exists")

    banker = User(
        username=req.username,
        hashed_password=get_password_hash(req.password),
        role=Role.BANKER,
        cash=req.initial_capital
    )
    session.add(banker)

    act_logger = ActivityLogger(session)
    act_logger.log_action(user_id=user.id, action_type="ADMIN_CREATE_BANKER", action_details={
        "banker_username": req.username, "initial_capital": req.initial_capital,
        "action": f"Admin created banker account '{req.username}' with ${req.initial_capital:,.2f}"
    })

    session.commit()

    await ws_manager.broadcast("market_update", {"action": "banker_created", "banker": req.username})
    return {
        "message": f"Banker account '{req.username}' created with ${req.initial_capital:,.2f} capital",
        "banker_id": banker.id
    }


@app.get("/admin/bankers")
def get_all_bankers(
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """List all banker accounts with positions"""
    bankers = session.exec(select(User).where(User.role == Role.BANKER)).all()
    assets_map = {a.id: a for a in session.exec(select(Asset)).all()}

    result = []
    for banker in bankers:
        holdings = session.exec(select(Holding).where(Holding.user_id == banker.id)).all()
        portfolio_value = sum(
            h.quantity * assets_map[h.asset_id].current_price
            for h in holdings if h.asset_id in assets_map
        )
        active_shorts = session.exec(
            select().where(User.id == banker.id.status == "active")
        ).all()
        all_shorts = session.exec(select().where(User.id == banker.id)).all()
        total_fees = sum(s.total_fees_paid for s in all_shorts)

        holdings_summary = []
        for h in holdings:
            asset = assets_map.get(h.asset_id)
            if asset:
                lent = sum(s.quantity for s in active_shorts if s.asset_id == h.asset_id)
                holdings_summary.append({
                    "ticker": asset.ticker, "total": h.quantity,
                    "lent_out": lent, "available": h.quantity - lent
                })

        # Pending requests for this banker
        pending = len(session.exec(
            select(BankerRequest).where(
                BankerRequest.banker_id == banker.id,
                BankerRequest.status == BankerRequestStatus.PENDING
            )
        ).all())

        result.append({
            "id": banker.id, "username": banker.username,
            "cash": round(banker.cash, 2),
            "portfolio_value": round(portfolio_value, 2),
            "total_capital": round(banker.cash + portfolio_value, 2),
            "active_shorts_lent": len(active_shorts),
            "total_fees_earned": round(total_fees, 2),
            "holdings": holdings_summary,
            "pending_requests": pending,
            "last_login": banker.last_login
        })

    return result


@app.post("/admin/bankers/{banker_id}/add-capital")
async def add_banker_capital(
    banker_id: int,
    req: BankerCapitalRequest,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Inject additional capital to a banker account"""
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    banker = session.get(User, banker_id)
    if not banker or banker.role != Role.BANKER:
        raise HTTPException(status_code=404, detail="Banker not found")

    banker.cash += req.amount
    session.add(banker)

    act_logger = ActivityLogger(session)
    act_logger.log_action(user_id=user.id, action_type="ADMIN_BANKER_CAPITAL", action_details={
        "banker": banker.username, "amount": req.amount,
        "reason": req.reason or "", "new_balance": banker.cash,
        "action": f"Admin injected ${req.amount:,.2f} capital to banker {banker.username}"
    })

    session.commit()

    await ws_manager.broadcast("market_update", {"action": "banker_capital_added", "banker": banker.username})
    return {
        "message": f"Added ${req.amount:,.2f} to banker {banker.username}",
        "new_balance": round(banker.cash, 2)
    }


# --- ADMIN: BANKER REQUESTS ---

@app.get("/admin/banker-requests")
def get_all_banker_requests(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Get all banker requests for admin review"""
    requests = session.exec(
        select(BankerRequest).order_by(BankerRequest.created_at.desc())
    ).all()
    result = []
    for req in requests:
        banker = session.get(User, req.banker_id)
        team = session.get(User, req.bailout_team_id) if req.bailout_team_id else None
        result.append({
            **req.model_dump(),
            "banker_username": banker.username if banker else "Unknown",
            "team_username": team.username if team else None,
        })
    return result


class BankerRequestActionBody(BaseModel):
    admin_note: Optional[str] = None


@app.post("/admin/banker-requests/{req_id}/approve")
async def approve_banker_request(
    req_id: int,
    body: BankerRequestActionBody,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Approve a banker asset or bailout request"""
    req = session.get(BankerRequest, req_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != BankerRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request already resolved")

    banker = session.get(User, req.banker_id)
    if not banker:
        raise HTTPException(status_code=404, detail="Banker not found")

    if req.request_type == BankerRequestType.ASSET_REQUEST:
        # Grant assets to banker — look up asset by ticker
        asset = session.exec(select(Asset).where(Asset.ticker == req.asset_ticker)).first()
        if not asset:
            raise HTTPException(status_code=404, detail=f"Asset {req.asset_ticker} not found")
        holding = session.exec(
            select(Holding).where(Holding.user_id == banker.id, Holding.asset_id == asset.id)
        ).first()
        if holding:
            holding.quantity += req.quantity
            session.add(holding)
        else:
            session.add(Holding(user_id=banker.id, asset_id=asset.id, quantity=req.quantity, avg_cost=0))

    elif req.request_type == BankerRequestType.BAILOUT:
        # Execute the bailout: create a loan from banker to team
        team = session.get(User, req.bailout_team_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        if banker.cash < req.bailout_amount:
            raise HTTPException(status_code=400, detail="Banker has insufficient funds")
        banker.cash -= req.bailout_amount
        team.cash += req.bailout_amount
        if req.unfreeze_team:
            team.is_frozen = False
        loan = TeamLoan(
            lender_id=banker.id,
            borrower_id=team.id,
            principal=req.bailout_amount,
            remaining_balance=req.bailout_amount,
            interest_rate=req.bailout_interest_rate,
            status="active"
        )
        session.add(loan)
        session.add(team)
        session.add(banker)

    req.status = BankerRequestStatus.APPROVED
    req.admin_note = body.admin_note
    req.resolved_at = datetime.now(timezone.utc)
    req.resolved_by = user.username
    session.add(req)
    session.commit()
    await ws_manager.broadcast("market_update", {"action": "banker_request_resolved", "req_id": req_id, "status": "approved"})
    return {"message": "Request approved"}


@app.post("/admin/banker-requests/{req_id}/reject")
async def reject_banker_request(
    req_id: int,
    body: BankerRequestActionBody,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Reject a banker request"""
    req = session.get(BankerRequest, req_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != BankerRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request already resolved")
    req.status = BankerRequestStatus.REJECTED
    req.admin_note = body.admin_note
    req.resolved_at = datetime.now(timezone.utc)
    req.resolved_by = user.username
    session.add(req)
    session.commit()
    await ws_manager.broadcast("market_update", {"action": "banker_request_resolved", "req_id": req_id, "status": "rejected"})
    return {"message": "Request rejected"}


# ============ NEW FEATURE ENDPOINTS ============

# --- ADMIN: GAME STATE SNAPSHOT (backup / restore) ---

@app.get("/admin/game/snapshot")
def game_snapshot(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Export the complete live game state as a downloadable JSON snapshot.
    Download this before any risky operation or deployment — use /admin/game/restore to replay it."""
    from datetime import timezone as _tz
    import json as _json

    def _rows(model):
        rows = session.exec(select(model)).all()
        out = []
        for r in rows:
            try:
                d = r.model_dump()
            except Exception:
                d = {c: getattr(r, c, None) for c in r.__table__.columns.keys()}
            # datetime → ISO string for JSON
            for k, v in d.items():
                if hasattr(v, 'isoformat'):
                    d[k] = v.isoformat()
            out.append(d)
        return out

    snapshot = {
        "version": 2,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "market_state": _rows(MarketState),
        "assets": _rows(Asset),
        "price_history": _rows(PriceHistory),
        "users": _rows(User),
        "holdings": _rows(Holding),
        "team_loans": _rows(TeamLoan),
        "loan_approvals": _rows(LoanApproval),
        "mortgage_loans": _rows(MortgageLoan),
        "auction_lots": _rows(AuctionLot),
        "auction_bids": _rows(AuctionBid),
        "private_offers": _rows(PrivateOffer),
        "trade_approvals": _rows(TradeApproval),
        "transactions": _rows(Transaction),
        "news_items": _rows(NewsItem),
        "active_events": _rows(ActiveEvent),
    }

    content = _json.dumps(snapshot, indent=2, default=str)
    from fastapi.responses import Response as _Resp
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M")
    return _Resp(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="econova_snapshot_{ts}.json"'},
    )


class SnapshotRestoreBody(BaseModel):
    snapshot: dict
    restore_teams: bool = True          # restore team cash/debt/holdings
    restore_market_state: bool = True   # restore year/quarter/phase/prices
    restore_loans: bool = True
    restore_news: bool = False          # usually not needed

@app.post("/admin/game/restore")
def game_restore(
    body: SnapshotRestoreBody,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Restore a previously taken snapshot. Selective: choose which parts to replay.
    WARNING — replaces live data for the selected sections."""
    snap = body.snapshot
    restored = []

    def _parse_dt(v):
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v)
            except Exception:
                return None
        return v

    # 1. Market state (year, quarter, phase, shock, prices via asset records)
    if body.restore_market_state and snap.get("market_state"):
        ms_data = snap["market_state"][0] if snap["market_state"] else None
        if ms_data:
            ms = session.exec(select(MarketState)).first()
            if ms:
                skip = {"id"}
                for k, v in ms_data.items():
                    if k in skip:
                        continue
                    try:
                        setattr(ms, k, v)
                    except Exception:
                        pass
                session.add(ms)
        restored.append("market_state")

    # 2. Asset prices (restore current_price only — don't touch base config)
    if body.restore_market_state and snap.get("assets"):
        for a_data in snap["assets"]:
            asset = session.exec(select(Asset).where(Asset.ticker == a_data.get("ticker"))).first()
            if asset and a_data.get("current_price") is not None:
                asset.current_price = float(a_data["current_price"])
                session.add(asset)
        restored.append("asset_prices")

    # 3. Teams — restore cash and debt only (never overwrite passwords/roles)
    if body.restore_teams and snap.get("users"):
        for u_data in snap["users"]:
            if u_data.get("role") not in ("team", "banker"):
                continue
            team = session.exec(select(User).where(User.username == u_data["username"])).first()
            if team:
                team.cash = float(u_data.get("cash", team.cash))
                team.debt = float(u_data.get("debt", team.debt))
                team.is_frozen = bool(u_data.get("is_frozen", team.is_frozen))
                session.add(team)
        restored.append("team_balances")

    # 4. Holdings — wipe and re-insert for affected teams
    if body.restore_teams and snap.get("holdings"):
        team_usernames = {u["username"] for u in snap.get("users", []) if u.get("role") == "team"}
        for h_data in snap["holdings"]:
            owner = session.get(User, h_data.get("user_id"))
            if not owner or owner.username not in team_usernames:
                continue
            asset = session.get(Asset, h_data.get("asset_id"))
            if not asset:
                continue
            existing = session.exec(
                select(Holding).where(Holding.user_id == owner.id, Holding.asset_id == asset.id)
            ).first()
            if existing:
                existing.quantity = h_data.get("quantity", existing.quantity)
                existing.avg_cost = h_data.get("avg_cost", existing.avg_cost)
                existing.realized_pnl = h_data.get("realized_pnl", existing.realized_pnl)
                session.add(existing)
            else:
                session.add(Holding(
                    user_id=owner.id, asset_id=asset.id,
                    quantity=h_data.get("quantity", 0),
                    avg_cost=h_data.get("avg_cost", 0.0),
                    realized_pnl=h_data.get("realized_pnl", 0.0),
                ))
        restored.append("holdings")

    # 5. Loans
    if body.restore_loans and snap.get("team_loans"):
        for l_data in snap["team_loans"]:
            loan = session.get(TeamLoan, l_data.get("id"))
            if loan:
                loan.remaining_balance = float(l_data.get("remaining_balance", loan.remaining_balance))
                loan.total_repaid = float(l_data.get("total_repaid", loan.total_repaid))
                loan.status = l_data.get("status", loan.status)
                session.add(loan)
        restored.append("loans")

    # 6. News items (optional)
    if body.restore_news and snap.get("news_items"):
        for n_data in snap["news_items"]:
            existing = session.get(NewsItem, n_data.get("id"))
            if not existing:
                session.add(NewsItem(
                    title=n_data.get("title", ""),
                    content=n_data.get("content", ""),
                    is_published=n_data.get("is_published", False),
                    source=n_data.get("source", "Snapshot"),
                    sim_year=n_data.get("sim_year"),
                    sim_quarter=n_data.get("sim_quarter"),
                    category=n_data.get("category", "market"),
                ))
        restored.append("news_items")

    session.commit()
    return {"message": f"Snapshot restored: {', '.join(restored)}", "sections": restored}


# --- ADMIN: RESET GAME ---

@app.post("/admin/reset-game")
async def reset_game(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Wipe all game data and reset to PRE_GAME. Keeps admin and banker accounts."""
    from sqlmodel import delete as sql_delete
    from .models import (Holding, TeamLoan, LoanApproval, AuctionLot, AuctionBid, PrivateOffer,
                         TradeApproval, Transaction, MortgageLoan, BailoutRecord, BankerRequest,
                         NewsItem, ActiveEvent, PriceHistory, ActivityLog, ConsentRecord,
                         TeamLeaderInfo, Order, SecondaryAuctionRequest)

    tables_to_clear = [
        Holding, TeamLoan, LoanApproval, AuctionLot, AuctionBid, PrivateOffer,
        TradeApproval, Transaction, MortgageLoan, BailoutRecord, BankerRequest,
        NewsItem, ActiveEvent, PriceHistory, ActivityLog, ConsentRecord,
        TeamLeaderInfo, Order, SecondaryAuctionRequest,
    ]

    for model in tables_to_clear:
        session.exec(sql_delete(model))

    # Delete team & AI agent users
    teams_and_ai = session.exec(select(User).where((User.role == Role.TEAM) | (User.role == Role.AI_AGENT))).all()
    for u in teams_and_ai:
        session.delete(u)

    # Reset banker balances (admin will recapitalise)
    bankers = session.exec(select(User).where(User.role == Role.BANKER)).all()
    for b in bankers:
        b.cash = 0.0
        b.debt = 0.0
        b.is_frozen = False
        session.add(b)

    # Reset admin balance — always restore to 1T so admin can distribute capital
    admins = session.exec(select(User).where(User.role == Role.ADMIN)).all()
    for a in admins:
        a.cash = 1_000_000_000_000
        a.debt = 0.0
        a.is_frozen = False
        session.add(a)

    # Reset asset prices to base
    assets = session.exec(select(Asset)).all()
    for asset in assets:
        asset.current_price = asset.base_price
        session.add(asset)

    # Reset market state
    state = session.exec(select(MarketState)).first()
    if state:
        state.current_year = 0
        state.current_quarter = 1
        state.phase = "PRE_GAME"
        state.shock_stage = "NORMAL"
        state.shock_type = "NONE"
        state.last_shock_year = None
        state.marketplace_open = False
        state.credit_facility_open = False
        state.trade_requires_approval = False
        state.active_auction_asset = None
        state.news_feed = "Welcome to Econova Enterprise."
        state.sentiment = "NEUTRAL"
        state.bots_enabled = False
        state.global_interest_rate = "NEUTRAL"
        session.add(state)

    session.commit()

    # Re-initialise bots (they were deleted with TEAM role)
    sim = MarketEngine(session)
    sim.initialize_bots()

    await ws_manager.broadcast("market_update", {"action": "game_reset"})
    return {"message": "Game reset complete. All teams cleared. Market returned to PRE_GAME."}


# --- ADMIN: SEED HISTORY ---

# (seed data lives in seeds/prices.json and seeds/news.json)
_SEEDS_DIR = os.path.join(os.path.dirname(__file__), '..', 'seeds')

@app.post("/admin/seed-history")
async def seed_history(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Pre-seed 2 years (8 quarters) of price history + curated news. Idempotent — errors if already seeded."""
    import json as _json
    existing_count = session.exec(select(func.count()).select_from(PriceHistory)).one()
    if existing_count > 8:
        raise HTTPException(status_code=400, detail="History already seeded. Reset game first.")

    with open(os.path.join(_SEEDS_DIR, 'prices.json')) as f:
        seed_prices = _json.load(f)
    with open(os.path.join(_SEEDS_DIR, 'news.json')) as f:
        seed_news = _json.load(f)

    assets = {a.ticker: a for a in session.exec(select(Asset)).all()}

    # Seed 8 quarters (2 years) of backdrop history as Year -2 and Year -1
    for ticker, prices in seed_prices.items():
        asset = assets.get(ticker)
        if not asset:
            continue
        for i, price in enumerate(prices):
            year = (i // 4) - 2   # quarters 0-3 → Y-2, quarters 4-7 → Y-1
            quarter = (i % 4) + 1
            session.add(PriceHistory(asset_id=asset.id, year=year, quarter=quarter, price=price))
        asset.current_price = prices[-1]
        session.add(asset)

    # After seeding, set state to Y-1 Q4 so the first "advance quarter" creates Y0 Q1 prices
    state = session.exec(select(MarketState)).first()
    if state:
        state.current_year = -1
        state.current_quarter = 4
        session.add(state)

    # Remap seed news sim_year from 1→-2, 2→-1 to match negative year backdrop
    year_remap = {1: -2, 2: -1}
    for n in seed_news:
        raw_year = n.get("sim_year")
        session.add(NewsItem(
            title=n["title"],
            content=n["content"],
            is_published=n["is_published"],
            image_url=n.get("image_url"),
            source=n.get("source"),
            category=n.get("category", "market"),
            sim_year=year_remap.get(raw_year, raw_year),
            sim_quarter=n.get("sim_quarter"),
            published_at=datetime.now(timezone.utc),
        ))

    session.commit()

    await ws_manager.broadcast("market_update", {"action": "history_seeded", "year": 0, "quarter": 1})
    await ws_manager.broadcast("news_update", {"action": "bulk_published"})
    return {"message": f"History seeded: 8 quarters (Y-2, Y-1) of backdrop prices + {len(seed_news)} news items. Simulation is now at Year 0 Q1 — ready to play."}


# --- ADMIN: MANUAL RECOVERY / SHOCK RESET ---

@app.post("/admin/trigger-recovery")
async def trigger_recovery_endpoint(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Manually transition market from CRASH to RECOVERY stage."""
    sim = MarketEngine(session)
    state = sim.get_state()
    if state.shock_stage != "CRASH":
        raise HTTPException(status_code=400, detail=f"Market is not in CRASH (currently: {state.shock_stage})")
    sim.trigger_recovery()
    await ws_manager.broadcast("shock_triggered", {"action": "recovery", "stage": "RECOVERY"})
    return {"message": "Recovery triggered. Market entering RECOVERY stage."}


@app.post("/admin/reset-shock")
async def reset_shock_endpoint(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Fully reset shock state to NORMAL."""
    sim = MarketEngine(session)
    sim.reset_shock()
    await ws_manager.broadcast("shock_triggered", {"action": "reset", "stage": "NORMAL"})
    return {"message": "Shock reset. Market returned to NORMAL."}


# --- ADMIN: INVESTOR SENTIMENT ---

class SentimentUpdate(BaseModel):
    sentiment: str  # BULLISH, NEUTRAL, BEARISH


@app.post("/admin/sentiment")
async def set_sentiment_endpoint(
    body: SentimentUpdate,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Set investor sentiment dial (affects quarterly price growth)."""
    if body.sentiment not in ("BULLISH", "NEUTRAL", "BEARISH"):
        raise HTTPException(status_code=400, detail="sentiment must be BULLISH, NEUTRAL, or BEARISH")
    sim = MarketEngine(session)
    sim.set_sentiment(body.sentiment)
    await ws_manager.broadcast("market_update", {"action": "sentiment_changed", "sentiment": body.sentiment})
    return {"message": f"Investor sentiment set to {body.sentiment}", "sentiment": body.sentiment}


class InterestRateUpdate(BaseModel):
    level: str  # LOW, NEUTRAL, HIGH

@app.post("/admin/interest-rate")
async def set_interest_rate(
    body: InterestRateUpdate,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Set global interest rate environment (LOW / NEUTRAL / HIGH). Affects asset CAGRs and REIT dividends."""
    if body.level not in ("LOW", "NEUTRAL", "HIGH"):
        raise HTTPException(status_code=400, detail="level must be LOW, NEUTRAL, or HIGH")
    state = session.exec(select(MarketState)).first()
    if not state:
        raise HTTPException(status_code=404, detail="MarketState not found")
    state.global_interest_rate = body.level
    session.add(state)
    session.commit()
    await ws_manager.broadcast("market_update", {"action": "interest_rate_changed", "level": body.level})
    return {"message": f"Interest rate environment set to {body.level}", "level": body.level}


# --- ADMIN: MARKET MAKER BOTS ---

@app.post("/admin/bots/toggle")
async def toggle_bots_endpoint(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Toggle market maker bots on/off."""
    sim = MarketEngine(session)
    enabled = sim.toggle_bots()
    await ws_manager.broadcast("market_update", {"action": "bots_toggled", "bots_enabled": enabled})
    return {"message": f"Market maker bots {'ENABLED' if enabled else 'DISABLED'}", "bots_enabled": enabled}


# --- SECONDARY AUCTION HALL ---

class SecondaryAuctionRequestBody(BaseModel):
    asset_ticker: str
    quantity: int
    reserve_price: float

    @field_validator('quantity')
    @classmethod
    def qty_positive(cls, v):
        if v <= 0:
            raise ValueError('Quantity must be positive')
        return v

    @field_validator('reserve_price')
    @classmethod
    def price_positive(cls, v):
        if v <= 0:
            raise ValueError('Reserve price must be positive')
        return v


class SecondaryAuctionRejectBody(BaseModel):
    admin_note: Optional[str] = None


@app.post("/secondary-auction/request")
async def submit_secondary_auction_request(
    req: SecondaryAuctionRequestBody,
    user: User = Depends(get_active_user),
    session: Session = Depends(get_session)
):
    """Team submits a listing request to sell assets in the secondary auction hall."""
    asset = session.exec(select(Asset).where(Asset.ticker == req.asset_ticker.upper())).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    holding = session.exec(
        select(Holding).where(Holding.user_id == user.id, Holding.asset_id == asset.id)
    ).first()
    if not holding or holding.quantity < req.quantity:
        raise HTTPException(status_code=400, detail="Insufficient holdings to list that quantity")

    # Check for duplicate pending request
    existing = session.exec(
        select(SecondaryAuctionRequest).where(
            SecondaryAuctionRequest.seller_id == user.id,
            SecondaryAuctionRequest.asset_ticker == req.asset_ticker.upper(),
            SecondaryAuctionRequest.status == "pending"
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="You already have a pending request for this asset")

    listing = SecondaryAuctionRequest(
        seller_id=user.id,
        asset_ticker=req.asset_ticker.upper(),
        quantity=req.quantity,
        reserve_price=req.reserve_price,
    )
    session.add(listing)
    session.commit()
    session.refresh(listing)

    act_logger = ActivityLogger(session)
    act_logger.log_action(
        user_id=user.id,
        action_type="SECONDARY_LISTING",
        action_details={
            "asset": listing.asset_ticker,
            "quantity": listing.quantity,
            "reserve_price": listing.reserve_price,
        },
    )

    await ws_manager.broadcast("market_update", {"action": "secondary_auction_request", "asset": req.asset_ticker})
    return {"message": "Listing request submitted. Awaiting admin approval.", "request_id": listing.id}


@app.get("/secondary-auction/my-requests")
def get_my_secondary_requests(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Get the current user's secondary auction listing requests."""
    requests = session.exec(
        select(SecondaryAuctionRequest).where(SecondaryAuctionRequest.seller_id == user.id)
        .order_by(SecondaryAuctionRequest.id.desc())
    ).all()
    return requests


@app.get("/admin/secondary-auction/requests")
def get_admin_secondary_requests(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Get all secondary auction listing requests (admin view)."""
    requests = session.exec(
        select(SecondaryAuctionRequest).order_by(SecondaryAuctionRequest.id.desc())
    ).all()
    result = []
    for r in requests:
        seller = session.get(User, r.seller_id)
        result.append({
            **r.model_dump(),
            "seller_username": seller.username if seller else "Unknown",
        })
    return result


@app.post("/admin/secondary-auction/{req_id}/approve")
async def approve_secondary_auction_request(
    req_id: int,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Approve a secondary auction listing: escrow assets and create AuctionLot."""
    req = session.get(SecondaryAuctionRequest, req_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    asset = session.exec(select(Asset).where(Asset.ticker == req.asset_ticker)).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Escrow assets — deduct from seller's holding
    holding = session.exec(
        select(Holding).where(Holding.user_id == req.seller_id, Holding.asset_id == asset.id)
    ).first()
    if not holding or holding.quantity < req.quantity:
        req.status = "rejected"
        req.admin_note = "Seller no longer has sufficient holdings"
        session.add(req)
        session.commit()
        raise HTTPException(status_code=400, detail="Seller has insufficient holdings — request auto-rejected")

    cost_basis = holding.avg_cost

    holding.quantity -= req.quantity
    if holding.quantity == 0:
        session.delete(holding)
    else:
        session.add(holding)

    # Create AuctionLot with next lot number
    existing_lots = session.exec(select(AuctionLot).where(AuctionLot.asset_ticker == req.asset_ticker)).all()
    next_lot_num = max((l.lot_number for l in existing_lots), default=0) + 1

    lot = AuctionLot(
        asset_ticker=req.asset_ticker,
        lot_number=next_lot_num,
        quantity=req.quantity,
        base_price=req.reserve_price,
        status=LotStatus.ACTIVE,
        seller_id=req.seller_id,
        seller_cost_basis=cost_basis,
    )
    session.add(lot)

    req.status = "approved"
    session.add(req)
    session.commit()

    await ws_manager.broadcast("market_update", {"action": "secondary_auction_approved", "asset": req.asset_ticker})
    return {"message": f"Listing approved. Lot #{next_lot_num} created for {req.quantity}x {req.asset_ticker} @ reserve ${req.reserve_price:,.0f}"}


@app.post("/admin/secondary-auction/{req_id}/reject")
async def reject_secondary_auction_request(
    req_id: int,
    body: SecondaryAuctionRejectBody,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Reject a secondary auction listing request."""
    req = session.get(SecondaryAuctionRequest, req_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    req.status = "rejected"
    req.admin_note = body.admin_note
    session.add(req)
    session.commit()
    return {"message": "Listing request rejected."}


@app.post("/admin/secondary-lots/{lot_id}/resolve")
async def resolve_secondary_lot_endpoint(
    lot_id: int,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Admin resolves (hammers down) a specific user-listed secondary lot."""
    sim = MarketEngine(session)
    result = sim.resolve_secondary_lot(lot_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    await ws_manager.broadcast("market_update", {"action": "secondary_lot_resolved", "lot_id": lot_id})
    return result


# ── END-OF-GAME DEBT SETTLEMENT ────────────────────────────────────────────────

@app.post("/admin/settle-all-debts")
async def settle_all_debts(
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """
    End-of-game forced liquidation & proportional repayment.

    For every team with active (or defaulting) loans that cannot cover their debt:
    1. Sell enough of their holdings (lowest-value lots first) at current market price
       to raise the required cash.
    2. Distribute the raised cash to lenders in the ratio of their principal.
    3. Returns a settlement report.
    """
    report = []

    # Gather all active loans
    active_loans = session.exec(
        select(TeamLoan).where(TeamLoan.status.in_(["active", "defaulted"]))
    ).all()

    # Group by borrower
    from collections import defaultdict
    by_borrower: dict[int, list[TeamLoan]] = defaultdict(list)
    for loan in active_loans:
        by_borrower[loan.borrower_id].append(loan)

    assets_by_id = {a.id: a for a in session.exec(select(Asset)).all()}

    for borrower_id, loans in by_borrower.items():
        borrower = session.get(User, borrower_id)
        if not borrower:
            continue

        total_debt = sum(loan.remaining_balance for loan in loans)
        cash_needed = max(0.0, total_debt - borrower.cash)

        if cash_needed <= 0:
            # Borrower can fully repay from cash alone
            borrower.cash -= total_debt
            for loan in loans:
                lender = session.get(User, loan.lender_id)
                if lender:
                    lender.cash += loan.remaining_balance
                    session.add(lender)
                loan.status = LoanStatus.DEFAULTED
                loan.remaining_balance = 0.0
                session.add(loan)
            session.add(borrower)
            report.append({
                "team": borrower.username,
                "debt": round(total_debt, 2),
                "cash_used": round(total_debt, 2),
                "assets_sold": [],
                "recovered": round(total_debt, 2),
                "shortfall": 0.0,
            })
            continue

        # Need to liquidate assets
        holdings = session.exec(
            select(Holding).where(Holding.user_id == borrower_id)
        ).all()
        # Sort by unit value ascending (sell cheapest/most liquid first)
        holdings_sorted = sorted(
            holdings,
            key=lambda h: assets_by_id[h.asset_id].current_price * h.quantity
        )

        sold_items = []
        cash_raised = 0.0
        for holding in holdings_sorted:
            if cash_raised >= cash_needed:
                break
            asset = assets_by_id.get(holding.asset_id)
            if not asset:
                continue
            unit_price = asset.current_price
            remaining_needed = cash_needed - cash_raised
            units_to_sell = min(holding.quantity, int(remaining_needed / unit_price) + 1)
            units_to_sell = max(1, units_to_sell)
            units_to_sell = min(units_to_sell, holding.quantity)

            proceeds = units_to_sell * unit_price
            cash_raised += proceeds
            sold_items.append({
                "ticker": asset.ticker,
                "quantity": units_to_sell,
                "unit_price": round(unit_price, 2),
                "proceeds": round(proceeds, 2),
            })

            # Update or delete holding
            holding.quantity -= units_to_sell
            if holding.quantity <= 0:
                session.delete(holding)
            else:
                session.add(holding)

        # Total cash recovered = borrower's cash + liquidation proceeds
        total_recovered = borrower.cash + cash_raised
        shortfall = max(0.0, total_debt - total_recovered)

        # Distribute recovered cash to lenders proportionally by principal
        total_principal = sum(loan.principal for loan in loans)
        actually_distributed = 0.0

        for loan in loans:
            if total_principal > 0:
                share = loan.principal / total_principal
            else:
                share = 1.0 / len(loans)
            payout = min(loan.remaining_balance, total_recovered * share)
            payout = round(payout, 2)

            lender = session.get(User, loan.lender_id)
            if lender:
                lender.cash += payout
                session.add(lender)
            actually_distributed += payout
            loan.status = LoanStatus.DEFAULTED
            loan.remaining_balance = max(0.0, loan.remaining_balance - payout)
            session.add(loan)

        borrower.cash = max(0.0, total_recovered - actually_distributed)
        session.add(borrower)

        report.append({
            "team": borrower.username,
            "debt": round(total_debt, 2),
            "cash_used": round(min(borrower.cash + cash_raised, total_debt), 2),
            "assets_sold": sold_items,
            "recovered": round(actually_distributed, 2),
            "shortfall": round(shortfall, 2),
        })

    session.commit()

    await sse_manager.broadcast("market_update", {
        "action": "debts_settled",
        "teams_settled": len(report),
    })
    return {
        "message": f"End-of-game settlement complete. {len(report)} team(s) processed.",
        "report": report,
    }
