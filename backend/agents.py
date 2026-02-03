import random
from typing import List, Optional
from sqlmodel import Session, select
from .models import Asset, MarketState, Order, OrderType, User, Role
from .engine import MarketEngine

class BaseAgent:
    def __init__(self, session: Session, agent_user: User):
        self.session = session
        self.user = agent_user
        self.engine = MarketEngine(session)

    def act(self):
        raise NotImplementedError

class MarketParticipant(BaseAgent):
    """
    Simulates a trading team. 
    Strategy: Trend Follower / Macro Reactive
    """
    def act(self):
        state = self.engine.get_market_state()
        assets = self.session.exec(select(Asset)).all()
        
        for asset in assets:
            # Simple Logic:
            # If Bubble -> Buy Risky (High Volatility)
            # If Recession -> Sell Risky, Buy Safe (Low Volatility)
            
            decision = random.random()
            
            if state.macro_trend == "bubble":
                if asset.volatility > 0.1 and decision < 0.3: # Aggressive Buy
                    self._place_trade(asset, OrderType.BUY)
                elif asset.volatility < 0.1 and decision < 0.1: # Sell safe assets to fuel greed
                    self._place_trade(asset, OrderType.SELL)
                    
            elif state.macro_trend == "recession":
                if asset.volatility > 0.1 and decision < 0.4: # Panic Sell
                    self._place_trade(asset, OrderType.SELL)
                elif asset.volatility < 0.1 and decision < 0.2: # Buy Safe Haven
                    self._place_trade(asset, OrderType.BUY)
            
            else: # Stable
                # Random noise trading
                if decision < 0.05:
                     self._place_trade(asset, random.choice([OrderType.BUY, OrderType.SELL]))

    def _place_trade(self, asset: Asset, side: OrderType):
        # Determine quantity based on cash/holdings (Simplified)
        qty = random.randint(1, 100)
        
        # Price: Market Order ish (Use current price +/- spread)
        price = asset.current_price
        
        try:
            self.engine.place_order(
                user_id=self.user.id,
                asset_id=asset.id,
                order_type=side,
                quantity=qty,
                price=price
            )
            print(f"[Agent {self.user.username}] Placed {side} {qty} {asset.ticker} @ {price}")
        except ValueError:
            # Insufficient funds etc.
            pass

class MacroAnalyst(BaseAgent):
    """
    Generates narrative news based on market state.
    """
    def act(self) -> str:
        state = self.engine.get_market_state()
        # In a real system, this would call an LLM with context.
        # Here we use templates.
        
        templates = {
            "stable": [
                "Markets remain steady as investors await new data.",
                "Volatility is low; quiet trading session expected.",
                "Analysts predict steady growth across most sectors."
            ],
            "bubble": [
                "EUPHORIA! Markets hit new highs!",
                "Are valuations stretched? Greed index hits 90.",
                "Tech sector rallies hard; caution advised?"
            ],
            "recession": [
                "PANIC! Markets tumble on weak economic data.",
                "Investors flee to safety; Bonds rally.",
                "Recession fears loom large as liquidity dries up."
            ],
            "recovery": [
                "Green shoots? Signs of recovery emerging.",
                "Bargain hunters step in after the crash.",
                "Stability returning to main indices."
            ]
        }
        
        news = random.choice(templates.get(state.macro_trend, ["Markets are open."]))
        
        # Update state with new news
        state.news_flash = news
        self.session.add(state)
        self.session.commit()
        return news
