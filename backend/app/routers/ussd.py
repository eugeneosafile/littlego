"""USSD status check for parents without data or a smartphone (Africa's Talking USSD callback).

Point your USSD service code's callback URL at https://<your-api>/ussd. Africa's Talking posts
form fields sessionId, serviceCode, phoneNumber and text; replies start with CON (continue) or END.
"""
from fastapi import APIRouter, Depends, Form
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Child, Role, Trip, TripChild, User
from ..services.phone import normalize
from .common import today

router = APIRouter(tags=["ussd"])

LABEL = {"scheduled": "in school", "released": "released to LittleGo", "on_board": "on board",
         "handed_over": "handed over at home", "at_safe_hub": "at the safe hub", "absent": "absent"}


@router.post("/ussd", response_class=PlainTextResponse)
def ussd(phoneNumber: str = Form(...), text: str = Form(""), sessionId: str = Form(""),
         serviceCode: str = Form(""), db: Session = Depends(get_db)):
    try:
        phone = normalize(phoneNumber)
    except Exception:
        return "END Sorry, we could not read your number."
    parent = db.scalar(select(User).where(User.phone == phone, User.role == Role.parent, User.active.is_(True)))
    if parent is None:
        return "END This number is not registered with LittleGo."
    choice = text.split("*")[-1] if text else ""
    if choice == "":
        return "CON LittleGo\n1. Where is my child?\n2. Call me back"
    if choice == "1":
        lines = []
        rows = db.execute(select(TripChild, Trip).join(Trip).join(Child).where(
            Child.parent_id == parent.id, Trip.run_date == today())).all()
        for tc, trip in rows:
            pin = f" PIN {tc.pin}" if tc.status == "on_board" and tc.pin else ""
            lines.append(f"{tc.child.name.split()[0]}: {LABEL.get(tc.status, tc.status)} ({trip.vehicle.code}){pin}")
        return "END " + ("\n".join(lines) if lines else "No LittleGo trips for your children today.")
    if choice == "2":
        from ..services.safety import record
        record(db, "callback_request", f"{parent.name} ({parent.phone}) asked for a call back via USSD")
        db.commit()
        return "END The LittleGo ops team will call you shortly."
    return "END Invalid choice."
