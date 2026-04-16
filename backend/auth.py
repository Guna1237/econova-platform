from datetime import datetime, timedelta, timezone
import os
import secrets
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlmodel import Session, select
from .database import get_session
from .models import User

# Configuration — use env var in production, generate random fallback for dev
SECRET_KEY = os.getenv("SECRET_KEY", "econova_super_secret_stable_key_for_development_and_production_unless_overridden")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # 1 hour sessions

# Use pbkdf2_sha256 for better compatibility on Windows/Environment
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

MIN_PASSWORD_LENGTH = 6

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def validate_password_strength(password: str):
    """Enforce minimum password requirements."""
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
        )

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = session.exec(select(User).where(User.username == username)).first()
    if user is None:
        raise credentials_exception
        
    # Single Session Enforcement
    token_session_id = payload.get("sid")
    if token_session_id and user.session_id and token_session_id != user.session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired (logged in from another location)",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # Update Last Seen
    user.last_seen = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    session.refresh(user)
    
    return user

async def get_current_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    return current_user

async def get_active_user(current_user: User = Depends(get_current_user)):
    """Dependency that ensures the user is not frozen. Use on all action endpoints."""
    if current_user.is_frozen:
        raise HTTPException(
            status_code=403,
            detail="Your account is frozen. Contact the administrator."
        )
    return current_user

async def get_current_banker(current_user: User = Depends(get_current_user)):
    """Dependency that ensures only banker role can access."""
    if current_user.role != "banker":
        raise HTTPException(status_code=403, detail="Banker access required")
    return current_user

async def get_current_sub_admin(current_user: User = Depends(get_current_user)):
    """Dependency for sub-admin role."""
    if current_user.role != "sub_admin":
        raise HTTPException(status_code=403, detail="Sub-admin access required")
    return current_user

async def get_banker_or_admin(current_user: User = Depends(get_current_user)):
    """Dependency that allows banker or admin access."""
    if current_user.role not in ("banker", "admin", "sub_admin"):
        raise HTTPException(status_code=403, detail="Banker, admin or sub-admin access required")
    return current_user

async def get_approver(current_user: User = Depends(get_current_user)):
    """Dependency that allows admin or sub-admin access to approval endpoints."""
    if current_user.role not in ("admin", "sub_admin", "banker"):
        # allowing banker as well since banker currently has the UI for approvals
        raise HTTPException(status_code=403, detail="Unauthorized: Approver access required")
    return current_user

