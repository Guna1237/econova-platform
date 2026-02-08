import math
import random
from datetime import datetime
from sqlmodel import Session, select, func
from .models import Asset, MarketState, Order, OrderStatus, OrderType, User, Holding, TeamLoan, LoanStatus, AuctionBid, PriceHistory, Role, AuctionLot, LotStatus, ActiveEvent, NewsItem

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

    MICRO_TEMPLATES = {
        "GOLD": [
            ("New major gold vein discovered in South Africa.", -0.05, 3), # Supply up, price down
            ("Central Bank announces gold buying program.", 0.08, 2), # Demand up
            ("Mining strike halts global production.", 0.12, 1), # Supply down
        ],
        "TECH": [
            ("Breakthrough in quantum computing efficiency announced.", 0.15, 3), # Hype
            ("Regulatory scrutiny on big tech monopolies increases.", -0.10, 2), # Fear
            ("Supply chain shortage affects chip manufacturing.", -0.08, 1),
        ],
        "OIL": [
            ("OPEC announces surprise production cut.", 0.20, 1), # Shock
            ("New electric vehicle subsidy reduces oil demand forecasts.", -0.05, 4), # Trend
            ("Geopolitical tension threatens major pipeline.", 0.12, 1),
        ],
        "REAL": [
            ("Housing boom driven by low interest rates.", 0.08, 3),
            ("New zoning laws restrict commercially viable land.", 0.05, 5),
            ("Construction material costs skyrocket.", -0.06, 2),
        ],
        "BOND": [
            ("Credit rating agency upgrades sovereign debt outlook.", 0.03, 3),
            ("Inflation fears drive bond sell-off.", -0.04, 1),
             ("Flight to safety increases demand for bonds.", 0.05, 1),
        ]
    }

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
        
        # --- MICRO EVENTS GENERATION ---
        # 10% chance per asset to trigger a new event if not in a crash
        if state.shock_stage == 'NONE' or state.shock_stage == 'RECOVERY':
            assets = self.session.exec(select(Asset)).all()
            for asset in assets:
                 # Check if already has an event
                existing = self.session.exec(select(ActiveEvent).where(ActiveEvent.asset_ticker == asset.ticker)).all()
                if len(existing) >= 1: continue # Max 1 event at a time per asset

                if random.random() < 0.15: # 15% chance
                    templates = NewsCaster.MICRO_TEMPLATES.get(asset.ticker, [])
                    if templates:
                        desc, impact, duration = random.choice(templates)
                        # Add some randomness to impact
                        final_impact = impact * (0.8 + random.random() * 0.4) 
                        
                        event = ActiveEvent(
                            asset_ticker=asset.ticker,
                            description=desc,
                            annual_impact=final_impact,
                            start_year=next_year,
                            duration=duration,
                            remaining_years=duration
                        )
                        self.session.add(event)
                        
                        # Post News
                        news = NewsItem(
                            title=f"Market Update: {asset.name}",
                            content=f"{desc} Analysts project an annual impact of {final_impact*100:.1f}% on {asset.ticker}.",
                            is_published=True,
                            source="Bloomberg Terminal",
                            published_at=datetime.utcnow()
                        )
                        self.session.add(news)

        # Check for recovery timing (3-4 years after shock)
        if state.shock_stage == 'CRASH' and state.last_shock_year:
            years_since_shock = next_year - state.last_shock_year
            if years_since_shock >= 3: # Trigger recovery after 3 years
                state.shock_stage = 'RECOVERY'
                state.news_feed = NewsCaster.get_headline(state.shock_type, 'RECOVERY')

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
                # Strong recovery boost
                shock_factor = 0.15 + (random.random() * 0.10) # 15-25% boost

            # ENHANCED Mean Reversion - Pull towards base price
            # Calculate deviation ratio (e.g., 0.5 means price is 50% of base)
            price_ratio = asset.current_price / asset.base_price
            
            # k is the mean reversion speed
            k_reversion = 0.0
            
            if price_ratio < 0.5: # Extremely undervalued
                k_reversion = 0.15 # Reduced from 0.20
            elif price_ratio < 0.8: # Undervalued
                k_reversion = 0.08 # Reduced from 0.10
            elif price_ratio > 2.0: # Extremely overvalued
                k_reversion = -0.10 # Reduced from -0.15
            elif price_ratio > 1.5: # Overvalued
                k_reversion = -0.05 # Reduced from -0.08
                
            # Micro Event Impact
            micro_impact = 0.0
            active_events = self.session.exec(select(ActiveEvent).where(ActiveEvent.asset_ticker == asset.ticker)).all()
            for event in active_events:
                micro_impact += event.annual_impact
                event.remaining_years -= 1
                if event.remaining_years <= 0:
                    self.session.delete(event)
                else:
                    self.session.add(event)

            # Calculation
            # Increased noise factor from 0.15 to 0.3 for more "real life" volatility
            noise = random.gauss(0, asset.volatility * 0.3)
            
            # Calculate total growth
            growth = asset.base_cagr + shock_factor + k_reversion + micro_impact + noise
            
            # Cap single-year changes for stability
            growth = max(min(growth, 0.50), -0.40)  # Max +50% / -40% per year
            
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
        
        # Record shock year for recovery timing
        if state.shock_stage == 'CRASH':
            state.last_shock_year = state.current_year
            
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
                status=LotStatus.ACTIVE if lot_num == 1 else LotStatus.PENDING
            )
            self.session.add(lot)
        
        self.session.commit()
    
    def start_auction(self, ticker: str):
        """Start auction with multiple lots"""
        state = self.get_state()
        state.phase = "AUCTION"
        state.active_auction_asset = ticker
        self.session.add(state)
        
        self.create_auction_lots(ticker)
        self.session.commit()
    
    def place_bid(self, user: User, lot_id: int, amount: float):
        """Place a bid on a specific lot"""
        state = self.get_state()
        ticker = state.active_auction_asset
        
        if not ticker:
            raise ValueError("No active auction")
        
        # Check if asset matches
        # (Implicitly checked by lot association, but good for safety)
        
        from .models import AuctionLot
        lot = self.session.get(AuctionLot, lot_id)
        if not lot:
            raise ValueError("Lot not found")
            
        if lot.asset_ticker != ticker:
            raise ValueError("Lot does not belong to active auction asset")
            
        if lot.status != LotStatus.ACTIVE:
            raise ValueError("Lot is not active for bidding")
        
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
        """Resolve active lot and open next one if available"""
        state = self.get_state()
        ticker = state.active_auction_asset
        if not ticker:
            return "No active auction"
        
        asset = self.session.exec(select(Asset).where(Asset.ticker == ticker)).first()
        if not asset:
            return "Asset not found"
        
        # Get the currently ACTIVE lot
        active_lot = self.session.exec(
            select(AuctionLot).where(
                AuctionLot.asset_ticker == ticker,
            )
        ).first()
        
        if not active_lot:
            return "No active lot to resolve"
        
        results_msg = ""
        
        # Resolve the active lot
        bids = self.session.exec(
            select(AuctionBid).where(
                AuctionBid.lot_id == active_lot.id
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
                active_lot.status = LotStatus.SOLD
                active_lot.winner_id = winner.id
                active_lot.winning_bid = winner_bid.amount
                
                self.session.add(winner)
                self.session.add(active_lot)
                
                # Incremental Price Update
                # Weight by volume relative to supply could be better, but simple weighted average is safer for stability
                # Using 0.95 (current) vs 0.05 (new) to avoid massive swings from small lots
                asset.current_price = (0.95 * asset.current_price) + (0.05 * winner_bid.amount)
                self.session.add(asset)

                results_msg = f"Lot {active_lot.lot_number} SOLD to {winner.username} @ ${winner_bid.amount:,.0f}"
            else:
                active_lot.status = LotStatus.CANCELLED
                self.session.add(active_lot)
                results_msg = f"Lot {active_lot.lot_number} CANCELLED (Winner insufficient funds)"
        else:
            active_lot.status = LotStatus.CANCELLED
            self.session.add(active_lot)
            results_msg = f"Lot {active_lot.lot_number} CLOSED (No bids)"

        # Activate NEXT lot
        next_lot = self.session.exec(
            select(AuctionLot).where(
                AuctionLot.asset_ticker == ticker,
                AuctionLot.status == LotStatus.PENDING,
                AuctionLot.lot_number > active_lot.lot_number
            ).order_by(AuctionLot.lot_number)
        ).first()

        if next_lot:
            next_lot.status = LotStatus.ACTIVE
            self.session.add(next_lot)
            results_msg += f" | Lot {next_lot.lot_number} now ACTIVE"
        else:
            results_msg += " | Auction Complete"
            state.active_auction_asset = None # Close auction if no lots left
            state.phase = "TRADING"
            self.session.add(state)
            
        self.session.commit()
        return results_msg

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
