from typing import Optional, List
from sqlmodel import Field, SQLModel, Relationship, Column, JSON
from enum import Enum
from datetime import datetime, timezone

class Role(str, Enum):
    ADMIN = "admin"
    SUB_ADMIN = "sub_admin"
    TEAM = "team"
    BANKER = "banker"
    AI_AGENT = "ai_agent"


class OrderType(str, Enum):
    BUY = "buy"
    SELL = "sell"

class OrderStatus(str, Enum):
    OPEN = "open"
    FILLED = "filled"
    CANCELLED = "cancelled"

class LoanStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    CLOSED = "closed"
    DEFAULTED = "defaulted"

class LotStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    SOLD = "sold"
    CANCELLED = "cancelled"

class OfferStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED = "expired"
    CANCELLED = "cancelled"

class Asset(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    ticker: str = Field(index=True, unique=True)
    description: Optional[str] = None
    
    # Economics
    base_price: float
    current_price: float = Field(default=0.0)
    volatility: float  # 0.0 to 1.0
    macro_sensitivity: float # Beta: -1.0 to 1.0 (Shock Beta)
    base_cagr: float = Field(default=0.05) # Expected growth
    
    total_supply: int = Field(default=1000)

class Holding(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    asset_id: int = Field(foreign_key="asset.id")
    quantity: int = Field(default=0)
    avg_cost: float = Field(default=0.0)
    realized_pnl: float = Field(default=0.0)

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    hashed_password: str = Field(exclude=True)
    role: Role = Role.TEAM
    
    cash: float = Field(default=1000000.0)
    debt: float = Field(default=0.0)
    is_frozen: bool = Field(default=False)
    
    # Research tracking
    has_consented: bool = Field(default=False)
    
    # Login tracking
    last_login: Optional[datetime] = Field(default=None)
    last_seen: Optional[datetime] = Field(default=None)
    session_id: Optional[str] = Field(default=None)

class TeamLoan(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lender_id: int = Field(foreign_key="user.id")
    borrower_id: int = Field(foreign_key="user.id")
    principal: float
    remaining_balance: float = Field(default=0.0)  # Tracks how much is left to repay
    total_repaid: float = Field(default=0.0)  # Tracks total amount repaid
    interest_rate: float # Percentage per year
    status: LoanStatus = LoanStatus.PENDING
    missed_quarters: int = Field(default=0)  # Grace period: default after 2 missed
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AuctionBid(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    asset_ticker: str 
    lot_id: Optional[int] = Field(default=None, foreign_key="auctionlot.id")
    amount: float # Per unit
    quantity: int
    status: str = "active"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Order(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    asset_id: int = Field(foreign_key="asset.id")
    type: OrderType
    price: float
    quantity: int
    status: OrderStatus = OrderStatus.OPEN
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MarketState(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    current_year: int = Field(default=0)
    current_quarter: int = Field(default=1)  # 1-4
    phase: str = Field(default="PRE_GAME") # PRE_GAME, AUCTION, TRADING, FINISHED
    
    # Marketplace Control
    marketplace_open: bool = Field(default=False)
    
    # Credit Facility Control
    credit_facility_open: bool = Field(default=False)
    
    # Trade Approval Gate
    trade_requires_approval: bool = Field(default=False)
    
    # Shock System
    shock_stage: str = Field(default="NORMAL") # NORMAL, WARNING, CRASH, RECOVERY
    shock_type: str = Field(default="NONE") # INFLATION, RECESSION
    last_shock_year: Optional[int] = None # Track when shock happened for recovery
    
    active_auction_asset: Optional[str] = None
    news_feed: str = Field(default="Welcome to Econova.")

    # Investor sentiment dial (admin-controlled)
    sentiment: str = Field(default="NEUTRAL")  # BULLISH, NEUTRAL, BEARISH

    # Market maker bots toggle
    bots_enabled: bool = Field(default=False)

    # Public leaderboard visibility toggle (admin-controlled)
    leaderboard_visible: bool = Field(default=False)

    # Per-asset auction lot configuration (JSON: {ticker: {num_lots, units_per_lot, last_lot_premium}})
    auction_config: Optional[dict] = Field(default=None, sa_column=Column(JSON))

    # Team starting capital (used when creating new team accounts)
    team_starting_capital: float = Field(default=1_000_000.0)



class PriceHistory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    asset_id: int = Field(foreign_key="asset.id")
    year: int
    quarter: int = Field(default=0)  # 0 = annual snapshot, 1-4 = quarterly
    price: float

# ============ NEW MODELS FOR RESEARCH TRACKING ============

class ConsentRecord(SQLModel, table=True):
    """Track user consent for research participation"""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", unique=True)
    consented_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ip_address: Optional[str] = None
    consent_text_version: str = Field(default="v1.0")

class TeamLeaderInfo(SQLModel, table=True):
    """Store team leader demographics for research"""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", unique=True)
    leader_name: str
    email: str
    age: int
    team_size: int = Field(default=1)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ActivityLog(SQLModel, table=True):
    """Comprehensive tracking of all user actions for behavioral research"""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    action_type: str = Field(index=True)  # BID, TRADE, LOAN_OFFER, VIEW_PORTFOLIO, etc.
    action_details: dict = Field(default={}, sa_column=Column(JSON))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
    duration_ms: Optional[int] = None  # Time spent on decision
    context_data: dict = Field(default={}, sa_column=Column(JSON))  # Market state, portfolio value, etc.
    session_id: Optional[str] = None

class AuctionLot(SQLModel, table=True):
    """Multiple lots per asset in auctions"""
    id: Optional[int] = Field(default=None, primary_key=True)
    asset_ticker: str = Field(index=True)
    lot_number: int
    quantity: int
    base_price: float
    status: LotStatus = Field(default=LotStatus.PENDING)
    winner_id: Optional[int] = Field(default=None, foreign_key="user.id")
    winning_bid: Optional[float] = None
    seller_id: Optional[int] = Field(default=None, foreign_key="user.id")  # None = system lot
    seller_cost_basis: Optional[float] = None  # To calculate capital gains
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AdminCredentials(SQLModel, table=True):
    """Secure admin credential management with audit trail"""
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True)
    hashed_password: str = Field(exclude=True)
    last_changed: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    changed_by: Optional[str] = None  # Username of who made the change

class PrivateOffer(SQLModel, table=True):
    """Private trading offers between teams"""
    id: Optional[int] = Field(default=None, primary_key=True)
    from_user_id: int = Field(foreign_key="user.id", index=True)
    to_user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)  # None = open offer
    asset_ticker: str = Field(index=True)
    offer_type: OrderType  # BUY or SELL
    quantity: int
    price_per_unit: float
    total_value: float
    status: OfferStatus = Field(default=OfferStatus.PENDING)
    message: Optional[str] = None  # Optional message from offerer
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
    expires_at: Optional[datetime] = None
    responded_at: Optional[datetime] = None

class Transaction(SQLModel, table=True):
    """Record of completed trades (public visibility)"""
    id: Optional[int] = Field(default=None, primary_key=True)
    buyer_id: int = Field(foreign_key="user.id", index=True)
    seller_id: int = Field(foreign_key="user.id", index=True)
    asset_ticker: str = Field(index=True)
    quantity: int
    price_per_unit: float
    total_value: float
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
    is_flagged: bool = Field(default=False)
    flag_reason: Optional[str] = None

class NewsItem(SQLModel, table=True):
    """News articles for the platform"""
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    content: str
    published_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_published: bool = Field(default=False)
    image_url: Optional[str] = None
    source: str = Field(default="Global News Network")
    sim_year: Optional[int] = None    # which sim year this news belongs to
    sim_quarter: Optional[int] = None # which sim quarter (1-4)
    category: str = Field(default="market")  # market, company, macro, decoy, fun, bait

class TradeApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class TradeApproval(SQLModel, table=True):
    """Holds pending private trade offers waiting for admin approval"""
    id: Optional[int] = Field(default=None, primary_key=True)
    offer_id: int = Field(foreign_key="privateoffer.id", unique=True)
    status: TradeApprovalStatus = Field(default=TradeApprovalStatus.PENDING)
    admin_note: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None  # admin username

class ActiveEvent(SQLModel, table=True):
    """Tracks ongoing micro-events affecting specific assets"""
    id: Optional[int] = Field(default=None, primary_key=True)
    asset_ticker: str
    event_type: str = "MICRO" # MICRO, SECTOR, etc.
    description: str
    annual_impact: float # e.g., 0.05 for +5% growth boost
    start_year: int
    duration: int
    remaining_years: int


class LoanApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class LoanApproval(SQLModel, table=True):
    """Admin approval queue for loan acceptances"""
    id: Optional[int] = Field(default=None, primary_key=True)
    loan_id: int = Field(foreign_key="teamloan.id", unique=True)
    status: LoanApprovalStatus = Field(default=LoanApprovalStatus.PENDING)
    admin_note: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None  # admin username


# ============ BANKING MODELS ============
class BailoutRecord(SQLModel, table=True):
    """Tracks banker bailouts of bankrupt teams — creates a loan"""
    id: Optional[int] = Field(default=None, primary_key=True)
    banker_id: int = Field(foreign_key="user.id", index=True)
    team_id: int = Field(foreign_key="user.id", index=True)
    amount: float
    terms: Optional[str] = None
    bailout_type: str = Field(default="loan")  # loan, debt_forgiveness
    interest_rate: float = Field(default=2.0)   # 2% quarterly
    loan_id: Optional[int] = None               # Links to TeamLoan created
    unfreeze_team: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BankerRequestType(str, Enum):
    ASSET_REQUEST = "asset_request"      # Banker wants shares from admin
    BAILOUT = "bailout"                  # Banker requests bailout for a team


class BankerRequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class BankerRequest(SQLModel, table=True):
    """Unified approval queue for all banker-initiated requests"""
    id: Optional[int] = Field(default=None, primary_key=True)
    banker_id: int = Field(foreign_key="user.id", index=True)
    request_type: BankerRequestType
    status: BankerRequestStatus = Field(default=BankerRequestStatus.PENDING)

    # For ASSET_REQUEST
    asset_ticker: Optional[str] = None
    quantity: Optional[int] = None
    request_reason: Optional[str] = None          # Why the banker needs these shares


    # For BAILOUT
    bailout_team_id: Optional[int] = None
    bailout_amount: Optional[float] = None
    bailout_terms: Optional[str] = None
    bailout_interest_rate: float = Field(default=2.0)  # 2% quarterly
    unfreeze_team: bool = Field(default=True)

    # Admin response
    admin_note: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None              # admin username
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ============ EMERGENCY LIQUIDATION / MORTGAGE ============

class MortgageStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    REPAID = "repaid"
    DEFAULTED = "defaulted"
    REJECTED = "rejected"


class MortgageLoan(SQLModel, table=True):
    """Emergency liquidation: team pledges assets as collateral for a bank loan.
    If not repaid by maturity, collateral is forfeited to the bank."""
    id: Optional[int] = Field(default=None, primary_key=True)
    borrower_id: int = Field(foreign_key="user.id", index=True)

    # Collateral details
    collateral_asset_id: int = Field(foreign_key="asset.id")
    collateral_quantity: int
    collateral_value_at_lock: float  # Market value snapshot at approval time

    # Loan details
    loan_amount: float               # Cash given to borrower (80% LTV of collateral)
    interest_rate: float             # % per quarter (minimum 5%)
    maturity_quarters: int           # Agreed maturity in quarters
    quarters_remaining: int          # Countdown — decremented each quarter

    # Repayment tracking
    total_due: float = Field(default=0.0)          # principal + accrued interest
    total_repaid: float = Field(default=0.0)
    remaining_balance: float = Field(default=0.0)  # total_due - total_repaid

    # Status
    status: MortgageStatus = Field(default=MortgageStatus.PENDING)

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    approved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None

    # Admin
    admin_note: Optional[str] = None


# ============ SECONDARY AUCTION ============

class SecondaryAuctionRequest(SQLModel, table=True):
    """Team requests to list their assets in the secondary auction hall."""
    id: Optional[int] = Field(default=None, primary_key=True)
    seller_id: int = Field(foreign_key="user.id", index=True)
    asset_ticker: str = Field(index=True)
    quantity: int
    reserve_price: float          # minimum acceptable bid per unit
    status: str = Field(default="pending")  # pending, approved, rejected
    admin_note: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


