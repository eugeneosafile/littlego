from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Receiver, Role, Trip, TripChild, User
from ..schemas import CardIn, EventOut, HandoverIn, PingIn, SosIn, TripChildOut, TripChildRef, TripOut
from ..security import require
from ..services import safety
from .common import get_trip, today

router = APIRouter(prefix="/crew", tags=["crew"])
Crew = Depends(require(Role.crew))


class ReceiverForCrew(BaseModel):
    """Crew see who may receive the child, not their phone numbers."""
    id: int
    name: str
    relationship_to_child: str


def _mine(db: Session, me: User, trip_id: int) -> Trip:
    trip = get_trip(db, trip_id)
    safety.assert_on_trip(trip, me)
    return trip


@router.get("/trips/today", response_model=list[TripOut])
def my_trips(db: Session = Depends(get_db), me: User = Crew):
    return db.scalars(select(Trip).where(
        Trip.run_date == today(), or_(Trip.driver_id == me.id, Trip.escort_id == me.id))).all()


@router.post("/trips/{trip_id}/start", response_model=TripOut)
def start(trip_id: int, db: Session = Depends(get_db), me: User = Crew):
    trip = safety.start_trip(db, _mine(db, me, trip_id), me)
    db.commit()
    return trip


@router.post("/trips/{trip_id}/board", response_model=TripChildOut)
def board(trip_id: int, body: CardIn, db: Session = Depends(get_db), me: User = Crew):
    tc = safety.board(db, _mine(db, me, trip_id), body.card_uid, me)
    db.commit()
    return tc


@router.get("/trips/{trip_id}/children/{trip_child_id}/receivers", response_model=list[ReceiverForCrew])
def receivers(trip_id: int, trip_child_id: int, db: Session = Depends(get_db), me: User = Crew):
    trip = _mine(db, me, trip_id)
    tc = db.get(TripChild, trip_child_id)
    if tc is None or tc.trip_id != trip.id:
        raise HTTPException(404, "Child not on this trip")
    return db.scalars(select(Receiver).where(Receiver.parent_id == tc.child.parent_id, Receiver.active)).all()


@router.post("/trips/{trip_id}/handover", response_model=TripChildOut)
def handover(trip_id: int, body: HandoverIn, db: Session = Depends(get_db), me: User = Crew):
    tc = safety.handover(db, _mine(db, me, trip_id), body.trip_child_id, body.receiver_id, body.pin, me)
    db.commit()
    return tc


@router.post("/trips/{trip_id}/no-receiver", response_model=TripChildOut)
def no_receiver(trip_id: int, body: TripChildRef, db: Session = Depends(get_db), me: User = Crew):
    tc = safety.no_receiver(db, _mine(db, me, trip_id), body.trip_child_id, me)
    db.commit()
    return tc


@router.post("/trips/{trip_id}/ping", response_model=list[EventOut])
def ping(trip_id: int, body: PingIn, db: Session = Depends(get_db), me: User = Crew):
    events = safety.location_ping(db, _mine(db, me, trip_id), body.lat, body.lon, body.speed_kmh, me)
    db.commit()
    return events


@router.post("/trips/{trip_id}/sos", response_model=EventOut)
def sos(trip_id: int, body: SosIn, db: Session = Depends(get_db), me: User = Crew):
    ev = safety.sos(db, _mine(db, me, trip_id), me, body.note)
    db.commit()
    return ev


@router.post("/trips/{trip_id}/end", response_model=TripOut)
def end(trip_id: int, db: Session = Depends(get_db), me: User = Crew):
    trip = safety.end_trip(db, _mine(db, me, trip_id), me)
    db.commit()
    return trip
