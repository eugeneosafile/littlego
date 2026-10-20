"""End-to-end dry run of a full pilot day against the real database, with test data that is
removed afterwards. Run it on staging and production after every deploy.

    python -m app.dry_run                       # SMS are recorded, not sent
    python -m app.dry_run --sms-to 0803xxxxxxx  # every SMS goes to this one phone (checks real delivery)
    python -m app.dry_run --keep                # leave the test data in place to inspect it

It creates a "DRY RUN" school, two vetted crew, a vehicle, two families, paid plans and a route;
generates today's trip; then runs release, boarding, location checks, a correct handover, a locked
PIN, a safe-hub drop, an SOS and the location watchdog, checking each safety rule as it goes.
"""
import argparse
import sys
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import delete, select

from .db import SessionLocal
from .models import (Booking, Child, ChildStatus, Event, LocationPing, Notification, Receiver, Role, Route,
                     RouteStop, School, Tier, Trip, TripChild, User, Vehicle)
from .security import hash_password
from .services import safety
from .services.scheduling import generate_trips

TAG = "DRY RUN"
results: list[tuple[bool, str]] = []


def check(ok: bool, what: str) -> None:
    results.append((bool(ok), what))
    print(f"  [{'PASS' if ok else 'FAIL'}] {what}")


def expect_refusal(fn, what: str) -> None:
    try:
        fn()
        check(False, what)
    except HTTPException:
        check(True, what)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sms-to", help="send every SMS to this phone instead of recording only")
    ap.add_argument("--keep", action="store_true")
    a = ap.parse_args()

    from .services.phone import normalize
    sink = normalize(a.sms_to) if a.sms_to else None
    real_notify = safety.notify

    def routed_notify(db, phone, message, channel="sms"):
        if sink:
            return real_notify(db, sink, f"[{TAG} for {phone}] {message}", channel)
        db.add(Notification(to_phone=phone, channel=channel, message=message, provider_ref="DRY-RUN"))
        return True

    safety.notify = routed_notify
    db = SessionLocal()
    created: dict[str, list[int]] = {}
    try:
        print(f"\n{TAG}: setting up test data")
        stamp = datetime.now(UTC).strftime("%H%M%S")
        num = iter(range(1, 50))
        phone = lambda: f"+23480000{stamp[-4:]}{next(num):02d}"  # noqa: E731  reserved test range
        school = School(name=f"{TAG} School {stamp}", address="Test", lat=6.4474, lon=3.4720, safe_hub_name="Test hub")
        db.add(school)
        db.flush()
        pw = hash_password("dry-run-not-for-login")
        staff = User(name=f"{TAG} Gate", phone=phone(), role=Role.school_admin, school_id=school.id, password_hash=pw)
        expiry = (datetime.now(UTC) + timedelta(days=365)).date()
        driver = User(name=f"{TAG} Driver", phone=phone(), role=Role.crew, crew_role="driver", password_hash=pw,
                      vetted_at=datetime.now(UTC), vetting_expires_at=expiry, vetting_notes="dry run")
        escort = User(name=f"{TAG} Escort", phone=phone(), role=Role.crew, crew_role="escort", password_hash=pw,
                      vetted_at=datetime.now(UTC), vetting_expires_at=expiry, vetting_notes="dry run")
        p1 = User(name=f"{TAG} Parent A", phone=phone(), role=Role.parent, password_hash=pw)
        p2 = User(name=f"{TAG} Parent B", phone=phone(), role=Role.parent, password_hash=pw)
        db.add_all([staff, driver, escort, p1, p2])
        vehicle = Vehicle(code=f"DRY-{stamp}", plate="TEST", kind=Tier.shared, seats=4, camera_count=3, cameras_online=3)
        db.add(vehicle)
        db.flush()
        c1 = Child(name=f"{TAG} Child A", class_name="P1", school_id=school.id, parent_id=p1.id,
                   card_uid=f"DRYA{stamp}", home_lat=6.4430, home_lon=3.4800)
        c2 = Child(name=f"{TAG} Child B", class_name="P2", school_id=school.id, parent_id=p2.id,
                   card_uid=f"DRYB{stamp}", home_lat=6.4405, home_lon=3.4690)
        db.add_all([c1, c2])
        db.flush()
        r1 = Receiver(parent_id=p1.id, name="Parent A", relationship_to_child="Parent", phone=p1.phone)
        r2 = Receiver(parent_id=p2.id, name="Parent B", relationship_to_child="Parent", phone=p2.phone)
        db.add_all([r1, r2])
        db.add_all([Booking(child_id=c.id, tier=Tier.shared, monthly_price=0, status="active",
                            days="mon,tue,wed,thu,fri,sat,sun", payment_ref=f"DRY-{c.card_uid}") for c in (c1, c2)])
        route = Route(name=f"{TAG} route {stamp}", school_id=school.id, vehicle_id=vehicle.id, driver_id=driver.id,
                      escort_id=escort.id, run="afternoon")
        route.stops = [RouteStop(child_id=c1.id, stop_order=1), RouteStop(child_id=c2.id, stop_order=2)]
        db.add(route)
        db.commit()
        created.update(vehicle_code=[vehicle.code], school=[school.id], users=[staff.id, driver.id, escort.id, p1.id, p2.id],
                       vehicle=[vehicle.id], children=[c1.id, c2.id], route=[route.id])

        print(f"\n{TAG}: daily trip generation")
        rep = generate_trips(db, datetime.now(UTC).date())
        trip = db.scalar(select(Trip).where(Trip.route_id == route.id))
        check(trip is not None and len(trip.children) == 2, "today's trip created from the route with both children")
        created["trip"] = [trip.id]
        check(not any(TAG in w for w in rep.warnings), "crew cleared for the trip")

        print(f"\n{TAG}: start and release")
        expect_refusal(lambda: safety.board(db, trip, c1.card_uid, escort), "boarding refused before the trip starts")
        safety.start_trip(db, trip, driver)
        db.commit()
        check(trip.status == "in_progress", "trip started by vetted crew")
        expect_refusal(lambda: safety.board(db, trip, c1.card_uid, escort), "boarding refused before school release")
        for c in (c1, c2):
            safety.release_at_school(db, c.card_uid, staff)
        db.commit()
        check(all(tc.status == ChildStatus.released for tc in trip.children), "school released both children")

        print(f"\n{TAG}: boarding and PIN")
        tcs = {tc.child_id: tc for tc in trip.children}
        for c in (c1, c2):
            safety.board(db, trip, c.card_uid, escort)
        db.commit()
        check(all(tc.status == ChildStatus.on_board and tc.pin for tc in tcs.values()), "both boarded with a one-time PIN")
        check(tcs[c1.id].pin_enc and tcs[c1.id].pin not in tcs[c1.id].pin_enc, "PIN stored encrypted")
        msgs = db.scalars(select(Notification.message).where(Notification.to_phone.in_([p1.phone, sink or ""]))).all()
        check(any(tcs[c1.id].pin in m for m in msgs) or sink is not None, "parent received the PIN by SMS")
        expect_refusal(lambda: safety.end_trip(db, trip, driver), "trip cannot end with children on board")

        print(f"\n{TAG}: tracking")
        on = safety.location_ping(db, trip, 6.4450, 3.4760, 30, driver)
        off = safety.location_ping(db, trip, 6.5244, 3.3792, 95, driver)
        db.commit()
        check(on == [], "on-route location raises no alert")
        check({e.kind for e in off} == {"route_deviation", "speeding"}, "off-route and speeding raise alerts")

        print(f"\n{TAG}: handover")
        expect_refusal(lambda: safety.handover(db, trip, tcs[c1.id].id, r2.id, tcs[c1.id].pin, escort),
                       "handover to another family's adult refused")
        safety.handover(db, trip, tcs[c1.id].id, r1.id, tcs[c1.id].pin, escort)
        db.commit()
        check(tcs[c1.id].status == ChildStatus.handed_over and tcs[c1.id].pin is None, "correct PIN hands over; PIN cleared")
        wrong = "0000" if tcs[c2.id].pin != "0000" else "1111"
        for _ in range(3):
            try:
                safety.handover(db, trip, tcs[c2.id].id, r2.id, wrong, escort)
            except HTTPException:
                pass
        db.refresh(tcs[c2.id])
        check(tcs[c2.id].pin_locked, "three wrong PINs lock the handover")
        safety.no_receiver(db, trip, tcs[c2.id].id, escort)
        db.commit()
        check(tcs[c2.id].status == ChildStatus.at_safe_hub, "child with no verified adult goes to the safe hub")

        print(f"\n{TAG}: SOS and end of trip")
        ev = safety.sos(db, trip, escort, "dry run")
        db.commit()
        check(ev.severity == "critical", "SOS raised as critical (ops phones alerted)")
        safety.end_trip(db, trip, driver)
        db.commit()
        check(trip.status == "completed", "trip ended once every child was off the vehicle")
        kinds = set(db.scalars(select(Event.kind).where(Event.trip_id == trip.id)))
        need = {"trip_started", "released", "boarded", "route_deviation", "speeding", "unapproved_receiver",
                "handed_over", "pin_locked", "no_receiver", "sos", "trip_ended"}
        check(need <= kinds, f"audit log complete ({len(need & kinds)}/{len(need)} event types)")
    except Exception as exc:  # report, then clean up
        check(False, f"unexpected error: {exc!r}")
        db.rollback()
    finally:
        safety.notify = real_notify
        if not a.keep and created:
            _cleanup(db, created)
        db.close()

    fails = sum(1 for ok, _ in results if not ok)
    print(f"\n{TAG} {'PASSED' if not fails else 'FAILED'}: {len(results) - fails}/{len(results)} checks"
          f"{'' if a.keep else ' (test data removed)'}")
    return 1 if fails else 0


def _cleanup(db, created: dict) -> None:
    trip_ids = created.get("trip", [])
    child_ids = created.get("children", [])
    user_ids = created.get("users", [])
    db.execute(delete(Event).where((Event.trip_id.in_(trip_ids)) | (Event.child_id.in_(child_ids))
                                   | (Event.actor_id.in_(user_ids))))
    db.execute(delete(LocationPing).where(LocationPing.trip_id.in_(trip_ids)))
    db.execute(delete(TripChild).where(TripChild.trip_id.in_(trip_ids)))
    db.execute(delete(Trip).where(Trip.id.in_(trip_ids)))
    db.execute(delete(RouteStop).where(RouteStop.route_id.in_(created.get("route", []))))
    db.execute(delete(Route).where(Route.id.in_(created.get("route", []))))
    db.execute(delete(Booking).where(Booking.child_id.in_(child_ids)))
    db.execute(delete(Receiver).where(Receiver.parent_id.in_(user_ids)))
    db.execute(delete(Child).where(Child.id.in_(child_ids)))
    phones = list(db.scalars(select(User.phone).where(User.id.in_(user_ids))))
    db.execute(delete(Notification).where(Notification.to_phone.in_(phones)))
    for code in created.get("vehicle_code", []) + [TAG]:  # ops alerts name the test vehicle or child
        db.execute(delete(Notification).where(Notification.message.contains(code)))
    db.execute(delete(User).where(User.id.in_(user_ids)))
    db.execute(delete(Vehicle).where(Vehicle.id.in_(created.get("vehicle", []))))
    db.execute(delete(School).where(School.id.in_(created.get("school", []))))
    db.commit()


if __name__ == "__main__":
    sys.exit(main())
