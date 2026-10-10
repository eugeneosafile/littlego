from datetime import UTC, datetime

from sqlalchemy.orm import Session

from ..models import Booking
from . import safety


def activate_booking(db: Session, b: Booking) -> None:
    if b.status == "active":
        return
    b.status, b.paid_at = "active", datetime.now(UTC)
    safety.record(db, "payment_received", f"Payment received for {b.child.name}'s {b.tier} plan "
                  f"(ref {b.payment_ref})", child_id=b.child_id)
    safety.notify(db, b.child.parent.phone,
                  f"WardRide: payment received. {b.child.name}'s {b.tier} plan is now active.")
