from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Event, Role, Trip, User
from ..schemas import EventOut, TripOut
from ..security import require
from .common import today

router = APIRouter(prefix="/ops", tags=["ops centre"])
Ops = Depends(require(Role.ops))


@router.get("/trips/today", response_model=list[TripOut])
def trips(db: Session = Depends(get_db), _: User = Ops):
    return db.scalars(select(Trip).where(Trip.run_date == today())).all()


@router.get("/alerts", response_model=list[EventOut])
def alerts(open_only: bool = True, db: Session = Depends(get_db), _: User = Ops):
    q = select(Event).where(Event.severity != "info")
    if open_only:
        q = q.where(Event.resolved.is_(False))
    return db.scalars(q.order_by(Event.created_at.desc()).limit(200)).all()


@router.get("/audit", response_model=list[EventOut])
def audit(trip_id: int | None = None, db: Session = Depends(get_db), _: User = Ops):
    """Full audit log, including who opened live video and when."""
    q = select(Event)
    if trip_id is not None:
        q = q.where(Event.trip_id == trip_id)
    return db.scalars(q.order_by(Event.created_at.desc()).limit(500)).all()


@router.post("/alerts/{event_id}/resolve", response_model=EventOut)
def resolve(event_id: int, db: Session = Depends(get_db), _: User = Ops):
    ev = db.get(Event, event_id)
    if ev is None:
        raise HTTPException(404, "Alert not found")
    ev.resolved = True
    db.commit()
    return ev
