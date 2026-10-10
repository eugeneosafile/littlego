"""Turns standing routes into each day's trips."""
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Booking, Route, Trip, TripChild

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


@dataclass
class GenerateReport:
    run_date: date
    created: list[str] = field(default_factory=list)
    already_existed: list[str] = field(default_factory=list)
    skipped_children: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _crew_problem(route: Route, run_date: date) -> str | None:
    for person in (route.driver, route.escort):
        if not person.active or person.vetted_at is None:
            return f"{person.name} is not vetted or not active"
        if person.vetting_expires_at and person.vetting_expires_at < run_date:
            return f"{person.name}'s vetting expired on {person.vetting_expires_at}"
    return None


def generate_trips(db: Session, run_date: date) -> GenerateReport:
    report = GenerateReport(run_date=run_date)
    weekday = WEEKDAYS[run_date.weekday()]
    for route in db.scalars(select(Route).where(Route.active.is_(True)).order_by(Route.id)):
        exists = db.scalar(select(Trip.id).where(Trip.route_id == route.id, Trip.run_date == run_date))
        if exists:
            report.already_existed.append(route.name)
            continue
        riders = []
        for stop in route.stops:
            child = stop.child
            if not child.active:
                continue
            booking = db.scalar(select(Booking).where(Booking.child_id == child.id, Booking.status == "active"))
            if booking is None:
                report.skipped_children.append(f"{child.name} ({route.name}): no active paid plan")
            elif weekday not in booking.days.split(","):
                continue
            else:
                riders.append(stop)
        if not riders:
            continue
        problem = _crew_problem(route, run_date)
        if problem:
            report.warnings.append(f"{route.name}: {problem}. The trip is created but cannot start until fixed.")
        trip = Trip(vehicle_id=route.vehicle_id, school_id=route.school_id, route_id=route.id,
                    driver_id=route.driver_id, escort_id=route.escort_id, run_date=run_date, run=route.run)
        db.add(trip)
        db.flush()
        for i, stop in enumerate(riders, start=1):
            db.add(TripChild(trip_id=trip.id, child_id=stop.child_id, stop_order=i))
        report.created.append(f"{route.name}: {len(riders)} children")
    db.commit()
    return report
