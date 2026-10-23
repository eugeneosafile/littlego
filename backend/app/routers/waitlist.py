"""Early-access waitlist for the littlego.ng website.

Public:  POST /public/waitlist      (no sign-in; called by the website form)
Ops:     GET  /ops/waitlist          sign-ups, newest first, with counts by area and journey
         GET  /ops/waitlist.csv      the same as a spreadsheet download

Replies to the website:
  201 {"ok": true}                        saved, or already on the list (same reply, so the
                                          endpoint can't be used to check who has signed up)
  422 {"message": ..., "errors": {...}}   keys match the form's field names
  429 {"detail": ...}                     too many attempts from one address
"""
import csv
import hashlib
import io
import re
from collections import Counter
from typing import Literal

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Role, User, WaitlistSignup, now
from ..security import require
from ..services import ratelimit
from .auth import _client_ip

public = APIRouter(prefix="/public", tags=["website"])
ops = APIRouter(prefix="/ops", tags=["ops centre"])
Ops = Depends(require(Role.ops))

Area = Literal[
    "lagos_lekki_ajah", "lagos_vi_ikoyi", "lagos_ikeja", "lagos_gbagada_magodo",
    "lagos_yaba_surulere", "lagos_festac_amuwo", "lagos_ikorodu", "lagos_alimosho",
    "lagos_other", "abuja", "port_harcourt", "ibadan", "other_nigeria", "outside_nigeria",
]
Journey = Literal["school", "lessons", "sports_clubs", "other"]
StartWindow = Literal["asap", "next_term", "within_6_months", "later"]

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
MIN_FILL_MS = 1500  # a person can't fill the form faster than this; bots can

FRIENDLY = {
    "full_name": "Please enter your full name.",
    "email": "Please enter a valid email address.",
    "phone": "Please enter a valid phone number.",
    "area": "Please choose the area you live in.",
    "journeys": "Please choose at least one type of journey.",
    "start_window": "Please choose an option from the list.",
    "consent": "Please agree to receive launch updates.",
}


class WaitlistIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: str = Field(max_length=254)
    phone: str | None = Field(default=None, max_length=20)
    area: Area
    journeys: list[Journey] = Field(min_length=1, max_length=4)
    start_window: StartWindow | None = None
    consent: bool
    consent_text: str = Field(max_length=400)
    source: str | None = Field(default=None, max_length=80)
    utm_source: str | None = Field(default=None, max_length=80)
    utm_medium: str | None = Field(default=None, max_length=80)
    utm_campaign: str | None = Field(default=None, max_length=80)
    website: str = ""   # honeypot: hidden from people, must stay empty
    elapsed_ms: int = 0

    @field_validator("full_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("too short")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("invalid email")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        if not v:
            return None
        cleaned = "".join(ch for ch in v if ch.isdigit() or ch == "+")
        digits = cleaned.lstrip("+")
        if not digits.isdigit() or not 8 <= len(digits) <= 15:
            raise ValueError("invalid phone")
        return cleaned

    @field_validator("consent")
    @classmethod
    def _consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("consent required")
        return v

    @field_validator("journeys")
    @classmethod
    def _dedupe(cls, v: list) -> list:
        return list(dict.fromkeys(v))


def _hash_ip(ip: str) -> str:
    salt = settings.waitlist_ip_salt or settings.jwt_secret
    return hashlib.sha256(f"{salt}:{ip}".encode()).hexdigest()


@public.post("/waitlist", status_code=201)
async def join_waitlist(request: Request, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    ratelimit.hit(f"waitlist-ip:{ip}", settings.waitlist_max_per_ip_10min, 600)

    try:
        raw = await request.json()
    except Exception:
        raw = None
    if not isinstance(raw, dict):
        return JSONResponse(status_code=422, content={"message": "Invalid request.", "errors": {}})

    try:
        data = WaitlistIn.model_validate(raw)
    except ValidationError as exc:
        errors: dict[str, str] = {}
        for err in exc.errors():
            field = str(err["loc"][0]) if err["loc"] else "form"
            errors.setdefault(field, FRIENDLY.get(field, "Please check this field."))
        return JSONResponse(status_code=422, content={"message": "Some details need another look.", "errors": errors})

    # Bots get a normal-looking reply so they don't adapt, but nothing is stored.
    if data.website or data.elapsed_ms < MIN_FILL_MS:
        return {"ok": True}

    ts = now()
    fields = dict(
        full_name=data.full_name, phone=data.phone, area=data.area, journeys=",".join(data.journeys),
        start_window=data.start_window, consent_text=data.consent_text, consent_at=ts,
        source=data.source, utm_source=data.utm_source, utm_medium=data.utm_medium,
        utm_campaign=data.utm_campaign, ip_hash=_hash_ip(ip), updated_at=ts, unsubscribed_at=None,
    )
    existing = db.scalar(select(WaitlistSignup).where(WaitlistSignup.email == data.email))
    if existing:
        for k, v in fields.items():
            setattr(existing, k, v)
    else:
        db.add(WaitlistSignup(email=data.email, created_at=ts, **fields))
    db.commit()
    return {"ok": True}


def _rows(db: Session) -> list[WaitlistSignup]:
    return list(db.scalars(select(WaitlistSignup).order_by(WaitlistSignup.created_at.desc())))


@ops.get("/waitlist")
def list_waitlist(db: Session = Depends(get_db), _: User = Ops):
    rows = _rows(db)
    active = [r for r in rows if r.unsubscribed_at is None]
    return {
        "total": len(active),
        "by_area": dict(Counter(r.area for r in active).most_common()),
        "by_journey": dict(Counter(j for r in active for j in r.journeys.split(",")).most_common()),
        "signups": [
            {
                "id": r.id, "full_name": r.full_name, "email": r.email, "phone": r.phone, "area": r.area,
                "journeys": r.journeys.split(","), "start_window": r.start_window,
                "utm_source": r.utm_source, "created_at": r.created_at.isoformat(),
                "unsubscribed": r.unsubscribed_at is not None,
            }
            for r in rows
        ],
    }


@ops.get("/waitlist.csv")
def export_waitlist(db: Session = Depends(get_db), _: User = Ops):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["created_at", "full_name", "email", "phone", "area", "journeys", "start_window",
                "utm_source", "utm_medium", "utm_campaign", "unsubscribed"])
    for r in _rows(db):
        w.writerow([r.created_at.isoformat(), r.full_name, r.email, r.phone or "", r.area, r.journeys,
                    r.start_window or "", r.utm_source or "", r.utm_medium or "", r.utm_campaign or "",
                    "yes" if r.unsubscribed_at else ""])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="littlego-waitlist.csv"'})
