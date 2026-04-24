import math
import random
from datetime import datetime, timezone
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
            "Bond yields climb for the third consecutive week as traders price in tighter monetary policy ahead.",
            "Shipping costs from Asia up 22% this quarter. Supply chain stress is returning across key corridors.",
            "PPI data shows input costs accelerating at the fastest pace in 18 months. Margins under pressure.",
            "Freight indices surge on port congestion. Wholesale prices creeping higher across categories."
        ],
        "INFLATION_CRASH": [
            "Central Bank hikes rates aggressively to combat spiraling costs. Growth assets under severe pressure.",
            "Liquidity dries up as monetary tightening accelerates. Tech and bond sectors face selling pressure.",
            "Consumer spending contracts sharply on rate hike news. Credit conditions tighten across the board."
        ],
        "RECESSION_HINT": [
            "PMI manufacturing index falls below 50 for the second consecutive month. Economists revise forecasts lower.",
            "Consumer confidence slips to a 14-month low. Spending growth is decelerating across retail segments.",
            "Credit card delinquencies tick upward. Banks quietly tighten lending criteria for new borrowers.",
            "Yield curve flattening continues. Fixed income markets signaling caution on near-term growth."
        ],
        "RECESSION_CRASH": [
            "Global Recession declared following weak GDP data. Demand collapses; Oil & Real Estate sectors plummet.",
            "Corporate earnings miss targets by wide margins; layoffs accelerate. Risk-off positioning intensifies.",
            "Credit markets seize up as default fears spread. Liquidity premium on safe-haven assets surges."
        ],
        "RECOVERY": [
            "Market shows signs of bottoming out; value investors return. Volatility index retreats from recent highs.",
            "Green shoots: Economic indicators stabilize after the downturn. Business confidence rebounds cautiously.",
            "Panic subsides as credit spreads compress. Central Bank signals policy pivot; risk appetite slowly returns."
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
        "NVDA": [
            ("NVIDIA announces next-gen GPU architecture, exceeding analyst expectations.", 0.15, 3),
            ("Regulatory scrutiny on AI chip exports increases.", -0.10, 2),
            ("Supply chain shortage affects advanced chip manufacturing.", -0.08, 1),
        ],
        "BRENT": [
            ("OPEC announces surprise production cut.", 0.20, 1), # Shock
            ("New electric vehicle subsidy reduces oil demand forecasts.", -0.05, 4), # Trend
            ("Geopolitical tension threatens major pipeline.", 0.12, 1),
        ],
        "REITS": [
            ("Housing boom driven by low interest rates.", 0.08, 3),
            ("New zoning laws restrict commercially viable land.", 0.05, 5),
            ("Construction material costs skyrocket.", -0.06, 2),
        ],
        "TBILL": [
            ("US Treasury yield curve shifts on Fed policy signal.", 0.005, 3),
            ("Treasury auction sees strong demand from institutional buyers.", 0.003, 2),
            ("Fiscal stimulus bill raises Treasury issuance outlook.", -0.003, 2),
        ]
    }

class MarketEngine:
    def __init__(self, session: Session):
        self.session = session

    def initialize_assets(self):
        if not self.session.exec(select(Asset)).first():
            assets = [
                Asset(name="Gold Reserves", ticker="GOLD", base_price=5000.0, current_price=5000.0, volatility=0.10, macro_sensitivity=-0.8, base_cagr=0.03, description="Safe haven asset. Inversely correlated to market risk."),
                Asset(name="NVIDIA Growth ETF", ticker="NVDA", base_price=1000.0, current_price=1000.0, volatility=0.25, macro_sensitivity=2.5, base_cagr=0.15, description="High growth, high risk AI & semiconductor sector."),
                Asset(name="S&P Brent Crude Oil", ticker="BRENT", base_price=80.0, current_price=80.0, volatility=0.20, macro_sensitivity=0.8, base_cagr=0.08, description="Cyclical energy commodity benchmarked to Brent crude."),
                Asset(name="REITs Index", ticker="REITS", base_price=2500.0, current_price=2500.0, volatility=0.08, macro_sensitivity=0.4, base_cagr=0.06, description="Real Estate Investment Trust diversified index."),
                Asset(name="US Treasury Bills", ticker="TBILL", base_price=100.0, current_price=100.0, volatility=0.0, macro_sensitivity=0.0, base_cagr=0.03, description="Risk-free government securities. Guaranteed low yield (~3%/yr).")
            ]
            self.session.add_all(assets)
            state = MarketState(current_year=0, current_quarter=1, phase="PRE_GAME", news_feed="Welcome to Econova Enterprise.")
            self.session.add(state)
            self.session.commit()
            
            # Seed Initial History
            for asset in assets:
                 self.session.refresh(asset)
                 self.session.add(PriceHistory(asset_id=asset.id, year=0, quarter=0, price=asset.current_price))
            self.session.commit()

    def get_state(self) -> MarketState:
        return self.session.exec(select(MarketState)).first()

    # --- SIMULATION LOGIC ---
    def step_quarter(self):
        """Advance simulation by one quarter (1/4 year)"""
        state = self.get_state()
        if state.phase == "FINISHED": return
        
        current_year = state.current_year
        current_q = state.current_quarter
        
        # Calculate next quarter/year
        if current_q >= 4:
            next_year = current_year + 1
            next_q = 1
        else:
            next_year = current_year
            next_q = current_q + 1
        
        quarter_scale = 0.25  # Scale annual effects to quarterly
        
        # --- MICRO EVENTS GENERATION (only at Q1 of each year) ---
        if next_q == 1 and (state.shock_stage == 'NONE' or state.shock_stage == 'RECOVERY'):
            assets = self.session.exec(select(Asset)).all()
            for asset in assets:
                if asset.ticker == 'TBILL': continue  # No events for T-Bills
                if asset.ticker not in NewsCaster.MICRO_TEMPLATES: continue
                existing = self.session.exec(select(ActiveEvent).where(ActiveEvent.asset_ticker == asset.ticker)).all()
                if len(existing) >= 1: continue
                if random.random() < 0.20:
                    templates = NewsCaster.MICRO_TEMPLATES.get(asset.ticker, [])
                    if templates:
                        desc, impact, duration = random.choice(templates)
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
                        news = NewsItem(
                            title=f"Market Update: {asset.name}",
                            content=f"{desc} Analysts project an annual impact of {final_impact*100:.1f}% on {asset.ticker}.",
                            is_published=True,
                            source="Bloomberg Terminal",
                            published_at=datetime.now(timezone.utc)
                        )
                        self.session.add(news)

        # ── helpers ─────────────────────────────────────────────────────────────
        def _t_variate(sigma: float, df: int = 4) -> float:
            """Draw from a scaled t-distribution (fat tails, improvement F).
            df=4 gives realistic market fat-tail behaviour."""
            z = random.gauss(0, 1)
            chi2 = sum(random.gauss(0, 1) ** 2 for _ in range(df))
            return sigma * z / math.sqrt(chi2 / df)

        # E — interest-rate effect on per-asset effective CAGR
        ir_level = getattr(state, 'global_interest_rate', 'NEUTRAL')
        IR_DELTA = {  # annual delta added to base_cagr per ticker
            'LOW':     {'GOLD': 0.01, 'NVDA': 0.02, 'BRENT':  0.01, 'REITS':  0.04, 'TBILL': -0.01},
            'NEUTRAL': {'GOLD': 0.00, 'NVDA': 0.00, 'BRENT':  0.00, 'REITS':  0.00, 'TBILL':  0.00},
            'HIGH':    {'GOLD': 0.02, 'NVDA': -0.05, 'BRENT': -0.01, 'REITS': -0.08, 'TBILL':  0.02},
        }
        ir_deltas = IR_DELTA.get(ir_level, IR_DELTA['NEUTRAL'])

        # A — cross-asset correlation matrix (applied after individual growths computed)
        # Structure: CORR[ticker] = [(peer_ticker, weight), ...]
        CORR = {
            'GOLD':  [('BRENT',  0.20), ('NVDA', -0.10)],
            'BRENT': [('GOLD',   0.20), ('REITS', -0.10)],
            'NVDA':  [('REITS',  0.15), ('GOLD', -0.10)],
            'REITS': [('NVDA',   0.15), ('BRENT', -0.10)],
        }

        # G — herd sentiment: count distinct team sellers per asset this quarter
        # Uses Transaction table; seller role=team implies sell-pressure.
        from .models import Transaction
        quarter_trades = self.session.exec(
            select(Transaction)
            .where(Transaction.timestamp >= datetime.now(timezone.utc).replace(hour=0, minute=0, second=0))
        ).all()
        team_users = {u.id for u in self.session.exec(select(User).where(User.role == Role.TEAM)).all()}
        sell_counts: dict = {}
        for t in quarter_trades:
            if t.seller_id in team_users:
                sell_counts[t.asset_ticker] = sell_counts.get(t.asset_ticker, 0) + 1

        # 1. Update Asset Prices ────────────────────────────────────────────────
        assets = self.session.exec(select(Asset)).all()
        asset_map = {a.ticker: a for a in assets}

        # First pass: compute independent growth for each non-TBILL asset
        independent_growth: dict = {}

        for asset in assets:
            # --- US Treasury Bills: guaranteed, risk-free yield ---
            if asset.ticker == 'TBILL':
                ir_adj = ir_deltas.get('TBILL', 0.0)
                effective_cagr = max(0.005, asset.base_cagr + ir_adj)
                quarterly_yield = effective_cagr * quarter_scale
                new_price = asset.current_price * (1 + quarterly_yield)
                self.session.add(PriceHistory(asset_id=asset.id, year=next_year, quarter=next_q, price=new_price))
                asset.current_price = new_price
                self.session.add(asset)
                continue

            shock_factor = 0.0
            # Shock Logic
            if state.shock_stage == 'WARNING':
                shock_factor = -0.02 * quarter_scale
            elif state.shock_stage == 'CRASH':
                beta = asset.macro_sensitivity
                if state.shock_type == 'INFLATION':
                    if asset.ticker == 'GOLD':    shock_factor =  0.12 * quarter_scale
                    elif asset.ticker == 'BRENT': shock_factor =  0.10 * quarter_scale
                    elif asset.ticker == 'NVDA':  shock_factor = -0.15 * quarter_scale
                    elif asset.ticker == 'REITS': shock_factor = -0.06 * quarter_scale
                    else:                         shock_factor = -0.10 * abs(beta) * quarter_scale
                elif state.shock_type == 'RECESSION':
                    if asset.ticker == 'GOLD':               shock_factor =  0.08 * quarter_scale
                    elif asset.ticker in ['BRENT', 'REITS']: shock_factor = -0.15 * quarter_scale
                    else:                                     shock_factor = -0.12 * abs(beta) * quarter_scale
                else:
                    shock_factor = -0.10 * abs(beta) * quarter_scale
            elif state.shock_stage == 'RECOVERY':
                shock_factor = (0.08 + (random.random() * 0.07)) * quarter_scale

            # Mean Reversion
            recent_history = self.session.exec(
                select(PriceHistory).where(PriceHistory.asset_id == asset.id)
                .order_by(PriceHistory.id.desc()).limit(4)
            ).all()
            reversion_anchor = (
                sum(r.price for r in recent_history) / len(recent_history)
                if len(recent_history) >= 4 else asset.base_price
            )
            price_ratio = asset.current_price / reversion_anchor if reversion_anchor > 0 else 1.0
            k_reversion = 0.0
            if price_ratio < 0.5:   k_reversion =  0.15 * quarter_scale
            elif price_ratio < 0.8: k_reversion =  0.08 * quarter_scale
            elif price_ratio > 2.0: k_reversion = -0.10 * quarter_scale
            elif price_ratio > 1.5: k_reversion = -0.05 * quarter_scale

            # Momentum
            momentum = 0.0
            prev_entries = self.session.exec(
                select(PriceHistory).where(PriceHistory.asset_id == asset.id)
                .order_by(PriceHistory.id.desc()).limit(2)
            ).all()
            if len(prev_entries) >= 2 and prev_entries[1].price > 0:
                last_return = (prev_entries[0].price - prev_entries[1].price) / prev_entries[1].price
                momentum = max(min(last_return * 0.15, 0.03), -0.03)

            # Micro Event Impact
            micro_impact = 0.0
            active_events = self.session.exec(
                select(ActiveEvent).where(ActiveEvent.asset_ticker == asset.ticker)
            ).all()
            for event in active_events:
                micro_impact += event.annual_impact * quarter_scale
                if next_q == 4:
                    event.remaining_years -= 1
                    if event.remaining_years <= 0:
                        self.session.delete(event)
                    else:
                        self.session.add(event)

            # F — Fat-tail noise via t-distribution (df=4) instead of Gaussian
            noise = _t_variate(asset.volatility * 0.8 * math.sqrt(quarter_scale))
            if random.random() < 0.05:
                noise += random.choice([-0.02, 0.02])

            # Sentiment multiplier (admin dial)
            SENTIMENT_MULT = {"BULLISH": 1.25, "NEUTRAL": 1.0, "BEARISH": 0.75}
            sent_mult = SENTIMENT_MULT.get(getattr(state, 'sentiment', 'NEUTRAL'), 1.0)
            noise = noise * sent_mult

            # E — interest rate adjustment to CAGR
            ir_adj = ir_deltas.get(asset.ticker, 0.0)
            cagr_component = (asset.base_cagr + ir_adj) * quarter_scale
            cagr_component += cagr_component * (sent_mult - 1.0) * 0.3

            # G — herd sell-pressure: ≥3 distinct teams selling → extra bearish nudge
            herd_pressure = 0.0
            if sell_counts.get(asset.ticker, 0) >= 3:
                herd_pressure = -0.015 * quarter_scale  # -1.5% annualised drag
                # Auto-generate a news blurb about the selling pressure
                if random.random() < 0.6:
                    news_blurb = NewsItem(
                        title=f"Selling Pressure Detected: {asset.name}",
                        content=(
                            f"Multiple teams have been liquidating {asset.ticker} positions this period. "
                            f"Broad-based selling may signal deteriorating confidence in the asset."
                        ),
                        is_published=True,
                        source="Econova Analytics",
                        published_at=datetime.now(timezone.utc),
                        sim_year=next_year,
                        sim_quarter=next_q,
                        category="market",
                    )
                    self.session.add(news_blurb)

            growth = cagr_component + shock_factor + k_reversion + momentum + micro_impact + noise + herd_pressure
            independent_growth[asset.ticker] = growth

        # A — Second pass: apply cross-asset correlation adjustments
        for asset in assets:
            if asset.ticker == 'TBILL':
                continue
            if asset.ticker not in independent_growth:
                continue
            base_growth = independent_growth[asset.ticker]
            corr_adjustment = 0.0
            for peer_ticker, weight in CORR.get(asset.ticker, []):
                peer_growth = independent_growth.get(peer_ticker, 0.0)
                corr_adjustment += weight * peer_growth
            # Dampen correlation during shocks (they're already priced in via shock_factor)
            if state.shock_stage in ('CRASH', 'WARNING'):
                corr_adjustment *= 0.3
            total_growth = base_growth + corr_adjustment

            new_price = max(0.10, asset.current_price * (1 + total_growth))

            # D — REITS quarterly dividend (2% annual → 0.5% per quarter) paid to all holders
            if asset.ticker == 'REITS':
                dividend_rate = 0.005  # 0.5% per quarter = 2% annual
                # Adjust by interest rate: lower rates → higher REIT yield attractiveness
                if ir_level == 'HIGH':
                    dividend_rate = 0.003
                elif ir_level == 'LOW':
                    dividend_rate = 0.007
                reit_holders = self.session.exec(
                    select(Holding).where(Holding.asset_id == asset.id)
                ).all()
                for h in reit_holders:
                    holder = self.session.get(User, h.user_id)
                    if holder:
                        dividend = h.quantity * asset.current_price * dividend_rate
                        holder.cash += dividend
                        self.session.add(holder)

            self.session.add(PriceHistory(asset_id=asset.id, year=next_year, quarter=next_q, price=new_price))
            asset.current_price = new_price
            self.session.add(asset)

        # 2. Process Credit (Interest) — quarterly accrual
        loans = self.session.exec(select(TeamLoan).where(TeamLoan.status == LoanStatus.ACTIVE)).all()
        for loan in loans:
            borrower = self.session.get(User, loan.borrower_id)
            lender = self.session.get(User, loan.lender_id)
            
            interest = loan.principal * (loan.interest_rate / 100.0) * quarter_scale
            
            if borrower.cash < interest:
                # Escalating warnings — teams are NEVER auto-frozen during the game.
                # End-of-game settlement handles actual debt recovery.
                loan.missed_quarters += 1
                missed = loan.missed_quarters
                if missed == 1:
                    state.news_feed = (
                        f"⚠️ DEBT WARNING: {borrower.username} could not make their interest payment. "
                        f"({missed} missed payment — settle outstanding debt to avoid end-of-game liquidation.)"
                    )
                elif missed == 2:
                    state.news_feed = (
                        f"🔴 FINAL WARNING: {borrower.username} has missed {missed} consecutive interest payments! "
                        f"Assets are at risk of forced liquidation at end-of-game settlement."
                    )
                else:
                    state.news_feed = (
                        f"🚨 CRITICAL DEBT ALERT: {borrower.username} has missed {missed} payments. "
                        f"Full portfolio liquidation imminent at end-of-game settlement."
                    )
                self.session.add(loan)
                # Note: borrower.is_frozen is NOT set — team keeps trading.
            else:
                borrower.cash -= interest
                lender.cash += interest
                # Reset grace period on successful payment
                if loan.missed_quarters > 0:
                    loan.missed_quarters = 0
                    self.session.add(loan)
                self.session.add(borrower)
                self.session.add(lender)


        # Run market maker bots after price updates
        self.run_bots(state, next_year, next_q)

        state.current_year = next_year
        state.current_quarter = next_q
        self.session.add(state)
        self.session.commit()

    def step_simulation(self):
        """Advance simulation by one full year (4 quarters)"""
        for _ in range(4):
            self.step_quarter()

    def trigger_recovery(self):
        """Admin-triggered: manually move market from CRASH to RECOVERY."""
        state = self.get_state()
        state.shock_stage = 'RECOVERY'
        state.news_feed = NewsCaster.get_headline(state.shock_type, 'RECOVERY')
        self.session.add(state)
        self.session.commit()

    def reset_shock(self):
        """Admin-triggered: fully reset shock state back to NORMAL."""
        state = self.get_state()
        state.shock_stage = 'NORMAL'
        state.shock_type = 'NONE'
        state.last_shock_year = None
        state.news_feed = NewsCaster.get_headline('NONE', 'NORMAL')
        self.session.add(state)
        self.session.commit()

    def set_sentiment(self, sentiment: str):
        """Admin-controlled: set investor sentiment dial."""
        if sentiment not in ('BULLISH', 'NEUTRAL', 'BEARISH'):
            raise ValueError("Invalid sentiment value")
        state = self.get_state()
        state.sentiment = sentiment
        self.session.add(state)
        self.session.commit()

    def toggle_bots(self):
        """Admin-controlled: flip market maker bots on/off."""
        state = self.get_state()
        state.bots_enabled = not state.bots_enabled
        self.session.add(state)
        self.session.commit()
        return state.bots_enabled

    def initialize_bots(self):
        """Create market maker bot accounts if they don't already exist."""
        from .auth import get_password_hash
        bot_configs = [
            ("market_maker_1", 150000.0),
            ("market_maker_2", 150000.0),
        ]
        for username, cash in bot_configs:
            existing = self.session.exec(select(User).where(User.username == username)).first()
            if not existing:
                bot = User(
                    username=username,
                    hashed_password=get_password_hash("bot_not_used_" + username),
                    role=Role.TEAM,
                    cash=cash,
                )
                self.session.add(bot)
        self.session.commit()

    def run_bots(self, state: MarketState, next_year: int, next_q: int):
        """Execute rule-based market maker bot trades. Called after price updates each quarter."""
        if not getattr(state, 'bots_enabled', False):
            return

        assets = self.session.exec(select(Asset)).all()
        asset_map = {a.ticker: a for a in assets}

        bot1 = self.session.exec(select(User).where(User.username == "market_maker_1")).first()
        bot2 = self.session.exec(select(User).where(User.username == "market_maker_2")).first()

        BOT_CASH_FLOOR = 20000.0
        MAX_HOLD = {"market_maker_1": 20, "market_maker_2": 15}

        def get_holding(user, asset):
            h = self.session.exec(select(Holding).where(Holding.user_id == user.id, Holding.asset_id == asset.id)).first()
            return h

        def bot_buy(bot, asset, qty):
            cost = asset.current_price * qty
            if bot.cash - cost < BOT_CASH_FLOOR:
                return
            bot.cash -= cost
            h = get_holding(bot, asset)
            if h:
                h.avg_cost = ((h.quantity * h.avg_cost) + cost) / (h.quantity + qty)
                h.quantity += qty
                self.session.add(h)
            else:
                self.session.add(Holding(user_id=bot.id, asset_id=asset.id, quantity=qty, avg_cost=asset.current_price))
            self.session.add(bot)
            # Small upward price nudge: 1% per unit, max 5%
            trade_impact = min(0.05, 0.01 * qty)
            asset.current_price = asset.current_price * (1 + trade_impact)
            self.session.add(asset)

        def bot_sell(bot, asset, qty):
            h = get_holding(bot, asset)
            if not h or h.quantity < qty:
                return
            proceeds = asset.current_price * qty
            bot.cash += proceeds
            h.quantity -= qty
            if h.quantity == 0:
                self.session.delete(h)
            else:
                self.session.add(h)
            self.session.add(bot)
            # Small downward price nudge: 1% per unit, max 5%
            trade_impact = min(0.05, 0.01 * qty)
            asset.current_price = asset.current_price * (1 - trade_impact)
            self.session.add(asset)

        # --- BOT 1: Value trader ---
        if bot1:
            quarter_spend_limit = bot1.cash * 0.15
            spent = 0.0
            for ticker, asset in asset_map.items():
                if ticker == 'TBILL':
                    continue
                # During CRASH: only buy GOLD (safe-haven)
                if state.shock_stage == 'CRASH' and ticker != 'GOLD':
                    continue
                discount = (asset.base_price - asset.current_price) / asset.base_price
                h = get_holding(bot1, asset)
                held_qty = h.quantity if h else 0
                if discount > 0.12 and held_qty < MAX_HOLD["market_maker_1"]:
                    qty = random.randint(5, 8)
                    qty = min(qty, MAX_HOLD["market_maker_1"] - held_qty)
                    cost = asset.current_price * qty
                    if spent + cost <= quarter_spend_limit:
                        bot_buy(bot1, asset, qty)
                        spent += cost
                elif discount < -0.18 and held_qty > 0:
                    qty = min(random.randint(3, 5), held_qty)
                    bot_sell(bot1, asset, qty)

        # --- BOT 2: Contrarian / momentum trader ---
        if bot2:
            for ticker, asset in asset_map.items():
                if ticker == 'TBILL':
                    continue
                prev_entries = self.session.exec(
                    select(PriceHistory)
                    .where(PriceHistory.asset_id == asset.id)
                    .order_by(PriceHistory.id.desc())
                    .limit(2)
                ).all()
                if len(prev_entries) < 2 or prev_entries[1].price <= 0:
                    continue
                last_return = (prev_entries[0].price - prev_entries[1].price) / prev_entries[1].price
                h = get_holding(bot2, asset)
                held_qty = h.quantity if h else 0
                if last_return < -0.08 and state.shock_stage != 'CRASH' and held_qty < MAX_HOLD["market_maker_2"]:
                    qty = random.randint(3, 5)
                    qty = min(qty, MAX_HOLD["market_maker_2"] - held_qty)
                    bot_buy(bot2, asset, qty)
                elif last_return > 0.12 and held_qty > 0:
                    qty = min(random.randint(2, 3), held_qty)
                    bot_sell(bot2, asset, qty)

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
        'GOLD':  [(5, 1.0), (10, 1.0), (15, 1.0), (20, 1.05)],   # 4 lots, last lot premium
        'NVDA':  [(25, 1.0), (50, 1.0), (75, 1.0), (100, 1.05)],  # 4 lots
        'BRENT': [(50, 1.0), (100, 1.0), (150, 1.0), (200, 1.05)],# 4 lots
        'REITS': [(3, 1.0), (5, 1.0), (8, 1.0), (10, 1.05)],      # 4 lots
        # TBILL is NOT auctioned — players buy at face value
    }
    
    def create_auction_lots(self, ticker: str):
        """Create multiple lots for an asset auction, preserving already-sold lots."""
        asset = self.session.exec(select(Asset).where(Asset.ticker == ticker)).first()
        if not asset:
            raise ValueError(f"Asset {ticker} not found")

        # Keep SOLD lots intact — only clear unsold ones (PENDING, ACTIVE, CANCELLED)
        old_lots = self.session.exec(
            select(AuctionLot).where(
                AuctionLot.asset_ticker == ticker,
                AuctionLot.seller_id.is_(None),  # Only admin-created lots
            )
        ).all()
        sold_lot_numbers = set()
        for lot in old_lots:
            if lot.status == LotStatus.SOLD:
                sold_lot_numbers.add(lot.lot_number)
            else:
                # Delete orphaned bids for this lot before deleting the lot
                old_bids = self.session.exec(
                    select(AuctionBid).where(AuctionBid.lot_id == lot.id)
                ).all()
                for bid in old_bids:
                    self.session.delete(bid)
                self.session.delete(lot)

        # Build lot config — prefer admin-configured per-lot layout, fall back to LOT_CONFIGS
        state = self.session.exec(select(MarketState)).first()
        custom = (state.auction_config or {}).get(ticker) if state else None
        if custom and "lots" in custom:
            lot_config = [(int(u), 1.0) for u in custom["lots"]]
        elif custom and "num_lots" in custom:
            num_lots = int(custom.get("num_lots", 4))
            units = int(custom.get("units_per_lot", 10))
            premium = float(custom.get("last_lot_premium", 1.0))
            lot_config = [(units, 1.0)] * (num_lots - 1) + [(units, premium)]
        else:
            lot_config = self.LOT_CONFIGS.get(ticker, [(10, 1.0)])

        # Only create lots whose number hasn't already been sold
        first_unsold = True
        for lot_num, (quantity, price_mult) in enumerate(lot_config, 1):
            if lot_num in sold_lot_numbers:
                continue  # Already auctioned — skip
            lot = AuctionLot(
                asset_ticker=ticker,
                lot_number=lot_num,
                quantity=quantity,
                base_price=asset.base_price * price_mult,
                status=LotStatus.ACTIVE if first_unsold else LotStatus.PENDING
            )
            self.session.add(lot)
            first_unsold = False

        self.session.commit()
    
    def start_auction(self, ticker: str):
        """Start auction with multiple lots. Raises if all lots already sold."""
        # Check if all configured lots are already sold before switching phase
        asset = self.session.exec(select(Asset).where(Asset.ticker == ticker)).first()
        if not asset:
            raise ValueError(f"Asset {ticker} not found")

        # Pre-check: count sold lots vs total configured lots
        sold_count = len(self.session.exec(
            select(AuctionLot).where(
                AuctionLot.asset_ticker == ticker,
                AuctionLot.seller_id.is_(None),
                AuctionLot.status == LotStatus.SOLD,
            )
        ).all())

        state_obj = self.session.exec(select(MarketState)).first()
        custom = (state_obj.auction_config or {}).get(ticker) if state_obj else None
        if custom and "lots" in custom:
            total_lots = len(custom["lots"])
        elif custom and "num_lots" in custom:
            total_lots = int(custom.get("num_lots", 4))
        else:
            total_lots = len(self.LOT_CONFIGS.get(ticker, [(10, 1.0)]))

        if sold_count >= total_lots:
            raise ValueError(f"All {total_lots} lots for {ticker} have already been auctioned. Reconfigure lots to auction more.")

        state = self.get_state()
        state.phase = "AUCTION"
        state.active_auction_asset = ticker
        self.session.add(state)

        self.create_auction_lots(ticker)
        self.session.commit()
    
    def place_bid(self, user: User, lot_id: int, amount: float):
        """Place a bid on a specific lot"""
        from .models import AuctionLot
        lot = self.session.get(AuctionLot, lot_id)
        if not lot:
            raise ValueError("Lot not found")

        # Admin-created lots (no seller_id) require an active auction for that asset.
        # Secondary lots (seller_id set) are always-open — no active auction needed.
        if not lot.seller_id:
            state = self.get_state()
            ticker = state.active_auction_asset
            if not ticker:
                raise ValueError("No active auction")
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
            asset_ticker=lot.asset_ticker,
            lot_id=lot_id,
            amount=amount,
            quantity=lot.quantity
        )
        self.session.add(bid)
        self.session.commit()
    
    def resolve_auction(self):
        """Close (hammer down) the active lot only — does NOT auto-advance. Admin calls open_next_lot separately."""
        state = self.get_state()
        ticker = state.active_auction_asset
        if not ticker:
            return "No active auction"
        
        asset = self.session.exec(select(Asset).where(Asset.ticker == ticker)).first()
        if not asset:
            return "Asset not found"
        
        # Get the currently ACTIVE admin-created lot (seller_id is None)
        active_lot = self.session.exec(
            select(AuctionLot).where(
                AuctionLot.asset_ticker == ticker,
                AuctionLot.status == LotStatus.ACTIVE,
                AuctionLot.seller_id.is_(None),
            )
        ).first()

        if not active_lot:
            return "No active lot to resolve"
        
        # --- Resolve lot with bids ---
        bids = self.session.exec(
            select(AuctionBid).where(
                AuctionBid.lot_id == active_lot.id
            ).order_by(AuctionBid.amount.desc())
        ).all()
        
        if bids:
            winner_bid = bids[0]
            winner = self.session.get(User, winner_bid.user_id)
            total_cost = winner_bid.amount * winner_bid.quantity
            
            if winner.cash >= total_cost:
                winner.cash -= total_cost
                
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
                
                # User-created listing: pay seller (minus fee)
                if active_lot.seller_id:
                    seller = self.session.get(User, active_lot.seller_id)
                    if seller:
                        revenue = total_cost
                        # Fall back to base_price (reserve price) if no cost basis recorded
                        cost_per_unit = active_lot.seller_cost_basis if active_lot.seller_cost_basis is not None else active_lot.base_price
                        cost_basis = cost_per_unit * active_lot.quantity
                        capital_gain = revenue - cost_basis
                        fee = capital_gain * 0.20 if capital_gain > 0 else 500.0
                        net_payout = revenue - fee
                        seller.cash += net_payout
                        self.session.add(seller)
                        results_msg = f"Lot {active_lot.lot_number} SOLD to {winner.username} @ ${winner_bid.amount:,.0f} (Seller payout: ${net_payout:,.0f} after fees)"
                    else:
                        results_msg = f"Lot {active_lot.lot_number} SOLD to {winner.username} @ ${winner_bid.amount:,.0f}"
                else:
                    results_msg = f"Lot {active_lot.lot_number} SOLD to {winner.username} @ ${winner_bid.amount:,.0f}"
                
                active_lot.status = LotStatus.SOLD
                active_lot.winner_id = winner.id
                active_lot.winning_bid = winner_bid.amount
                self.session.add(winner)
                self.session.add(active_lot)
                
                # Small price nudge proportional to bid premium over base price (was 30% blend)
                if active_lot.base_price > 0:
                    premium = max(0.0, winner_bid.amount - active_lot.base_price) / active_lot.base_price
                    nudge = min(0.04, premium * 0.08)
                else:
                    nudge = 0.01
                asset.current_price = asset.current_price * (1 + nudge)
                self.session.add(asset)
            else:
                active_lot.status = LotStatus.CANCELLED
                self.session.add(active_lot)
                results_msg = f"Lot {active_lot.lot_number} CANCELLED (Winner had insufficient funds)"
                
                if active_lot.seller_id:
                    seller_holding = self.session.exec(select(Holding).where(
                        Holding.user_id == active_lot.seller_id,
                        Holding.asset_id == asset.id
                    )).first()
                    if seller_holding:
                        seller_holding.quantity += active_lot.quantity
                        self.session.add(seller_holding)
                    else:
                        seller_holding = Holding(user_id=active_lot.seller_id, asset_id=asset.id, quantity=active_lot.quantity, avg_cost=active_lot.seller_cost_basis or 0.0)
                        self.session.add(seller_holding)
        else:
            active_lot.status = LotStatus.CANCELLED
            self.session.add(active_lot)
            results_msg = f"Lot {active_lot.lot_number} CLOSED (No bids)"
            
            if active_lot.seller_id:
                seller_holding = self.session.exec(select(Holding).where(
                    Holding.user_id == active_lot.seller_id,
                    Holding.asset_id == asset.id
                )).first()
                if seller_holding:
                    seller_holding.quantity += active_lot.quantity
                    self.session.add(seller_holding)
                else:
                    seller_holding = Holding(user_id=active_lot.seller_id, asset_id=asset.id, quantity=active_lot.quantity, avg_cost=active_lot.seller_cost_basis or 0.0)
                    self.session.add(seller_holding)
        
        # Do NOT auto-advance. Admin must call open_next_lot or end_auction manually.
        self.session.commit()
        
        # Check if there are more admin-created pending lots so frontend can show the button
        pending_lots = self.session.exec(
            select(AuctionLot).where(
                AuctionLot.asset_ticker == ticker,
                AuctionLot.status == LotStatus.PENDING,
                AuctionLot.seller_id.is_(None),
                AuctionLot.lot_number > active_lot.lot_number
            )
        ).all()
        has_next = len(pending_lots) > 0
        return {"message": results_msg, "has_next_lot": has_next, "lots_remaining": len(pending_lots)}

    def resolve_secondary_lot(self, lot_id: int):
        """Resolve a specific user-listed secondary lot by ID (admin action)."""
        from .models import AuctionLot
        lot = self.session.get(AuctionLot, lot_id)
        if not lot:
            return {"error": "Lot not found"}
        if not lot.seller_id:
            return {"error": "Not a secondary lot — use resolve_auction() for admin lots"}
        if lot.status != LotStatus.ACTIVE:
            return {"error": f"Lot is not active (status: {lot.status.value})"}

        asset = self.session.exec(select(Asset).where(Asset.ticker == lot.asset_ticker)).first()
        if not asset:
            return {"error": "Asset not found"}

        bids = self.session.exec(
            select(AuctionBid).where(AuctionBid.lot_id == lot.id).order_by(AuctionBid.amount.desc())
        ).all()

        if bids:
            winner_bid = bids[0]
            winner = self.session.get(User, winner_bid.user_id)
            total_cost = winner_bid.amount * winner_bid.quantity

            if winner.cash >= total_cost:
                winner.cash -= total_cost

                holding = self.session.exec(select(Holding).where(
                    Holding.user_id == winner.id, Holding.asset_id == asset.id
                )).first()
                if holding:
                    total_val = (holding.quantity * holding.avg_cost) + total_cost
                    new_qty = holding.quantity + winner_bid.quantity
                    holding.avg_cost = total_val / new_qty
                    holding.quantity = new_qty
                    self.session.add(holding)
                else:
                    holding = Holding(user_id=winner.id, asset_id=asset.id, quantity=winner_bid.quantity, avg_cost=winner_bid.amount)
                    self.session.add(holding)

                seller = self.session.get(User, lot.seller_id)
                if seller:
                    revenue = total_cost
                    cost_per_unit = lot.seller_cost_basis if lot.seller_cost_basis is not None else lot.base_price
                    cost_basis = cost_per_unit * lot.quantity
                    capital_gain = revenue - cost_basis
                    fee = capital_gain * 0.20 if capital_gain > 0 else 500.0
                    net_payout = revenue - fee
                    seller.cash += net_payout
                    self.session.add(seller)
                    results_msg = f"Lot {lot.lot_number} SOLD to {winner.username} @ ${winner_bid.amount:,.0f} (Seller payout: ${net_payout:,.0f} after fees)"
                else:
                    results_msg = f"Lot {lot.lot_number} SOLD to {winner.username} @ ${winner_bid.amount:,.0f}"

                lot.status = LotStatus.SOLD
                lot.winner_id = winner.id
                lot.winning_bid = winner_bid.amount
                self.session.add(winner)
                self.session.add(lot)

                # Small price nudge proportional to bid premium over base price
                if lot.base_price > 0:
                    premium = max(0.0, winner_bid.amount - lot.base_price) / lot.base_price
                    nudge = min(0.04, premium * 0.08)
                else:
                    nudge = 0.01
                asset.current_price = asset.current_price * (1 + nudge)
                self.session.add(asset)
            else:
                lot.status = LotStatus.CANCELLED
                self.session.add(lot)
                results_msg = f"Lot {lot.lot_number} CANCELLED (Winner had insufficient funds)"
                self._refund_secondary_lot_asset(lot, asset)
        else:
            lot.status = LotStatus.CANCELLED
            self.session.add(lot)
            results_msg = f"Lot {lot.lot_number} CLOSED (No bids)"
            self._refund_secondary_lot_asset(lot, asset)

        self.session.commit()
        return {"message": results_msg, "status": lot.status.value}

    def _refund_secondary_lot_asset(self, lot, asset):
        """Return escrowed asset back to seller when a secondary lot is cancelled/no-bid."""
        seller_holding = self.session.exec(select(Holding).where(
            Holding.user_id == lot.seller_id, Holding.asset_id == asset.id
        )).first()
        if seller_holding:
            seller_holding.quantity += lot.quantity
            self.session.add(seller_holding)
        else:
            self.session.add(Holding(
                user_id=lot.seller_id,
                asset_id=asset.id,
                quantity=lot.quantity,
                avg_cost=lot.seller_cost_basis or 0.0
            ))

    def open_next_lot(self):
        """Admin-controlled: open the next PENDING lot for bidding."""
        state = self.get_state()
        ticker = state.active_auction_asset
        if not ticker:
            return {"message": "No active auction", "opened": False}

        # Make sure there's no already-active admin-created lot
        already_active = self.session.exec(
            select(AuctionLot).where(
                AuctionLot.asset_ticker == ticker,
                AuctionLot.status == LotStatus.ACTIVE,
                AuctionLot.seller_id.is_(None),
            )
        ).first()
        if already_active:
            return {"message": f"Lot {already_active.lot_number} is still open for bidding. Hammer it down first.", "opened": False}

        next_lot = self.session.exec(
            select(AuctionLot).where(
                AuctionLot.asset_ticker == ticker,
                AuctionLot.status == LotStatus.PENDING,
                AuctionLot.seller_id.is_(None),
            ).order_by(AuctionLot.lot_number)
        ).first()

        if not next_lot:
            return {"message": "No more pending lots. Use End Auction to close.", "opened": False}

        next_lot.status = LotStatus.ACTIVE
        self.session.add(next_lot)
        self.session.commit()
        return {"message": f"Lot {next_lot.lot_number} is now open for bidding!", "opened": True, "lot_number": next_lot.lot_number}

    def end_auction(self):
        """Admin-controlled: close the auction entirely after all lots are done."""
        state = self.get_state()
        ticker = state.active_auction_asset
        state.active_auction_asset = None
        state.phase = "TRADING"
        self.session.add(state)

        # Cancel any remaining PENDING/ACTIVE admin-created lots so they aren't re-auctioned
        if ticker:
            remaining = self.session.exec(
                select(AuctionLot).where(
                    AuctionLot.asset_ticker == ticker,
                    AuctionLot.seller_id.is_(None),
                    AuctionLot.status.in_([LotStatus.PENDING, LotStatus.ACTIVE]),
                )
            ).all()
            for lot in remaining:
                lot.status = LotStatus.CANCELLED
                self.session.add(lot)

        self.session.commit()
        return {"message": "Auction ended. Market returned to TRADING phase."}

    # --- TRADING LOGIC ---
    def execute_trade(self, buyer_id: int, seller_id: int, asset_id: int, qty: int, price: float):
        if buyer_id == seller_id:
            raise ValueError("Self-trade not allowed")
        if qty <= 0:
            raise ValueError("Quantity must be positive")
        if price <= 0:
            raise ValueError("Price must be positive")
        state = self.session.exec(select(MarketState)).first()
        if state and state.phase == "FINISHED":
            raise ValueError("Trading has ended")
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
            
        # B — Volume-weighted sqrt price impact: large trades move price convexly (real-world slippage)
        asset = self.session.get(Asset, asset_id)
        trade_impact = min(0.30, 0.05 * math.sqrt(qty))
        asset.current_price = ((1 - trade_impact) * asset.current_price) + (trade_impact * price)
        self.session.add(asset)
        
        self.session.add(buyer)
        self.session.add(seller)
        self.session.commit()

    def place_order(self, user_id: int, asset_id: int, order_type: OrderType, quantity: int, price: float):
        """Place a limit order and attempt immediate matching against resting orders."""
        state = self.session.exec(select(MarketState)).first()
        if state and state.phase == "FINISHED":
            raise ValueError("Trading has ended")

        user = self.session.get(User, user_id)
        if not user:
            raise ValueError("User not found")

        if order_type == OrderType.BUY:
            if user.cash < quantity * price:
                raise ValueError(f"Insufficient cash. Need ${quantity * price:,.2f}, have ${user.cash:,.2f}")
        else:
            h = self.session.exec(
                select(Holding).where(Holding.user_id == user_id, Holding.asset_id == asset_id)
            ).first()
            if not h or h.quantity < quantity:
                raise ValueError("Insufficient assets to place sell order")

        # Persist the order in the book
        order = Order(user_id=user_id, asset_id=asset_id, type=order_type, price=price, quantity=quantity)
        self.session.add(order)
        self.session.commit()
        self.session.refresh(order)
        order_id = order.id

        # Attempt matching against resting opposite orders
        remaining = quantity
        if order_type == OrderType.BUY:
            candidates = self.session.exec(
                select(Order).where(
                    Order.asset_id == asset_id,
                    Order.type == OrderType.SELL,
                    Order.status == OrderStatus.OPEN,
                    Order.price <= price,
                    Order.user_id != user_id,
                ).order_by(Order.price)
            ).all()
        else:
            candidates = self.session.exec(
                select(Order).where(
                    Order.asset_id == asset_id,
                    Order.type == OrderType.BUY,
                    Order.status == OrderStatus.OPEN,
                    Order.price >= price,
                    Order.user_id != user_id,
                ).order_by(Order.price.desc())
            ).all()

        # Capture IDs before execute_trade commits (which expires in-session objects)
        candidate_ids = [(c.id, c.quantity) for c in candidates]

        for cid, cqty in candidate_ids:
            if remaining <= 0:
                break
            fill_qty = min(remaining, cqty)
            candidate = self.session.get(Order, cid)
            if not candidate or candidate.status != OrderStatus.OPEN:
                continue
            fill_price = candidate.price
            buyer_id = user_id if order_type == OrderType.BUY else candidate.user_id
            seller_id = candidate.user_id if order_type == OrderType.BUY else user_id
            try:
                self.execute_trade(buyer_id, seller_id, asset_id, fill_qty, fill_price)
            except ValueError:
                continue
            remaining -= fill_qty
            candidate = self.session.get(Order, cid)
            if candidate:
                candidate.quantity = max(0, candidate.quantity - fill_qty)
                if candidate.quantity == 0:
                    candidate.status = OrderStatus.FILLED
                self.session.add(candidate)
                self.session.commit()

        # Update the placed order to reflect how much was filled
        placed = self.session.get(Order, order_id)
        if placed:
            placed.quantity = remaining
            if remaining <= 0:
                placed.status = OrderStatus.FILLED
            self.session.add(placed)
            self.session.commit()
