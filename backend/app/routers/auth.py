import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import OtpCode, User
from ..schemas import LoginIn, TokenOut, UserOut
from ..security import create_token, current_user, verify_password
from ..services import ratelimit
from ..services.crypto import hash_code
from ..services.phone import normalize
from ..services.safety import notify

router = APIRouter(prefix="/auth", tags=["auth"])


class OtpRequestIn(BaseModel):
    phone: str


class OtpVerifyIn(BaseModel):
    phone: str
    code: str


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def _active_user(db: Session, phone: str) -> User | None:
    return db.scalar(select(User).where(User.phone == phone, User.active.is_(True)))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    """Phone and password. Intended for school staff, ops and demo accounts."""
    if not settings.password_login_enabled:
        raise HTTPException(403, "Password sign-in is turned off. Use an SMS code.")
    phone = normalize(body.phone)
    ratelimit.hit(f"login:{phone}", settings.login_max_attempts_per_15min, 900)
    ratelimit.hit(f"login-ip:{_client_ip(request)}", settings.login_max_attempts_per_15min * 5, 900)
    user = _active_user(db, phone)
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong phone number or password")
    return TokenOut(access_token=create_token(user), user=UserOut.model_validate(user))


@router.post("/otp/request", status_code=202)
def request_code(body: OtpRequestIn, request: Request, db: Session = Depends(get_db)):
    """Sends a 6-digit sign-in code by SMS. Always answers the same way, so it cannot be used
    to find out which phone numbers are registered."""
    phone = normalize(body.phone)
    ratelimit.hit(f"otp-req:{phone}", settings.otp_max_requests_per_10min, 600)
    ratelimit.hit(f"otp-req-ip:{_client_ip(request)}", settings.otp_max_requests_per_10min * 10, 600)
    if _active_user(db, phone) is not None:
        for old in db.scalars(select(OtpCode).where(OtpCode.phone == phone, OtpCode.used.is_(False))):
            old.used = True
        code = f"{secrets.randbelow(1_000_000):06d}"
        db.add(OtpCode(phone=phone, code_hash=hash_code(phone, code),
                       expires_at=datetime.now(UTC) + timedelta(minutes=settings.otp_ttl_minutes)))
        notify(db, phone, f"Your LittleGo code is {code}. It expires in {settings.otp_ttl_minutes} minutes. "
                          "Never share it, even with LittleGo staff.")
        db.commit()
    return {"detail": "If this number is registered, a code has been sent."}


@router.post("/otp/verify", response_model=TokenOut)
def verify_code(body: OtpVerifyIn, db: Session = Depends(get_db)):
    phone = normalize(body.phone)
    otp = db.scalar(select(OtpCode).where(OtpCode.phone == phone, OtpCode.used.is_(False))
                    .order_by(OtpCode.created_at.desc()))
    expires = otp.expires_at.replace(tzinfo=UTC) if otp and otp.expires_at.tzinfo is None else (otp.expires_at if otp else None)
    if otp is None or expires < datetime.now(UTC):
        raise HTTPException(401, "Code expired or not found. Request a new one.")
    if otp.attempts >= settings.otp_max_attempts:
        raise HTTPException(429, "Too many wrong codes. Request a new one.")
    if not secrets.compare_digest(otp.code_hash, hash_code(phone, body.code.strip())):
        otp.attempts += 1
        db.commit()
        raise HTTPException(401, "Wrong code")
    otp.used = True
    user = _active_user(db, phone)
    if user is None:
        raise HTTPException(401, "Account not active")
    db.commit()
    return TokenOut(access_token=create_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user
