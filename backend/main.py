from contextlib import asynccontextmanager
from typing import List, Optional, Literal
import asyncio
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from .database import create_db_and_tables, get_session, engine
from .engine import MarketEngine
from fastapi.security import OAuth2PasswordRequestForm
from .auth import create_access_token, get_current_admin, get_current_user, get_active_user, get_password_hash, verify_password, validate_password_strength, ACCESS_TOKEN_EXPIRE_MINUTES
from .models import Asset, MarketState, Order, User, Role, TeamLoan, AuctionBid, Holding, OrderType, PriceHistory, ConsentRecord, TeamLeaderInfo, ActivityLog, AuctionLot, PrivateOffer, Transaction, OfferStatus, NewsItem
from .activity_logger import ActivityLogger
from .admin_tools import AdminTools
from pydantic import BaseModel, EmailStr, field_validator
from fastapi.responses import Response, StreamingResponse
from datetime import datetime, timezone
import os
import json
import logging
import secrets

logger = logging.getLogger(__name__)

# Valid tickers for whitelisting
VALID_TICKERS = {'GOLD', 'TECH', 'OIL', 'REAL', 'TBILL'}

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
        return v

class PrivateOfferCreate(BaseModel):
    to_username: Optional[str] = None
    asset_ticker: str
    offer_type: str
    quantity: int
    price_per_unit: float
    message: Optional[str] = None

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
            session.add(User(username="admin", hashed_password=get_password_hash("admin123"), role=Role.ADMIN))
        
        session.commit()
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

# Restrict CORS in production
environment = os.getenv("ENVIRONMENT", "development")
# Allow all origins for now to fix WebSocket connectivity issues between Vercel and Render
allow_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- SSE Endpoint ---
@app.get("/events")
async def sse_events():
    """Server-Sent Events endpoint for real-time updates (WebSocket alternative)."""
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
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    # Update last login time and generate new session ID
    user.last_login = datetime.now(timezone.utc)
    user.session_id = secrets.token_hex(16)
    session.add(user)
    session.commit()
    
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
    sim = MarketEngine(session)
    return sim.get_state()

@app.get("/market/assets")
def get_assets(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return session.exec(select(Asset)).all()

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
    if not quarterly:
        query = query.where((PriceHistory.quarter == 0) | (PriceHistory.quarter == 4))
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

# --- MARKET DATA ---
# ...

# --- ADMIN USER MANAGEMENT ---

@app.get("/admin/users")
def get_all_users(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    return session.exec(select(User).where(User.role == Role.TEAM)).all()

@app.post("/admin/users/create")
def create_team_user(data: UserRegister, user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    validate_password_strength(data.password)
    if len(data.username) < 2 or len(data.username) > 30:
        raise HTTPException(status_code=400, detail="Username must be 2-30 characters")
    if session.exec(select(User).where(User.username == data.username)).first():
        raise HTTPException(status_code=400, detail="User exists")
    new_user = User(username=data.username, hashed_password=get_password_hash(data.password), role=Role.TEAM)
    session.add(new_user)
    session.commit()
    return {"message": f"Team {data.username} created"}



# --- ACTIONS ---

@app.post("/auction/bid")
async def place_bid(bid: BidLotCreate, user: User = Depends(get_active_user), session: Session = Depends(get_session)):
    """Place bid on a specific auction lot"""
    sim = MarketEngine(session)
    logger = ActivityLogger(session)
    
    try:
        sim.place_bid(user, bid.lot_id, bid.amount)
        # Get the lot to retrieve quantity for logging
        from .models import AuctionLot
        lot = session.get(AuctionLot, bid.lot_id)
        quantity = lot.quantity if lot else 0
        logger.log_bid(user.id, sim.get_state().active_auction_asset, bid.lot_id, bid.amount, quantity)
        await ws_manager.broadcast("bid_placed", {"lot_id": bid.lot_id, "amount": bid.amount, "user": user.username})
        return {"message": "Bid placed successfully"}
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
    borrower = session.exec(select(User).where(User.username == offer.borrower_username)).first()
    if not borrower: raise HTTPException(status_code=404, detail="User not found")
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
    await ws_manager.broadcast("market_update", {"action": "loan_offered", "from": user.username})
    return {"message": "Loan offer sent"}

@app.post("/loans/accept/{loan_id}")
async def accept_loan(loan_id: int, user: User = Depends(get_active_user), session: Session = Depends(get_session)):
    loan = session.get(TeamLoan, loan_id)
    if not loan or loan.borrower_id != user.id: raise HTTPException(status_code=404, detail="Loan not found")
    if loan.status != "pending": raise HTTPException(status_code=400, detail="Loan not pending")
    
    lender = session.get(User, loan.lender_id)
    if lender.cash < loan.principal: raise HTTPException(status_code=400, detail="Lender funds unavailable")
    
    lender.cash -= loan.principal
    user.cash += loan.principal
    user.debt += loan.principal
    loan.status = "active"
    if loan.remaining_balance == 0:  # Initialize if not set
        loan.remaining_balance = loan.principal
    
    session.add(lender)
    session.add(user)
    session.add(loan)
    session.add(loan)
    session.commit()
    await ws_manager.broadcast("market_update", {"action": "loan_accepted", "loan_id": loan.id})
    return {"message": "Loan accepted"}

@app.get("/loans/pending")
def get_pending_loans(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    loans = session.exec(select(TeamLoan).where(TeamLoan.borrower_id == user.id, TeamLoan.status == "pending")).all()
    # Enrich with lender username
    result = []
    for loan in loans:
        lender = session.get(User, loan.lender_id)
        result.append({
            **loan.dict(),
            "lender_username": lender.username if lender else "Unknown"
        })
    return result

@app.get("/loans/teams")
def get_all_teams(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Get all registered team users (excluding current user and admins)"""
    teams = session.exec(
        select(User).where(
            User.role == Role.TEAM,
            User.id != user.id
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
            **loan.dict(),
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
async def repay_loan(req: RepaymentRequest, user: User = Depends(get_active_user), session: Session = Depends(get_session)):
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
        loan.status = "closed"
        loan.remaining_balance = 0
        message = f"Loan fully repaid! Total: ${loan.total_repaid:,.2f}"
    else:
        message = f"Repaid ${req.amount:,.2f}. Remaining: ${loan.remaining_balance:,.2f}"
    
    session.add(user)
    session.add(lender)
    session.add(loan)
    session.add(loan)
    session.commit()
    
    await ws_manager.broadcast("market_update", {"action": "loan_repaid", "loan_id": loan.id})
    return {"message": message, "remaining_balance": loan.remaining_balance}

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
    # Check if marketplace is open
    state = session.exec(select(MarketState)).first()
    if not state or not state.marketplace_open:
        raise HTTPException(status_code=400, detail="Marketplace is currently closed")
        
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

    # If selling, check ownership
    if offer.offer_type.upper() == "SELL":
        holding = session.exec(select(Holding).where(Holding.user_id == user.id, Holding.asset_id == asset.id)).first()
        if not holding or holding.quantity < offer.quantity:
             raise HTTPException(status_code=400, detail="Insufficient assets to sell")
    
    # If buying, check cash (optional, but good practice)
    # total_cost = offer.quantity * offer.price_per_unit
    # if offer.offer_type.upper() == "BUY" and user.cash < total_cost:
    #    raise HTTPException(status_code=400, detail="Insufficient cash")

    # Create offer
    otype = OrderType.BUY if offer.offer_type.upper() == "BUY" else OrderType.SELL
    
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
        
        await ws_manager.broadcast("market_update", {"action": "offer_created", "from": user.username})
        return {"message": "Offer created successfully", "offer_id": new_offer.id}
    except Exception as e:
        logger.error(f"Error creating private offer: {e}")
        raise HTTPException(status_code=500, detail="Failed to create offer")

@app.get("/offers/my")
def get_my_offers(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Get all offers sent by or received by current user"""
    sent = session.exec(
        select(PrivateOffer).where(PrivateOffer.from_user_id == user.id).order_by(PrivateOffer.created_at.desc())
    ).all()
    
    received = session.exec(
        select(PrivateOffer).where(PrivateOffer.to_user_id == user.id).order_by(PrivateOffer.created_at.desc())
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
    """Accept a pending offer"""
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
        buyer_holding = Holding(user_id=buyer.id, asset_id=asset.id, quantity=0, average_cost=0)
        session.add(buyer_holding)
        
    # Update average cost
    current_val = buyer_holding.quantity * buyer_holding.average_cost
    new_val = current_val + total_cost
    buyer_holding.quantity += offer.quantity
    buyer_holding.average_cost = new_val / buyer_holding.quantity
    
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
        total_value=total_cost,
        offer_id=offer.id
    )
    
    session.add(buyer)
    session.add(seller)
    session.add(seller_holding)
    session.add(buyer_holding)
    session.add(offer)
    session.add(txn)
    
    session.commit()
    
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
            **txn.dict(),
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
    await ws_manager.broadcast("market_update", {"action": "quarter_advanced", "year": state.current_year, "quarter": state.current_quarter})
    return {"message": f"Advanced to Year {state.current_year} Q{state.current_quarter}"}

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
    sim.start_auction(ticker)
    logger.log_action(user_id=user.id, action_type="ADMIN_OPEN_AUCTION", action_details={"ticker": ticker})
    await ws_manager.broadcast("auction_update", {"action": "opened", "ticker": ticker})
    return {"message": f"Auction opened for {ticker}"}

@app.post("/admin/auction/resolve")
async def resolve_auction_endpoint(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    sim = MarketEngine(session)
    logger = ActivityLogger(session)
    msg = sim.resolve_auction()
    logger.log_action(user_id=user.id, action_type="ADMIN_RESOLVE_AUCTION", action_details={"result": msg})
    await ws_manager.broadcast("auction_update", {"action": "resolved", "result": msg})
    return {"message": msg}

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
            **lot.dict(),
            "highest_bid": highest_bid.amount if highest_bid else None,
            "highest_bidder_id": highest_bid.user_id if highest_bid else None,
            "highest_bidder_username": highest_bidder_username
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
            **bid.dict(),
            "username": user.username if user else "Unknown"
        })
    
    return result


# --- ADMIN PRICE NUDGE ---

@app.post("/admin/price/nudge")
def nudge_asset_price(
    nudge: PriceNudge,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    """Adjust asset price by percentage or absolute amount"""
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
        
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


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
        (TeamLoan.lender_id == team_id) | (TeamLoan.borrower_id == team_id)
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
