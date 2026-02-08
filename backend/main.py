from contextlib import asynccontextmanager
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware 
from sqlmodel import Session, select
from .database import create_db_and_tables, get_session, engine
from .engine import MarketEngine
from fastapi.security import OAuth2PasswordRequestForm
from .auth import create_access_token, get_current_admin, get_current_user, get_password_hash, verify_password, ACCESS_TOKEN_EXPIRE_MINUTES
from .models import Asset, MarketState, Order, User, Role, TeamLoan, AuctionBid, Holding, OrderType, PriceHistory, ConsentRecord, TeamLeaderInfo, ActivityLog, AuctionLot, PrivateOffer, Transaction, OfferStatus, NewsItem
from .activity_logger import ActivityLogger
from .admin_tools import AdminTools
from pydantic import BaseModel, EmailStr
from fastapi.responses import Response

# --- Pydantic Schemas for Requests ---
class BidCreate(BaseModel):
    amount: float

class LoanOfferCreate(BaseModel):
    borrower_username: str
    principal: float
    interest_rate: float

class PrivateOfferCreate(BaseModel):
    to_username: Optional[str] = None # None means open offer to anyone
    asset_ticker: str
    offer_type: str # BUY or SELL
    quantity: int
    price_per_unit: float
    message: Optional[str] = None

class ShockTrigger(BaseModel):
    type: str # INFLATION, RECESSION, NONE
    action: str # HINT, CRASH

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

class PriceNudge(BaseModel):
    ticker: str
    adjustment_pct: Optional[float] = None
    adjustment_abs: Optional[float] = None

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
    
    # Update last login time
    from datetime import datetime
    user.last_login = datetime.utcnow()
    session.add(user)
    session.commit()
    
    access_token = create_access_token(data={"sub": user.username})
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
def place_bid(bid: BidLotCreate, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
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



# --- PRIVATE TRADING ---

@app.post("/offers/create")
def create_private_offer(
    offer: PrivateOfferCreate, 
    user: User = Depends(get_current_user), 
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
    
    return {"message": "Offer created successfully", "offer_id": new_offer.id}

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
def accept_offer(offer_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
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
    offer.responded_at = datetime.utcnow()
    
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
    
    return {"message": "Offer accepted and trade executed", "transaction_id": txn.id}

@app.post("/offers/{offer_id}/reject")
def reject_offer(offer_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Reject an offer sent to you"""
    offer = session.get(PrivateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
        
    if offer.to_user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to reject this offer")
        
    if offer.status != OfferStatus.PENDING:
        raise HTTPException(status_code=400, detail="Offer not pending")
        
    offer.status = OfferStatus.REJECTED
    offer.responded_at = datetime.utcnow()
    session.add(offer)
    session.commit()
    
    return {"message": "Offer rejected"}

@app.get("/transactions")
def get_transactions(session: Session = Depends(get_session)):
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


# ============ NEW ENDPOINTS FOR RESEARCH TRACKING ============

# --- CONSENT & ONBOARDING ---

@app.get("/consent/status")
def check_consent_status(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Check if user has consented to research participation"""
    consent = session.exec(select(ConsentRecord).where(ConsentRecord.user_id == user.id)).first()
    team_info = session.exec(select(TeamLeaderInfo).where(TeamLeaderInfo.user_id == user.id)).first()
    
    return {
        "has_consented": user.has_consented,
        "consent_record": consent,
        "team_info": team_info
    }

@app.post("/consent/accept")
def accept_consent(
    consent_data: ConsentAccept,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Accept research consent and provide team leader information"""
    # Check if already consented
    existing = session.exec(select(ConsentRecord).where(ConsentRecord.user_id == user.id)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already consented")
    
    # Create consent record
    consent = ConsentRecord(
        user_id=user.id,
        consent_text_version="v1.0"
    )
    session.add(consent)
    
    # Create team leader info
    team_info = TeamLeaderInfo(
        user_id=user.id,
        leader_name=consent_data.leader_name,
        email=consent_data.email,
        age=consent_data.age,
        team_size=consent_data.team_size
    )
    session.add(team_info)
    
    # Update user
    user.has_consented = True
    session.add(user)
    
    session.commit()
    
    # Log the consent
    logger = ActivityLogger(session)
    logger.log_action(
        user_id=user.id,
        action_type="CONSENT_ACCEPTED",
        action_details={
            "leader_name": consent_data.leader_name,
            "team_size": consent_data.team_size
        }
    )
    
    return {"message": "Consent recorded successfully"}


# --- MULTI-LOT AUCTION ENDPOINTS ---

@app.get("/auction/lots")
def get_auction_lots(session: Session = Depends(get_session)):
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
def get_lot_bids(lot_id: int, session: Session = Depends(get_session)):
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
def get_news(session: Session = Depends(get_session)):
    """Get all published news"""
    news = session.exec(select(NewsItem).where(NewsItem.is_published == True).order_by(NewsItem.published_at.desc())).all()
    return news

@app.get("/admin/news/all")
def get_all_news_admin(user: User = Depends(get_current_admin), session: Session = Depends(get_session)):
    """Get ALL news (including drafts) for admin"""
    news = session.exec(select(NewsItem).order_by(NewsItem.published_at.desc())).all()
    return news

@app.post("/admin/news/create")
def create_news(
    news: NewsCreate,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    item = NewsItem(
        title=news.title,
        content=news.content,
        is_published=news.is_published,
        image_url=news.image_url,
        source=news.source,
        published_at=datetime.utcnow()
    )
    session.add(item)
    session.commit()
    return {"message": "News item created", "id": item.id}

@app.put("/admin/news/{news_id}")
def update_news(
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
    return {"message": "News item updated"}

@app.delete("/admin/news/{news_id}")
def delete_news(
    news_id: int,
    user: User = Depends(get_current_admin),
    session: Session = Depends(get_session)
):
    item = session.get(NewsItem, news_id)
    if item:
        session.delete(item)
        session.commit()
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
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    
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
    from datetime import datetime, timedelta
    
    teams = session.exec(select(User).where(User.role == Role.TEAM)).all()
    
    result = []
    for team in teams:
        # Consider online if logged in within last 5 minutes
        is_online = False
        if team.last_login:
            time_since_login = datetime.utcnow() - team.last_login
            is_online = time_since_login < timedelta(minutes=5)
        
        result.append({
            "id": team.id,
            "username": team.username,
            "is_online": is_online,
            "last_login": team.last_login.isoformat() if team.last_login else None,
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

