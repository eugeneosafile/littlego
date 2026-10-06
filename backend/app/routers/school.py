from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ChildStatus, Event, Role, Trip, TripChild, User
from ..schemas import CardIn, EventOut, TripChildOut, TripOut
from ..security import require
from ..services import safety
from .common import today

router = APIRouter(prefix="/school", tags=["school"])
Staff = Depends(require(Role.school_admin))


class QueueItem(BaseModel):
    trip_child: TripChildOut
    trip_id: int
    vehicle_code: str
    card_uid: str


class Summary(BaseModel):
    booked_today: int
    released: int
    waiting: int
    on_board: int
    handed_over: int
    open_alerts: int


@router.get("/queue", response_model=list[QueueItem])
def queue(db: Session = Depends(get_db), me: User = Staff):
    rows = db.scalars(select(TripChild).join(Trip).where(
        Trip.school_id == me.school_id, Trip.run_date == today())).all()
    return [QueueItem(trip_child=TripChildOut.model_validate(tc), trip_id=tc.trip_id,
                      vehicle_code=tc.trip.vehicle.code, card_uid=tc.child.card_uid) for tc in rows]


@router.post("/release", response_model=TripChildOut)
def release(body: CardIn, db: Session = Depends(get_db), me: User = Staff):
    tc = safety.release_at_school(db, body.card_uid, me)
    db.commit()
    return tc


@router.get("/trips", response_model=list[TripOut])
def fleet(db: Session = Depends(get_db), me: User = Staff):
    return db.scalars(select(Trip).where(Trip.school_id == me.school_id, Trip.run_date == today())).all()


@router.get("/summary", response_model=Summary)
def summary(db: Session = Depends(get_db), me: User = Staff):
    rows = db.scalars(select(TripChild).join(Trip).where(
        Trip.school_id == me.school_id, Trip.run_date == today())).all()
    count = lambda s: sum(1 for r in rows if r.status == s)  # noqa: E731
    alerts = db.scalars(select(Event).where(Event.school_id == me.school_id, Event.resolved.is_(False),
                                            Event.severity != "info")).all()
    return Summary(booked_today=len(rows), released=count(ChildStatus.released),
                   waiting=count(ChildStatus.scheduled), on_board=count(ChildStatus.on_board),
                   handed_over=count(ChildStatus.handed_over), open_alerts=len(alerts))


@router.get("/alerts", response_model=list[EventOut])
def alerts(include_info: bool = False, db: Session = Depends(get_db), me: User = Staff):
    q = select(Event).where(Event.school_id == me.school_id, Event.kind != "video_access")
    if not include_info:
        q = q.where(Event.severity != "info")
    return db.scalars(q.order_by(Event.created_at.desc()).limit(100)).all()


@router.post("/alerts/{event_id}/resolve", response_model=EventOut)
def resolve(event_id: int, db: Session = Depends(get_db), me: User = Staff):
    ev = db.get(Event, event_id)
    if ev is None or ev.school_id != me.school_id:
        raise HTTPException(404, "Alert not found")
    ev.resolved = True
    db.commit()
    return ev
