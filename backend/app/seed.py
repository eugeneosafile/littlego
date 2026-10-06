"""Demo data: one school, families, crew, vehicles and today's afternoon trips.

Run:  python -m app.seed        (resets the local database)
All demo accounts use the password  wardride123
All names and places are fictional.
"""
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from .db import Base, SessionLocal, engine
from .models import Child, Receiver, Role, School, Tier, Trip, TripChild, User, Vehicle
from .security import hash_password

DEMO_PASSWORD = "wardride123"


def seed(db: Session) -> dict:
    pw = hash_password(DEMO_PASSWORD)
    vetted = datetime.now(UTC)

    school = School(name="Greenfield Academy", address="Admiralty Way, Lekki Phase 1, Lagos",
                    lat=6.4474, lon=3.4720, safe_hub_name="Greenfield Academy safe hub")
    db.add(school)
    db.flush()

    def user(name, phone, role, **kw):
        u = User(name=name, phone=phone, role=role, password_hash=pw, **kw)
        db.add(u)
        return u

    admin = user("Ngozi Okafor", "08030000001", Role.school_admin, school_id=school.id)
    ops = user("Ops Desk", "08030000002", Role.ops)
    musa = user("Musa Ibrahim", "08030000010", Role.crew, crew_role="driver", vetted_at=vetted)
    grace = user("Grace Aliyu", "08030000011", Role.crew, crew_role="escort", vetted_at=vetted)
    kunle = user("Kunle Bello", "08030000012", Role.crew, crew_role="driver", vetted_at=vetted)
    joy = user("Joy Udo", "08030000013", Role.crew, crew_role="escort", vetted_at=vetted)
    trainee = user("New Trainee", "08030000014", Role.crew, crew_role="escort")  # not vetted

    funmi = user("Funmi Adebayo", "08030000100", Role.parent)
    okeke = user("Chika Okeke", "08030000101", Role.parent)
    bello = user("Hauwa Bello", "08030000102", Role.parent)
    db.flush()

    def child(name, cls, parent, card, addr, lat, lon):
        c = Child(name=name, class_name=cls, school_id=school.id, parent_id=parent.id, card_uid=card,
                  home_address=addr, home_lat=lat, home_lon=lon)
        db.add(c)
        return c

    tolu = child("Tolu Adebayo", "Primary 3", funmi, "CARD-TOLU", "14 Admiralty Rd, Lekki Phase 1", 6.4430, 3.4800)
    kemi = child("Kemi Adebayo", "Nursery 2", funmi, "CARD-KEMI", "14 Admiralty Rd, Lekki Phase 1", 6.4430, 3.4800)
    chidera = child("Chidera Okeke", "Primary 5", okeke, "CARD-CHIDERA", "3 Fola Osibo St, Lekki", 6.4405, 3.4690)
    amina = child("Amina Bello", "Primary 1", bello, "CARD-AMINA", "22 Ikate Rd, Lekki", 6.4380, 3.4950)
    db.flush()

    db.add_all([
        Receiver(parent_id=funmi.id, name="Funmi Adebayo", relationship_to_child="Mother", phone=funmi.phone),
        Receiver(parent_id=funmi.id, name="Tunde Adebayo", relationship_to_child="Father", phone="08030000103"),
        Receiver(parent_id=funmi.id, name="Mama Bisi", relationship_to_child="Nanny", phone="08030000104"),
        Receiver(parent_id=okeke.id, name="Chika Okeke", relationship_to_child="Mother", phone=okeke.phone),
        Receiver(parent_id=bello.id, name="Hauwa Bello", relationship_to_child="Mother", phone=bello.phone),
    ])

    bus = Vehicle(code="WR-14", plate="LND-482-XA", kind=Tier.shared, seats=16, camera_count=3, cameras_online=3)
    van = Vehicle(code="WR-22", plate="EKY-119-KJ", kind=Tier.group, seats=7, camera_count=2, cameras_online=2)
    db.add_all([bus, van])
    db.flush()

    today = datetime.now(UTC).date()
    t1 = Trip(vehicle_id=bus.id, school_id=school.id, driver_id=musa.id, escort_id=grace.id, run_date=today)
    t2 = Trip(vehicle_id=van.id, school_id=school.id, driver_id=kunle.id, escort_id=joy.id, run_date=today)
    db.add_all([t1, t2])
    db.flush()
    db.add_all([
        TripChild(trip_id=t1.id, child_id=chidera.id, stop_order=1),
        TripChild(trip_id=t1.id, child_id=tolu.id, stop_order=2),
        TripChild(trip_id=t1.id, child_id=amina.id, stop_order=3),
        TripChild(trip_id=t2.id, child_id=kemi.id, stop_order=1),
    ])
    db.commit()
    return {"school": school, "admin": admin, "ops": ops, "musa": musa, "grace": grace, "trainee": trainee,
            "funmi": funmi, "okeke": okeke, "tolu": tolu, "kemi": kemi, "trip_bus": t1, "trip_van": t2}


if __name__ == "__main__":
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as s:
        seed(s)
    print("Seeded demo data. Password for every demo account:", DEMO_PASSWORD)
