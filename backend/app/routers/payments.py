import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Booking
from ..services.payments import activate_booking
from ..services.providers import payments

router = APIRouter(prefix="/payments", tags=["payments"])
log = logging.getLogger("littlego.payments")


@router.post("/paystack/webhook")
async def paystack_webhook(request: Request, db: Session = Depends(get_db)):
    """Set this URL as the webhook in your Paystack dashboard:
    https://<your-api>/payments/paystack/webhook"""
    if settings.payment_provider != "paystack":
        raise HTTPException(404, "Paystack is not enabled")
    raw = await request.body()
    if not payments().valid_webhook(raw, request.headers.get("x-paystack-signature")):
        raise HTTPException(401, "Invalid signature")
    event = json.loads(raw)
    if event.get("event") != "charge.success":
        return {"ok": True}
    data = event.get("data", {})
    b = db.scalar(select(Booking).where(Booking.payment_ref == data.get("reference")))
    if b is None:
        log.warning("Paystack payment for unknown reference %s", data.get("reference"))
        return {"ok": True}
    if int(data.get("amount", 0)) < b.monthly_price * 100:
        log.error("Underpayment on %s: got %s kobo", b.payment_ref, data.get("amount"))
        return {"ok": True}
    activate_booking(db, b)
    db.commit()
    return {"ok": True}
