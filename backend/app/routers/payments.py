import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
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


_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>LittleGo payment</title>
<style>body{{margin:0;font-family:system-ui,sans-serif;background:#F4F5F0;color:#13232B;display:grid;place-items:center;min-height:100vh}}
.c{{background:#fff;border:1px solid #DDE2DC;border-radius:16px;padding:28px;max-width:360px;margin:16px;text-align:center}}
h1{{font-size:22px;margin:8px 0}}p{{color:#55636B;line-height:1.5}}.b{{color:#0B6E4F;font-weight:800;font-size:26px}}
a{{display:inline-block;margin-top:12px;background:#0B6E4F;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700}}</style>
</head><body><div class="c"><div class="b">LittleGo</div><h1>{title}</h1><p>{body}</p><a href="littlego://">Return to the LittleGo app</a></div></body></html>"""


@router.get("/return", response_class=HTMLResponse)
def payment_return(reference: str = "", trxref: str = "", db: Session = Depends(get_db)):
    """Paystack sends the parent here after checkout. Set LITTLEGO_PAYSTACK_CALLBACK_URL to
    https://<your-api>/payments/return"""
    ref = reference or trxref
    b = db.scalar(select(Booking).where(Booking.payment_ref == ref)) if ref else None
    if b is None:
        return HTMLResponse(_PAGE.format(title="We could not find this payment",
                                         body="If you were charged, contact LittleGo with your payment reference."), 404)
    if b.status != "active":
        paid, kobo = payments().verify(ref)
        if paid and kobo >= b.monthly_price * 100:
            activate_booking(db, b)
            db.commit()
    if b.status == "active":
        return _PAGE.format(title="Payment received",
                            body=f"{b.child.name.split()[0]}'s plan is active. We have also sent you an SMS.")
    return _PAGE.format(title="Payment not confirmed yet",
                        body="This can take a minute. Return to the app and tap 'I have paid, check now'.")
