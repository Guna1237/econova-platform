"""
Admin Tools for Platform Management

Provides price manipulation, credential management, and data export functionality.
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlmodel import Session, select
from .models import Asset, AdminCredentials, User, ActivityLog, TeamLeaderInfo, ConsentRecord
from .auth import get_password_hash
import io
import csv


class AdminTools:
    """Administrative utilities for platform management"""
    
    def __init__(self, session: Session):
        self.session = session
    
    def nudge_price(
        self,
        ticker: str,
        adjustment_pct: Optional[float] = None,
        adjustment_abs: Optional[float] = None,
        admin_username: str = "admin"
    ) -> Dict[str, Any]:
        """
        Adjust asset price by percentage or absolute amount
        
        Args:
            ticker: Asset ticker symbol
            adjustment_pct: Percentage adjustment (e.g., 10 for +10%, -5 for -5%)
            adjustment_abs: Absolute adjustment amount
            admin_username: Username of admin making change
        
        Returns:
            Dict with old_price, new_price, and change details
        """
        asset = self.session.exec(
            select(Asset).where(Asset.ticker == ticker)
        ).first()
        
        if not asset:
            raise ValueError(f"Asset {ticker} not found")
        
        old_price = asset.current_price
        
        # Apply adjustment
        if adjustment_pct is not None:
            new_price = old_price * (1 + adjustment_pct / 100)
        elif adjustment_abs is not None:
            new_price = old_price + adjustment_abs
        else:
            raise ValueError("Must provide either adjustment_pct or adjustment_abs")
        
        # Apply bounds: 10% floor, 500% ceiling of base price
        min_price = asset.base_price * 0.10
        max_price = asset.base_price * 5.00
        new_price = max(min_price, min(max_price, new_price))
        
        asset.current_price = new_price
        self.session.add(asset)
        self.session.commit()
        
        return {
            "ticker": ticker,
            "old_price": old_price,
            "new_price": new_price,
            "change_pct": ((new_price - old_price) / old_price) * 100,
            "change_abs": new_price - old_price,
            "adjusted_by": admin_username,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    def change_admin_credentials(
        self,
        new_username: Optional[str] = None,
        new_password: Optional[str] = None,
        current_admin_username: str = "admin"
    ) -> Dict[str, str]:
        """
        Update admin credentials
        
        Args:
            new_username: New admin username (optional)
            new_password: New admin password (optional)
            current_admin_username: Current admin username
        
        Returns:
            Success message
        """
        # Get or create admin credentials record
        admin_cred = self.session.exec(
            select(AdminCredentials).where(
                AdminCredentials.username == current_admin_username
            )
        ).first()
        
        if not admin_cred:
            # Create initial record
            admin_cred = AdminCredentials(
                username=current_admin_username,
                hashed_password="",  # Will be updated
                changed_by=current_admin_username
            )
        
        # Update username if provided
        if new_username:
            admin_cred.username = new_username
        
        # Update password if provided
        if new_password:
            admin_cred.hashed_password = get_password_hash(new_password)
        
        admin_cred.last_changed = datetime.utcnow()
        admin_cred.changed_by = current_admin_username
        
        self.session.add(admin_cred)
        
        # Also update the User table
        admin_user = self.session.exec(
            select(User).where(User.username == current_admin_username)
        ).first()
        
        if admin_user:
            if new_username:
                admin_user.username = new_username
            if new_password:
                admin_user.hashed_password = get_password_hash(new_password)
            self.session.add(admin_user)
        
        self.session.commit()
        
        return {
            "message": "Admin credentials updated successfully",
            "username": admin_cred.username,
            "updated_at": admin_cred.last_changed.isoformat()
        }
    
    def export_activity_data_csv(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> str:
        """
        Export activity logs to CSV format
        
        Args:
            start_date: Optional start date filter
            end_date: Optional end date filter
        
        Returns:
            CSV string
        """
        query = select(ActivityLog)
        
        if start_date:
            query = query.where(ActivityLog.timestamp >= start_date)
        if end_date:
            query = query.where(ActivityLog.timestamp <= end_date)
        
        logs = self.session.exec(query.order_by(ActivityLog.timestamp)).all()
        
        # Create CSV
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            'log_id', 'user_id', 'username', 'action_type', 'timestamp',
            'duration_ms', 'action_details', 'market_year', 'market_phase',
            'shock_stage', 'shock_type', 'user_cash', 'user_debt'
        ])
        
        # Data rows
        for log in logs:
            user = self.session.get(User, log.user_id)
            username = user.username if user else "Unknown"
            
            writer.writerow([
                log.id,
                log.user_id,
                username,
                log.action_type,
                log.timestamp.isoformat(),
                log.duration_ms or '',
                str(log.action_details),
                log.context_data.get('market_year', ''),
                log.context_data.get('market_phase', ''),
                log.context_data.get('shock_stage', ''),
                log.context_data.get('shock_type', ''),
                log.context_data.get('user_cash', ''),
                log.context_data.get('user_debt', '')
            ])
        
        return output.getvalue()
    
    def export_team_info_csv(self) -> str:
        """Export team leader information to CSV"""
        teams = self.session.exec(select(TeamLeaderInfo)).all()
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow([
            'user_id', 'username', 'leader_name', 'email', 'age',
            'team_size', 'created_at', 'consented_at'
        ])
        
        for team in teams:
            user = self.session.get(User, team.user_id)
            consent = self.session.exec(
                select(ConsentRecord).where(ConsentRecord.user_id == team.user_id)
            ).first()
            
            writer.writerow([
                team.user_id,
                user.username if user else "Unknown",
                team.leader_name,
                team.email,
                team.age,
                team.team_size,
                team.created_at.isoformat(),
                consent.consented_at.isoformat() if consent else ''
            ])
        
        return output.getvalue()
    
    def get_research_summary(self) -> Dict[str, Any]:
        """Get summary statistics for research data"""
        from sqlmodel import func
        
        total_users = self.session.exec(
            select(func.count(User.id)).where(User.role == "team")
        ).first()
        
        consented_users = self.session.exec(
            select(func.count(ConsentRecord.id))
        ).first()
        
        total_actions = self.session.exec(
            select(func.count(ActivityLog.id))
        ).first()
        
        action_types = self.session.exec(
            select(ActivityLog.action_type, func.count(ActivityLog.id))
            .group_by(ActivityLog.action_type)
        ).all()
        
        return {
            "total_users": total_users or 0,
            "consented_users": consented_users or 0,
            "total_actions_logged": total_actions or 0,
            "actions_by_type": {
                action_type: count for action_type, count in action_types
            },
            "generated_at": datetime.utcnow().isoformat()
        }


def get_admin_tools(session: Session) -> AdminTools:
    """Dependency injection helper"""
    return AdminTools(session)
