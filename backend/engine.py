import math
import random
from datetime import datetime
from sqlmodel import Session, select, func
from .models import Asset, MarketState, Order, OrderStatus, OrderType, User, Holding, TeamLoan, LoanStatus, AuctionBid, PriceHistory, Role, AuctionLot, LotStatus

class NewsCaster:
    TEMPLATES = {
        "NORMAL": [
            "Markets remain steady as annual reports show consistent growth.",
            "Analysts project moderate returns across major sectors.",
            "Trading volume stable; investors maintain diversified positions."
        ],
        "INFLATION_HINT": [
            "Bond yields tick upward as central banks discuss policy.",
            "Commodity prices rise slightly; manufacturing costs increase.",
            "Logistics firms report minor delays in shipping routes."
        ],
        "INFLATION_CRASH": [
            "Central Bank hikes rates aggressively to combat spiraling costs.",
            "Liquidity dries up; Bond & Tech sectors hit by selling pressure.",
            "Consumer spending contracts sharply on rate hike news."
        ],
        "RECESSION_HINT": [
            "Manufacturing output slows for the second consecutive quarter.",
            "Consumer confidence index drops.",
            "Corporate hiring freezes hint at economic slowdown."
        ],
        "RECESSION_CRASH": [
            "Global Recession declared following weak GDP data.",
            "Demand collapses; Oil & Real Estate sectors plummet.",
            "Corporate earnings miss targets; layoffs accelerate."
        ],
        "RECOVERY": [
            "Market shows signs of bottoming out; value investors return.",
            "Green shoots: Economic indicators stabilize after downturn.",
            "Panic subsides as volatility index drops."
        ]
    }
    
    @staticmethod
    def get_headline(shock_type, stage):
        key = "NORMAL"
        if stage == 'WARNING':
            key = f"{shock_type}_HINT" if shock_type != 'NONE' else "NORMAL"
        elif stage == 'CRASH':
            key = f"{shock_type}_CRASH" if shock_type != 'NONE' else "NORMAL"
        elif stage == 'RECOVERY':
            key = "RECOVERY"
        
        candidates = NewsCaster.TEMPLATES.get(key, NewsCaster.TEMPLATES["NORMAL"])
        return random.choice(candidates)

class MarketEngine:
    def __init__(self, session: Session):
        self.session = session

    def initialize_assets(self):
        if not self.session.exec(select(Asset)).first():
            assets = [
                Asset(name="Gold Reserves", ticker="GOLD", base_price=5000.0, current_price=5000.0, volatility=0.05, macro_sensitivity=-0.8, base_cagr=0.03, description="Safe haven."),
                Asset(name="Tech Growth ETF", ticker="TECH", base_price=1000.0, current_price=1000.0, volatility=0.25, macro_sensitivity=2.0, base_cagr=0.15, description="High growth, high risk."),
                Asset(name="Crude Oil", ticker="OIL", base_price=80.0, current_price=80.0, volatility=0.15, macro_sensitivity=0.8, base_cagr=0.08, description="Cyclical energy."),
                Asset(name="Real Estate", ticker="REAL", base_price=2500.0, current_price=2500.0, volatility=0.03, macro_sensitivity=0.4, base_cagr=0.06, description="Stable growth."),
                Asset(name="Govt Bonds", ticker="BOND", base_price=100.0, current_price=100.0, volatility=0.01, macro_sensitivity=-0.2, base_cagr=0.05, description="Steady yield.")
            ]
            self.session.add_all(assets)
            state = MarketState(current_year=2024, phase="PRE_GAME", news_feed="Welcome to Econova Enterprise.")
            self.session.add(state)
            self.session.commit()
            
            # Seed Initial History
            for asset in assets:
                 self.session.refresh(asset)
                 self.session.add(PriceHistory(asset_id=asset.id, year=2024, price=asset.current_price))
            self.session.commit()

    def get_state(self) -> MarketState:
        return self.session.exec(select(MarketState)).first()

    # --- SIMULATION LOGIC ---
    def step_simulation(self):
        state = self.get_state()
        if state.phase == "FINISHED": return
        
        next_year = state.current_year + 1
        
        # 1. Update Asset Prices
        assets = self.session.exec(select(Asset)).all()
        for asset in assets:
            shock_factor = 0.0
            
            # Shock Logic - REBALANCED
            if state.shock_stage == 'WARNING':
                # Small positive boost during warning to prevent pre-crash collapse
                shock_factor = 0.01
            elif state.shock_stage == 'CRASH':
                beta = asset.macro_sensitivity
                if state.shock_type == 'INFLATION':
                    if asset.ticker == 'GOLD': 
                        shock_factor = 0.12  # Moderate gain
                    elif asset.ticker == 'TECH': 
                        shock_factor = -0.15  # Reduced from -0.25
                    elif asset.ticker == 'BOND':
                        shock_factor = -0.08  # Bonds suffer in inflation
                    else: 
                        shock_factor = -0.10 * abs(beta)  # Reduced impact
                elif state.shock_type == 'RECESSION':
                    if asset.ticker == 'BOND': 
                        shock_factor = 0.10  # Moderate gain
                    elif asset.ticker in ['OIL', 'REAL']: 
                        shock_factor = -0.15  # Reduced from -0.20
                    elif asset.ticker == 'GOLD':
                        shock_factor = 0.05  # Safe haven
                    else: 
                        shock_factor = -0.12 * abs(beta)
                else:
                    shock_factor = -0.10 * abs(beta)
            elif state.shock_stage == 'RECOVERY':
                shock_factor = 0.12  # Increased recovery boost
            
            # ENHANCED Mean Reversion - Tiered Recovery
            price_ratio = asset.current_price / asset.base_price
            
            # Strong recovery for crashed assets
            if price_ratio < 0.2:  # Below 20% of base
                shock_factor += 0.20  # Very strong recovery
            elif price_ratio < 0.4:  # Below 40% of base
                shock_factor += 0.12  # Strong recovery
            elif price_ratio < 0.6:  # Below 60% of base
                shock_factor += 0.06  # Moderate recovery
            
            # Upper bounds for defensive assets (prevent infinite growth)
            if price_ratio > 2.0:  # Above 200% of base
                shock_factor -= 0.10  # Strong penalty
            elif price_ratio > 1.5:  # Above 150% of base
                shock_factor -= 0.05  # Moderate penalty
            
            # Reduced noise impact for stability
            noise = random.gauss(0, asset.volatility * 0.2)  # Further reduced
            
            # Calculate growth with base CAGR always applying
            growth = asset.base_cagr + shock_factor + noise
            
            # Cap single-year changes for stability
            growth = max(min(growth, 0.40), -0.40)  # Max ±40% per year
            
            # Calculate new price
            new_price = asset.current_price * (1 + growth)
            
            # Apply bounds: 20% floor, 300% ceiling
            min_price = asset.base_price * 0.20  # Raised from 0.10
            max_price = asset.base_price * 3.00  # New ceiling
            new_price = max(min_price, min(max_price, new_price))
            
            # Record History
            self.session.add(PriceHistory(asset_id=asset.id, year=next_year, price=new_price))
            
            asset.current_price = new_price
            self.session.add(asset)
            
        # 2. Process Credit (Interest)
        loans = self.session.exec(select(TeamLoan).where(TeamLoan.status == LoanStatus.ACTIVE)).all()
        for loan in loans:
            borrower = self.session.get(User, loan.borrower_id)
            lender = self.session.get(User, loan.lender_id)
            
            interest = loan.principal * (loan.interest_rate / 100.0)
            
            if borrower.cash < interest:
                borrower.is_frozen = True # Bankruptcy
                loan.status = LoanStatus.DEFAULTED
                state.news_feed = f"BANKRUPTCY ALERT: {borrower.username} defaulted!"
                self.session.add(borrower)
                self.session.add(loan)
            else:
                borrower.cash -= interest
                lender.cash += interest
                self.session.add(borrower)
                self.session.add(lender)

        state.current_year = next_year
        self.session.add(state)
        self.session.commit()

    def trigger_shock(self, type_: str, action: str):
        state = self.get_state()
        state.shock_type = type_
        state.shock_stage = "WARNING" if action == "HINT" else "CRASH"
        state.news_feed = NewsCaster.get_headline(type_, state.shock_stage)
        self.session.add(state)
        self.session.commit()

    # --- AUCTION LOGIC (MULTI-LOT SYSTEM) ---
    
    # Lot configurations: {ticker: [(quantity, base_price_multiplier), ...]}
    LOT_CONFIGS = {
        'GOLD': [(10, 1.0), (15, 1.0), (20, 1.0)],  # tonnes
        'TECH': [(50, 1.0), (75, 1.0), (100, 1.0)],  # shares
        'OIL': [(100, 1.0), (150, 1.0), (200, 1.0)],  # barrels
        'REAL': [(5, 1.0), (10, 1.0)],  # properties
        'BOND': [(100, 1.0), (200, 1.0), (300, 1.0)]  # units
    }
    
    def create_auction_lots(self, ticker: str):
        """Create multiple lots for an asset auction"""
        asset = self.session.exec(select(Asset).where(Asset.ticker == ticker)).first()
        if not asset:
            raise ValueError(f"Asset {ticker} not found")
        
        # Clear old lots
        old_lots = self.session.exec(select(AuctionLot).where(AuctionLot.asset_ticker == ticker)).all()
        for lot in old_lots:
            self.session.delete(lot)
        
        # Create new lots based on configuration
        lot_config = self.LOT_CONFIGS.get(ticker, [(10, 1.0)])  # Default config
        
        for lot_num, (quantity, price_mult) in enumerate(lot_config, 1):
            lot = AuctionLot(
                asset_ticker=ticker,
                lot_number=lot_num,
                quantity=quantity,
                base_price=asset.base_price * price_mult,
                status=LotStatus.ACTIVE
            )
            self.session.add(lot)
        
        self.session.commit()
    
    def start_auction(self, ticker: str):
        """Start auction with multiple lots"""
        state = self.get_state()
        state.phase = "AUCTION"
        state.active_auction_asset = ticker
        state.news_feed = f"🚨 AUCTION OPEN: {ticker} - Multiple lots available!"
        
        # Create lots for this auction
        self.create_auction_lots(ticker)
        
        # Clear old bids
        old_bids = self.session.exec(select(AuctionBid).where(AuctionBid.asset_ticker == ticker)).all()
        for bid in old_bids:
            self.session.delete(bid)
        
        self.session.add(state)
        self.session.commit()
    
    def place_bid(self, user: User, lot_id: int, amount: float):
        """Place bid on a specific lot"""
        state = self.get_state()
        ticker = state.active_auction_asset
        if not ticker:
            raise ValueError("No active auction")
        
        # Get the lot
        lot = self.session.get(AuctionLot, lot_id)
        if not lot or lot.asset_ticker != ticker:
            raise ValueError("Invalid lot")
        
        if lot.status != LotStatus.ACTIVE:
            raise ValueError("Lot is not active")
        
        # Check if bid is at least base price
        if amount < lot.base_price:
            raise ValueError(f"Bid must be at least ${lot.base_price:,.2f}")
        
        total_cost = amount * lot.quantity
        if user.cash < total_cost:
            raise ValueError(f"Insufficient funds. Need ${total_cost:,.0f}")
        
        # Create bid
        bid = AuctionBid(
            user_id=user.id,
            asset_ticker=ticker,
            lot_id=lot_id,
            amount=amount,
            quantity=lot.quantity
        )
        self.session.add(bid)
        self.session.commit()
    
    def resolve_auction(self):
        """Resolve auction - award each lot to highest bidder"""
        state = self.get_state()
        ticker = state.active_auction_asset
        if not ticker:
            return "No active auction"
        
        asset = self.session.exec(select(Asset).where(Asset.ticker == ticker)).first()
        if not asset:
            return "Asset not found"
        
        # Get all active lots
        lots = self.session.exec(
            select(AuctionLot).where(
                AuctionLot.asset_ticker == ticker,
                AuctionLot.status == LotStatus.ACTIVE
            )
        ).all()
        
        results = []
        total_volume = 0
        weighted_price_sum = 0
        
        for lot in lots:
            # Find highest bid for this lot
            bids = self.session.exec(
                select(AuctionBid).where(
                    AuctionBid.lot_id == lot.id
                ).order_by(AuctionBid.amount.desc())
            ).all()
            
            if bids:
                winner_bid = bids[0]
                winner = self.session.get(User, winner_bid.user_id)
                
                total_cost = winner_bid.amount * winner_bid.quantity
                
                # Check funds
                if winner.cash >= total_cost:
                    # Execute transaction
                    winner.cash -= total_cost
                    
                    # Update/Create Holding
                    holding = self.session.exec(select(Holding).where(
                        Holding.user_id == winner.id,
                        Holding.asset_id == asset.id
                    )).first()
                    
                    if holding:
                        total_val = (holding.quantity * holding.avg_cost) + total_cost
                        new_qty = holding.quantity + winner_bid.quantity
                        holding.avg_cost = total_val / new_qty
                        holding.quantity = new_qty
                        self.session.add(holding)
                    else:
                        holding = Holding(
                            user_id=winner.id,
                            asset_id=asset.id,
                            quantity=winner_bid.quantity,
                            avg_cost=winner_bid.amount
                        )
                        self.session.add(holding)
                    
                    # Update lot
                    lot.status = LotStatus.SOLD
                    lot.winner_id = winner.id
                    lot.winning_bid = winner_bid.amount
                    
                    self.session.add(winner)
                    self.session.add(lot)
                    
                    # Track for price update
                    total_volume += winner_bid.quantity
                    weighted_price_sum += winner_bid.amount * winner_bid.quantity
                    
                    results.append(f"Lot {lot.lot_number}: {winner.username} @ ${winner_bid.amount:,.0f}")
                else:
                    lot.status = LotStatus.CANCELLED
                    self.session.add(lot)
                    results.append(f"Lot {lot.lot_number}: No sale (insufficient funds)")
            else:
                lot.status = LotStatus.CANCELLED
                self.session.add(lot)
                results.append(f"Lot {lot.lot_number}: No bids")
        
        # Update market price based on weighted average of winning bids
        if total_volume > 0:
            avg_winning_price = weighted_price_sum / total_volume
            asset.current_price = (0.7 * asset.current_price) + (0.3 * avg_winning_price)
            self.session.add(asset)
        
        msg = f"Auction for {ticker} completed. " + "; ".join(results)
        state.active_auction_asset = None
        state.news_feed = msg
        state.phase = "TRADING"
        self.session.add(state)
        self.session.commit()
        
        return msg

    # --- TRADING LOGIC ---
    def execute_trade(self, buyer_id: int, seller_id: int, asset_id: int, qty: int, price: float):
        buyer = self.session.get(User, buyer_id)
        seller = self.session.get(User, seller_id)
        total = qty * price
        
        if buyer.cash < total: raise ValueError("Buyer broke")
        
        # Verify Seller Holding
        s_hold = self.session.exec(select(Holding).where(Holding.user_id == seller_id, Holding.asset_id == asset_id)).first()
        if not s_hold or s_hold.quantity < qty: raise ValueError("Seller needs assets")
        
        # Transfer Cash
        buyer.cash -= total
        seller.cash += total
        
        # Transfer Asset
        s_hold.quantity -= qty
        if s_hold.quantity == 0: self.session.delete(s_hold)
        else: self.session.add(s_hold)
        
        b_hold = self.session.exec(select(Holding).where(Holding.user_id == buyer_id, Holding.asset_id == asset_id)).first()
        if b_hold:
            new_cost = ((b_hold.quantity * b_hold.avg_cost) + total) / (b_hold.quantity + qty)
            b_hold.quantity += qty
            b_hold.avg_cost = new_cost
            self.session.add(b_hold)
        else:
            self.session.add(Holding(user_id=buyer_id, asset_id=asset_id, quantity=qty, avg_cost=price))
            
        # Update Market Price
        asset = self.session.get(Asset, asset_id)
        asset.current_price = (0.7 * asset.current_price) + (0.3 * price) # Weighted update
        self.session.add(asset)
        
        self.session.add(buyer)
        self.session.add(seller)
        self.session.commit()
