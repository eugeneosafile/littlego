from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import (
    Booking, Child, ChildStatus, Event, Receiver, Role, Tier, Trip, TripChild, TripStatus, User,
)
from ..schemas import (
    BookingIn, BookingOut, CheckoutOut, ChildOut, EventOut, ParentTripView, PriceOut, ReceiverIn,
    ReceiverOut, SosIn, StreamOut, TripChildOut,
)
from ..security import require
from ..services import safety
from ..services.providers import payments, video
from .common import get_trip, today

router = APIRouter(prefix="/parent", tags=["parent"])
Parent = Depends(require(Role.parent))

PRICES = {Tier.shared: lambda: settings.price_shared, Tier.group: lambda: settings.price_group,
          Tier.exclusive: lambda: settings.price_exclusive}


def _my_child(db: Session, parent: User, child_id: int) -> Child:
    child = db.get(Child, child_id)
    if child is None or child.parent_id != parent.id:
        raise HTTPException(404, "Child not found")
    return child


@router.get("/children", response_model=list[ChildOut])
def children(db: Session = Depends(get_db), me: User = Parent):
    return db.scalars(select(Child).where(Child.parent_id == me.id)).all()


# ---- approved receivers ----
@router.get("/receivers", response_model=list[ReceiverOut])
def receivers(db: Session = Depends(get_db), me: User = Parent):
    return db.scalars(select(Receiver).where(Receiver.parent_id == me.id, Receiver.active)).all()


@router.post("/receivers", response_model=ReceiverOut, status_code=201)
def add_receiver(body: ReceiverIn, db: Session = Depends(get_db), me: User = Parent):
    r = Receiver(parent_id=me.id, **body.model_dump())
    db.add(r)
    safety.record(db, "receiver_added", f"{me.name} approved {r.name} ({r.relationship_to_child}) as a receiver",
                  actor=me)
    db.commit()
    return r


@router.delete("/receivers/{receiver_id}", status_code=204)
def remove_receiver(receiver_id: int, db: Session = Depends(get_db), me: User = Parent):
    r = db.get(Receiver, receiver_id)
    if r is None or r.parent_id != me.id:
        raise HTTPException(404, "Receiver not found")
    r.active = False
    safety.record(db, "receiver_removed", f"{me.name} removed {r.name} as a receiver", actor=me)
    db.commit()


# ---- plans and bookings ----
@router.get("/prices", response_model=list[PriceOut])
def prices(_: User = Parent):
    return [PriceOut(tier=t, monthly_price=f()) for t, f in PRICES.items()]


@router.post("/bookings", response_model=CheckoutOut, status_code=201)
def book(body: BookingIn, db: Session = Depends(get_db), me: User = Parent):
    child = _my_child(db, me, body.child_id)
    price = PRICES[body.tier]()
    b = Booking(child_id=child.id, tier=body.tier, days=body.days, pickup_time=body.pickup_time,
                monthly_price=price)
    db.add(b)
    db.flush()
    checkout = payments().create_checkout(price, me.phone, f"WardRide {body.tier} plan for {child.name}")
    b.payment_ref = checkout.reference
    if checkout.paid:
        b.status = "active"
    db.commit()
    return CheckoutOut(booking=BookingOut.model_validate(b), checkout_url=checkout.checkout_url)


@router.get("/bookings", response_model=list[BookingOut])
def bookings(db: Session = Depends(get_db), me: User = Parent):
    return db.scalars(select(Booking).join(Child).where(Child.parent_id == me.id)).all()


# ---- live trips ----
def _view(db: Session, trip: Trip, me: User) -> ParentTripView:
    mine = [tc for tc in trip.children if tc.child.parent_id == me.id]
    child_ids = {tc.child_id for tc in mine}
    events = db.scalars(
        select(Event).where(Event.trip_id == trip.id).order_by(Event.created_at)
    ).all()
    # Parents see trip-level events and events about their own children only.
    timeline = [e for e in events if e.child_id is None or e.child_id in child_ids]
    timeline = [e for e in timeline if e.kind not in ("video_access",)]
    return ParentTripView(
        trip_id=trip.id, vehicle=trip.vehicle, status=trip.status, driver=trip.driver, escort=trip.escort,
        last_lat=trip.last_lat, last_lon=trip.last_lon, last_ping_at=trip.last_ping_at,
        school_lat=trip.school.lat, school_lon=trip.school.lon,
        my_children=[TripChildOut.model_validate(tc) for tc in mine],
        handover_pins={tc.id: tc.pin for tc in mine if tc.pin and tc.status == ChildStatus.on_board},
        timeline=[EventOut.model_validate(e) for e in timeline],
    )


def _my_trip(db: Session, me: User, trip_id: int) -> Trip:
    trip = get_trip(db, trip_id)
    if not any(tc.child.parent_id == me.id for tc in trip.children):
        raise HTTPException(404, "Trip not found")
    return trip


@router.get("/trips/today", response_model=list[ParentTripView])
def trips_today(db: Session = Depends(get_db), me: User = Parent):
    trips = db.scalars(
        select(Trip).join(TripChild).join(Child)
        .where(Trip.run_date == today(), Child.parent_id == me.id).distinct()
    ).all()
    return [_view(db, t, me) for t in trips]


@router.get("/trips/{trip_id}", response_model=ParentTripView)
def trip_detail(trip_id: int, db: Session = Depends(get_db), me: User = Parent):
    return _view(db, _my_trip(db, me, trip_id), me)


@router.get("/trips/{trip_id}/live", response_model=StreamOut)
def live_video(trip_id: int, low_data: bool = True, db: Session = Depends(get_db), me: User = Parent):
    """Live camera view. Allowed only while the parent's own child is in WardRide's care on
    this vehicle. Every access is logged (NDPA access log)."""
    trip = _my_trip(db, me, trip_id)
    in_care = any(tc.child.parent_id == me.id and tc.status in (ChildStatus.released, ChildStatus.on_board)
                  for tc in trip.children)
    if trip.status != TripStatus.in_progress or not in_care:
        raise HTTPException(403, "Live view is available only while your child is on this vehicle")
    s = video().live_stream(trip.vehicle.code, low_data=low_data)
    safety.record(db, "video_access", f"{me.name} opened live view of {trip.vehicle.code}", trip=trip, actor=me)
    db.commit()
    return StreamOut(url=s.url, cameras=s.cameras, bitrate_kbps=s.bitrate_kbps,
                     expires_in_s=s.expires_in_s, low_data=low_data)


@router.post("/trips/{trip_id}/sos", response_model=EventOut)
def parent_sos(trip_id: int, body: SosIn, db: Session = Depends(get_db), me: User = Parent):
    trip = _my_trip(db, me, trip_id)
    ev = safety.sos(db, trip, me, body.note)
    db.commit()
    return ev
