from typing import Optional, List
from sqlmodel import Field, SQLModel, Relationship
from enum import Enum
from datetime import datetime

class Role(str, Enum):
    ADMIN = "admin"
    TEAM = "team"
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
    hashed_password: str
    role: Role = Role.TEAM
    
    cash: float = Field(default=1000000.0)
    debt: float = Field(default=0.0)
    is_frozen: bool = Field(default=False)

class TeamLoan(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lender_id: int = Field(foreign_key="user.id")
    borrower_id: int = Field(foreign_key="user.id")
    principal: float
    remaining_balance: float = Field(default=0.0)  # Tracks how much is left to repay
    total_repaid: float = Field(default=0.0)  # Tracks total amount repaid
    interest_rate: float # Percentage per year
    status: LoanStatus = LoanStatus.PENDING
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AuctionBid(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    asset_ticker: str 
    amount: float # Per unit
    quantity: int
    status: str = "active"
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class Order(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    asset_id: int = Field(foreign_key="asset.id")
    type: OrderType
    price: float
    quantity: int
    status: OrderStatus = OrderStatus.OPEN
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MarketState(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    current_year: int = Field(default=2024)
    phase: str = Field(default="PRE_GAME") # PRE_GAME, AUCTION, TRADING, FINISHED
    
    # Shock System
    shock_stage: str = Field(default="NORMAL") # NORMAL, WARNING, CRASH, RECOVERY
    shock_type: str = Field(default="NONE") # INFLATION, RECESSION
    
    active_auction_asset: Optional[str] = None
    news_feed: str = Field(default="Welcome to Econova.")

class PriceHistory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    asset_id: int = Field(foreign_key="asset.id")
    year: int
    price: float
