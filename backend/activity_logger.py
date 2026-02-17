"""
Activity Logger Service for Research Data Collection

Tracks all user actions, decisions, and behavioral patterns with comprehensive context.
"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlmodel import Session
from .models import ActivityLog, User, MarketState, Asset
import uuid


class ActivityLogger:
    """Centralized service for logging user activities for research purposes"""
    
    def __init__(self, session: Session):
        self.session = session
    
    def log_action(
        self,
        user_id: int,
        action_type: str,
        action_details: Dict[str, Any],
        duration_ms: Optional[int] = None,
        session_id: Optional[str] = None
    ) -> ActivityLog:
        """
        Log a user action with full context
        
        Args:
            user_id: ID of the user performing the action
            action_type: Type of action (BID, TRADE, LOAN_OFFER, etc.)
            action_details: Specific details about the action
            duration_ms: Time spent on this decision (milliseconds)
            session_id: Browser session identifier
        
        Returns:
            Created ActivityLog record
        """
        # Capture market context
        context_data = self._get_context_data(user_id)
        
        log_entry = ActivityLog(
            user_id=user_id,
            action_type=action_type,
            action_details=action_details,
            timestamp=datetime.now(timezone.utc),
            duration_ms=duration_ms,
            context_data=context_data,
            session_id=session_id
        )
        
        self.session.add(log_entry)
        self.session.commit()
        self.session.refresh(log_entry)
        
        return log_entry
    
    def _get_context_data(self, user_id: int) -> Dict[str, Any]:
        """Capture current market state and user portfolio context"""
        context = {}
        
        # Get market state
        from sqlmodel import select
        market_state = self.session.exec(select(MarketState)).first()
        if market_state:
            context['market_year'] = market_state.current_year
            context['market_phase'] = market_state.phase
            context['shock_stage'] = market_state.shock_stage
            context['shock_type'] = market_state.shock_type
        
        # Get user state
        user = self.session.get(User, user_id)
        if user:
            context['user_cash'] = user.cash
            context['user_debt'] = user.debt
            context['user_frozen'] = user.is_frozen
        
        # Get current asset prices
        assets = self.session.exec(select(Asset)).all()
        context['asset_prices'] = {
            asset.ticker: asset.current_price 
            for asset in assets
        }
        
        return context
    
    # Convenience methods for common actions
    
    def log_bid(self, user_id: int, asset_ticker: str, lot_id: Optional[int], 
                amount: float, quantity: int, duration_ms: Optional[int] = None):
        """Log an auction bid"""
        return self.log_action(
            user_id=user_id,
            action_type="BID",
            action_details={
                "asset_ticker": asset_ticker,
                "lot_id": lot_id,
                "bid_amount": amount,
                "quantity": quantity
            },
            duration_ms=duration_ms
        )
    
    def log_trade(self, user_id: int, asset_id: int, order_type: str, 
                  quantity: int, price: float, duration_ms: Optional[int] = None):
        """Log a trade order"""
        return self.log_action(
            user_id=user_id,
            action_type="TRADE",
            action_details={
                "asset_id": asset_id,
                "order_type": order_type,
                "quantity": quantity,
                "price": price
            },
            duration_ms=duration_ms
        )
    
    def log_loan_offer(self, lender_id: int, borrower_username: str, 
                       principal: float, interest_rate: float, 
                       duration_ms: Optional[int] = None):
        """Log a loan offer"""
        return self.log_action(
            user_id=lender_id,
            action_type="LOAN_OFFER",
            action_details={
                "borrower_username": borrower_username,
                "principal": principal,
                "interest_rate": interest_rate
            },
            duration_ms=duration_ms
        )
    
    def log_loan_accept(self, borrower_id: int, loan_id: int, 
                        duration_ms: Optional[int] = None):
        """Log loan acceptance"""
        return self.log_action(
            user_id=borrower_id,
            action_type="LOAN_ACCEPT",
            action_details={"loan_id": loan_id},
            duration_ms=duration_ms
        )
    
    def log_loan_repay(self, borrower_id: int, loan_id: int, amount: float,
                       duration_ms: Optional[int] = None):
        """Log loan repayment"""
        return self.log_action(
            user_id=borrower_id,
            action_type="LOAN_REPAY",
            action_details={
                "loan_id": loan_id,
                "amount": amount
            },
            duration_ms=duration_ms
        )
    
    def log_view(self, user_id: int, view_type: str, 
                 view_details: Optional[Dict[str, Any]] = None):
        """Log page/component views"""
        return self.log_action(
            user_id=user_id,
            action_type="VIEW",
            action_details={
                "view_type": view_type,
                **(view_details or {})
            }
        )
    
    def log_strategy_decision(self, user_id: int, decision_type: str,
                             decision_details: Dict[str, Any],
                             duration_ms: Optional[int] = None):
        """Log strategic decisions for behavioral analysis"""
        return self.log_action(
            user_id=user_id,
            action_type="STRATEGY_DECISION",
            action_details={
                "decision_type": decision_type,
                **decision_details
            },
            duration_ms=duration_ms
        )


def get_activity_logger(session: Session) -> ActivityLogger:
    """Dependency injection helper"""
    return ActivityLogger(session)
