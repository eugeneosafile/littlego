"""Core safety rules. Every route that moves a child through a journey calls into here,
so the rules live in one place and are covered by tests.
"""
import secrets
from zoneinfo import ZoneInfo
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import (
    Child, ChildStatus, Event, Notification, Receiver, Role, Severity, Trip, TripChild,
    TripStatus, User, LocationPing,
)
from .geo import distance_to_route_km
import logging

from .providers import sms

log = logging.getLogger("wardride.safety")


LAGOS = ZoneInfo("Africa/Lagos")


def _now() -> datetime:
    return datetime.now(UTC)


def _clock(dt: datetime) -> str:
    """Time as parents read it: Lagos local time, e.g. 3:42pm."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(LAGOS).strftime("%-I:%M%p").lower()


def _fail(msg: str, code: int = status.HTTP_400_BAD_REQUEST):
    raise HTTPException(code, msg)


# ---------- events & notifications ----------
def notify(db: Session, phone: str, message: str, channel: str = "sms") -> bool:
    """Send an SMS. A failed SMS never blocks a safety step; it is logged as FAILED for ops to follow up."""
    try:
        ref = sms().send(phone, message)
        ok = True
    except Exception as exc:  # provider down, bad number, no credit...
        log.error("SMS to %s failed: %s", phone, exc)
        ref, ok = "FAILED", False
    db.add(Notification(to_phone=phone, channel=channel, message=message, provider_ref=ref))
    return ok


def record(db: Session, kind: str, message: str, *, severity: Severity = Severity.info,
           trip: Trip | None = None, child_id: int | None = None, actor: User | None = None) -> Event:
    ev = Event(
        kind=kind, message=message, severity=severity,
        trip_id=trip.id if trip else None, child_id=child_id,
        actor_id=actor.id if actor else None, school_id=trip.school_id if trip else None,
    )
    db.add(ev)
    if severity == Severity.critical:
        for phone in [p.strip() for p in settings.ops_alert_phones.split(",") if p.strip()]:
            notify(db, phone, f"[WardRide CRITICAL] {message}")
    return ev


def _notify_family(db: Session, child: Child, message: str) -> None:
    notify(db, child.parent.phone, message)


# ---------- the two-adult, child-only rule ----------
def assert_crew_valid(trip: Trip) -> None:
    """A trip runs only with one vetted driver and one different vetted escort. No one else."""
    if trip.driver_id == trip.escort_id:
        _fail("Driver and escort must be two different people")
    for person, needed in ((trip.driver, "driver"), (trip.escort, "escort")):
        if person.role != Role.crew or not person.active:
            _fail(f"The {needed} must be active WardRide crew")
        if person.vetted_at is None:
            _fail(f"{person.name} has not completed vetting and cannot run a trip")
        if person.vetting_expires_at is not None and person.vetting_expires_at < _now().date():
            _fail(f"{person.name}'s vetting expired on {person.vetting_expires_at}. Renew before driving.")


def assert_on_trip(trip: Trip, user: User) -> None:
    if user.id not in (trip.driver_id, trip.escort_id):
        _fail("You are not assigned to this trip", status.HTTP_403_FORBIDDEN)


def start_trip(db: Session, trip: Trip, actor: User) -> Trip:
    assert_on_trip(trip, actor)
    assert_crew_valid(trip)
    if trip.status != TripStatus.scheduled:
        _fail("Trip has already started")
    if trip.vehicle.cameras_online < trip.vehicle.camera_count:
        record(db, "camera_offline", f"{trip.vehicle.code}: only {trip.vehicle.cameras_online}/"
               f"{trip.vehicle.camera_count} cameras online at start", severity=Severity.warning, trip=trip)
    trip.status = TripStatus.in_progress
    trip.started_at = _now()
    record(db, "trip_started", f"{trip.vehicle.code} started with {trip.driver.name} (driver) "
           f"and {trip.escort.name} (escort)", trip=trip, actor=actor)
    return trip


def end_trip(db: Session, trip: Trip, actor: User) -> Trip:
    assert_on_trip(trip, actor)
    still_on = [tc for tc in trip.children if tc.status == ChildStatus.on_board]
    if still_on:
        names = ", ".join(tc.child.name for tc in still_on)
        _fail(f"Cannot end trip: still on board: {names}")
    trip.status = TripStatus.completed
    trip.ended_at = _now()
    record(db, "trip_ended", f"{trip.vehicle.code} completed its run", trip=trip, actor=actor)
    return trip


# ---------- journey steps ----------
def _trip_child_by_card(db: Session, trip: Trip, card_uid: str) -> TripChild:
    for tc in trip.children:
        if tc.child.card_uid == card_uid:
            return tc
    _fail("This child is not booked on this trip", status.HTTP_404_NOT_FOUND)


def release_at_school(db: Session, card_uid: str, staff: User) -> TripChild:
    """School staff scan a child's card at the gate. Releases only onto a booked trip today."""
    child = db.scalar(select(Child).where(Child.card_uid == card_uid))
    if child is None:
        _fail("Unknown card", status.HTTP_404_NOT_FOUND)
    if staff.school_id != child.school_id:
        _fail("This child is not at your school", status.HTTP_403_FORBIDDEN)
    tc = db.scalar(
        select(TripChild).join(Trip).where(
            TripChild.child_id == child.id,
            Trip.run_date == _now().date(),
            TripChild.status == ChildStatus.scheduled,
        )
    )
    if tc is None:
        _fail(f"{child.name} has no WardRide trip waiting today. Do not release.")
    tc.status = ChildStatus.released
    tc.released_at = _now()
    tc.released_by_id = staff.id
    record(db, "released", f"{child.name} released at the gate by {staff.name} to {tc.trip.vehicle.code}",
           trip=tc.trip, child_id=child.id, actor=staff)
    return tc


def board(db: Session, trip: Trip, card_uid: str, crew: User) -> TripChild:
    assert_on_trip(trip, crew)
    if trip.status != TripStatus.in_progress:
        _fail("Start the trip before boarding children")
    tc = _trip_child_by_card(db, trip, card_uid)
    if tc.status != ChildStatus.released:
        _fail(f"{tc.child.name} has not been released by the school (status: {tc.status})")
    tc.status = ChildStatus.on_board
    tc.boarded_at = _now()
    tc.pin = f"{secrets.randbelow(10_000):04d}"
    tc.pin_attempts = 0
    child = tc.child
    record(db, "boarded", f"{child.name} boarded {trip.vehicle.code}", trip=trip, child_id=child.id, actor=crew)
    msg = (f"WardRide: {child.name} is on board {trip.vehicle.code} at "
           f"{_clock(tc.boarded_at)}. Handover PIN: {tc.pin}. Share only with an approved adult.")
    _notify_family(db, child, msg)
    for r in db.scalars(select(Receiver).where(Receiver.parent_id == child.parent_id, Receiver.active)):
        if r.phone != child.parent.phone:
            notify(db, r.phone, f"WardRide: {child.name} is on the way home. PIN: {tc.pin}.")
    return tc


def handover(db: Session, trip: Trip, trip_child_id: int, receiver_id: int, pin: str, crew: User) -> TripChild:
    """Hand a child to an approved adult. Requires the one-time PIN."""
    assert_on_trip(trip, crew)
    tc = db.get(TripChild, trip_child_id)
    if tc is None or tc.trip_id != trip.id:
        _fail("Child not on this trip", status.HTTP_404_NOT_FOUND)
    if tc.status != ChildStatus.on_board:
        _fail(f"{tc.child.name} is not on board (status: {tc.status})")
    if tc.pin_locked:
        _fail("PIN locked after too many attempts. Call the ops centre.", status.HTTP_423_LOCKED)
    receiver = db.get(Receiver, receiver_id)
    if receiver is None or receiver.parent_id != tc.child.parent_id or not receiver.active:
        record(db, "unapproved_receiver", f"Attempt to hand {tc.child.name} to an unapproved adult",
               severity=Severity.critical, trip=trip, child_id=tc.child_id, actor=crew)
        db.commit()
        _fail("This adult is not on the approved list. Keep the child on board.", status.HTTP_403_FORBIDDEN)
    if not secrets.compare_digest(pin, tc.pin or ""):
        tc.pin_attempts += 1
        if tc.pin_attempts >= settings.handover_pin_max_attempts:
            tc.pin_locked = True
            record(db, "pin_locked", f"Handover PIN for {tc.child.name} locked after "
                   f"{tc.pin_attempts} wrong attempts", severity=Severity.critical, trip=trip,
                   child_id=tc.child_id, actor=crew)
        db.commit()
        left = max(0, settings.handover_pin_max_attempts - tc.pin_attempts)
        _fail(f"Wrong PIN. {left} attempt(s) left.", status.HTTP_403_FORBIDDEN)
    tc.status = ChildStatus.handed_over
    tc.handed_over_at = _now()
    tc.handed_over_to_id = receiver.id
    tc.pin = None
    record(db, "handed_over", f"{tc.child.name} handed to {receiver.name} ({receiver.relationship_to_child})",
           trip=trip, child_id=tc.child_id, actor=crew)
    _notify_family(db, tc.child, f"WardRide: {tc.child.name} was handed to {receiver.name} at "
                   f"{_clock(tc.handed_over_at)}.")
    return tc


def no_receiver(db: Session, trip: Trip, trip_child_id: int, crew: User) -> TripChild:
    """No approved adult at drop-off: the child stays with the escort and goes to the safe hub."""
    assert_on_trip(trip, crew)
    tc = db.get(TripChild, trip_child_id)
    if tc is None or tc.trip_id != trip.id or tc.status != ChildStatus.on_board:
        _fail("Child is not on board this trip")
    tc.status = ChildStatus.at_safe_hub
    hub = trip.school.safe_hub_name
    record(db, "no_receiver", f"No approved adult for {tc.child.name}; taken to {hub}",
           severity=Severity.warning, trip=trip, child_id=tc.child_id, actor=crew)
    _notify_family(db, tc.child, f"WardRide: no approved adult was at home for {tc.child.name}. "
                   f"{tc.child.name} is safe with our escort and going to {hub}. Please call us.")
    return tc


def sos(db: Session, trip: Trip, actor: User, note: str = "") -> Event:
    if actor.role == Role.crew:
        assert_on_trip(trip, actor)
    who = f"{actor.name} ({actor.role})"
    ev = record(db, "sos", f"SOS on {trip.vehicle.code} raised by {who}. {note}".strip(),
                severity=Severity.critical, trip=trip, actor=actor)
    return ev


# ---------- tracking ----------
def route_for(trip: Trip) -> list[tuple[float, float]]:
    pts = [(trip.school.lat, trip.school.lon)]
    pts += [(tc.child.home_lat, tc.child.home_lon) for tc in trip.children
            if tc.child.home_lat is not None and tc.child.home_lon is not None]
    return pts


def _recent_open(db: Session, trip: Trip, kind: str, minutes: int = 10) -> bool:
    since = _now() - timedelta(minutes=minutes)
    return db.scalar(select(Event.id).where(
        Event.trip_id == trip.id, Event.kind == kind, Event.resolved.is_(False), Event.created_at >= since,
    )) is not None


def location_ping(db: Session, trip: Trip, lat: float, lon: float, speed_kmh: float, crew: User) -> list[Event]:
    assert_on_trip(trip, crew)
    db.add(LocationPing(trip_id=trip.id, lat=lat, lon=lon, speed_kmh=speed_kmh))
    trip.last_lat, trip.last_lon, trip.last_ping_at = lat, lon, _now()
    raised: list[Event] = []
    if trip.status != TripStatus.in_progress:
        return raised
    off_by = distance_to_route_km((lat, lon), route_for(trip))
    if off_by > settings.route_deviation_km and not _recent_open(db, trip, "route_deviation"):
        raised.append(record(db, "route_deviation", f"{trip.vehicle.code} is {off_by:.1f} km off its route",
                             severity=Severity.warning, trip=trip))
    if speed_kmh > settings.speed_limit_kmh and not _recent_open(db, trip, "speeding", 5):
        raised.append(record(db, "speeding", f"{trip.vehicle.code} at {speed_kmh:.0f} km/h",
                             severity=Severity.warning, trip=trip))
    return raised


def check_stale_locations(db: Session) -> list[Event]:
    """Run every few minutes: alert when a running trip has not reported its location recently."""
    cutoff = _now() - timedelta(minutes=settings.stale_location_minutes)
    raised = []
    for trip in db.scalars(select(Trip).where(Trip.status == TripStatus.in_progress)):
        last = trip.last_ping_at or trip.started_at
        if last is not None and last.tzinfo is None:
            last = last.replace(tzinfo=UTC)
        if last and last < cutoff and not _recent_open(db, trip, "location_stale", 30):
            raised.append(record(db, "location_stale",
                                 f"{trip.vehicle.code} has not reported its location for over "
                                 f"{settings.stale_location_minutes} minutes", severity=Severity.warning, trip=trip))
    return raised
