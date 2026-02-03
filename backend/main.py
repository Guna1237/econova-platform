from contextlib import asynccontextmanager
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware 
from sqlmodel import Session, select
from .database import create_db_and_tables, get_session, engine
from .engine import MarketEngine
from fastapi.security import OAuth2PasswordRequestForm
from .auth import create_access_token, get_current_admin, get_current_user, get_password_hash, verify_password, ACCESS_TOKEN_EXPIRE_MINUTES
from .models import Asset, MarketState, Order, User, Role, TeamLoan, AuctionBid, Holding, OrderType, PriceHistory
from pydantic import BaseModel

# --- Pydantic Schemas for Requests ---
class BidCreate(BaseModel):
    amount: float

class LoanOfferCreate(BaseModel):
    borrower_username: str
    principal: float
    interest_rate: float

class ShockTrigger(BaseModel):
    type: str # INFLATION, RECESSION, NONE
    action: str # HINT, CRASH

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    with Session(engine) as session:
        sim = MarketEngine(session)
        sim.initialize_assets()
        
        # Ensure Admin
        admin = session.exec(select(User).where(User.username == "admin")).first()
        if not admin:
            session.add(User(username="admin", hashed_password=get_password_hash("admin123"), role=Role.ADMIN))
        
        session.commit()
    yield

app = FastAPI(title="Econova API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- PUBLIC ENDPOINTS ---

@app.get("/health")
def health_check(): return {"status": "healthy"}

@app.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer", "role": user.role}



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
def get_state(session: Session = Depends(get_session)):
    sim = MarketEngine(session)
    return sim.get_state()

@app.get("/market/assets")
def get_assets(session: Session = Depends(get_session)):
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
def get_price_history(asset_id: int, session: Session = Depends(get_session)):
    return session.exec(select(PriceHistory).where(PriceHistory.asset_id == asset_id).order_by(PriceHistory.year)).all()

# --- ADMIN USER MANAGEMENT ---

@app.get("/admin/users")
def get_all_users(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    return session.exec(select(User).where(User.role == Role.TEAM)).all()

@app.post("/admin/users/create")
def create_team_user(username: str, password: str, user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    if session.exec(select(User).where(User.username == username)).first():
        raise HTTPException(status_code=400, detail="User exists")
    new_user = User(username=username, hashed_password=get_password_hash(password), role=Role.TEAM)
    session.add(new_user)
    session.commit()
    return {"message": f"Team {username} created"}

@app.post("/admin/users/{user_id}/freeze")
def toggle_user_freeze(user_id: int, user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    target_user = session.get(User, user_id)
    if not target_user: raise HTTPException(status_code=404, detail="User not found")
    
    target_user.is_frozen = not target_user.is_frozen
    status_msg = "frozen" if target_user.is_frozen else "active"
    session.add(target_user)
    session.commit()
    return {"message": f"User {target_user.username} is now {status_msg}"}

# --- ACTIONS ---

@app.post("/auction/bid")
def place_bid(bid: BidCreate, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    sim = MarketEngine(session)
    try:
        sim.place_bid(user, bid.amount)
        return {"message": "Bid placed successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/auction/bids")
def get_live_bids(session: Session = Depends(get_session)):
    sim = MarketEngine(session)
    state = sim.get_state()
    ticker = state.active_auction_asset
    if not ticker: return []
    bids = session.exec(select(AuctionBid).where(AuctionBid.asset_ticker == ticker)).all()
    # Mask usernames? Maybe allow full visibility for auction transparency
    # For now return full
    return sorted(bids, key=lambda x: x.amount, reverse=True)

@app.post("/loans/offer")
def offer_loan(offer: LoanOfferCreate, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
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
    return {"message": "Loan offer sent"}

@app.post("/loans/accept/{loan_id}")
def accept_loan(loan_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
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
    session.commit()
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
def repay_loan(req: RepaymentRequest, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
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
    session.commit()
    
    return {"message": message, "remaining_balance": loan.remaining_balance}

# --- TRADING ---

class OrderCreate(BaseModel):
    asset_id: int
    type: str # buy/sell
    quantity: int
    price: float

@app.post("/orders")
def place_order_endpoint(order: OrderCreate, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    sim = MarketEngine(session)
    # Map string to Enum
    otype = OrderType.BUY if order.type.lower() == "buy" else OrderType.SELL
    try:
        sim.place_order(user.id, order.asset_id, otype, order.quantity, order.price)
        return {"message": "Order placed"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- ADMIN ---

@app.post("/admin/next-turn")
def next_turn(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    sim = MarketEngine(session)
    sim.step_simulation()
    return {"message": "Advanced Year"}

@app.post("/admin/trigger-shock")
def trigger_shock(shock: ShockTrigger, user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    sim = MarketEngine(session)
    sim.trigger_shock(shock.type, shock.action)
    return {"message": f"Shock {shock.action} triggered for {shock.type}"}

@app.post("/admin/auction/open/{ticker}")
def open_auction(ticker: str, user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    sim = MarketEngine(session)
    sim.start_auction(ticker)
    return {"message": f"Auction opened for {ticker}"}

@app.post("/admin/auction/resolve")
def resolve_auction_endpoint(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    sim = MarketEngine(session)
    msg = sim.resolve_auction()
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


