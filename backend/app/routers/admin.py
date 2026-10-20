"""Set-up screens for the ops team: schools, staff, crew vetting, vehicles, families, routes, trips."""
import csv
import io
import secrets
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Booking, Child, Receiver, Role, Route, RouteStop, School, Tier, User, Vehicle
from ..schemas import ORM, BookingOut, SchoolOut, VehicleOut
from ..security import hash_password, require
from ..services import safety
from ..services.phone import normalize
from ..services.scheduling import generate_trips
from .common import today

router = APIRouter(prefix="/admin", tags=["admin (ops)"])
Ops = Depends(require(Role.ops))

CSV_COLUMNS = ["parent_name", "parent_phone", "parent_email", "child_name", "class_name", "home_address",
               "home_lat", "home_lon", "receiver_name", "receiver_relationship", "receiver_phone"]


def new_card_uid() -> str:
    return f"LG{secrets.token_hex(4).upper()}"


# ---------------- schools and staff ----------------
class SchoolIn(BaseModel):
    name: str = Field(min_length=2)
    address: str = ""
    lat: float
    lon: float
    safe_hub_name: str = "School safe hub"


class StaffIn(BaseModel):
    name: str = Field(min_length=2)
    phone: str
    role: Role
    school_id: int | None = None
    password: str | None = Field(default=None, min_length=8)


class PersonOut(ORM):
    id: int
    name: str
    phone: str
    role: str
    school_id: int | None
    active: bool
    crew_role: str | None
    vetted_at: datetime | None
    vetting_expires_at: date | None
    vetting_notes: str


@router.get("/schools", response_model=list[SchoolOut])
def schools(db: Session = Depends(get_db), _: User = Ops):
    return db.scalars(select(School).order_by(School.name)).all()


@router.post("/schools", response_model=SchoolOut, status_code=201)
def add_school(body: SchoolIn, db: Session = Depends(get_db), _: User = Ops):
    s = School(**body.model_dump())
    db.add(s)
    db.commit()
    return s


def _unique_phone(db: Session, phone: str) -> str:
    phone = normalize(phone)
    if db.scalar(select(User.id).where(User.phone == phone)):
        raise HTTPException(409, f"{phone} is already registered")
    return phone


@router.get("/people", response_model=list[PersonOut])
def people(role: Role | None = None, db: Session = Depends(get_db), _: User = Ops):
    q = select(User).order_by(User.name)
    if role:
        q = q.where(User.role == role)
    return db.scalars(q).all()


@router.post("/staff", response_model=PersonOut, status_code=201)
def add_staff(body: StaffIn, db: Session = Depends(get_db), me: User = Ops):
    if body.role not in (Role.school_admin, Role.ops):
        raise HTTPException(422, "Use /admin/crew for crew; parents are added through family import")
    if body.role == Role.school_admin and body.school_id is None:
        raise HTTPException(422, "School staff need a school")
    u = User(name=body.name, phone=_unique_phone(db, body.phone), role=body.role, school_id=body.school_id,
             password_hash=hash_password(body.password or secrets.token_urlsafe(24)))
    db.add(u)
    safety.record(db, "staff_added", f"{me.name} added {u.name} as {u.role}", actor=me)
    db.commit()
    return u


# ---------------- crew and vetting ----------------
class CrewIn(BaseModel):
    name: str = Field(min_length=2)
    phone: str
    crew_role: str = Field(pattern="^(driver|escort)$")


class CrewPatch(BaseModel):
    vetted: bool | None = None
    vetting_expires_at: date | None = None
    vetting_notes: str | None = None
    active: bool | None = None


@router.post("/crew", response_model=PersonOut, status_code=201)
def add_crew(body: CrewIn, db: Session = Depends(get_db), me: User = Ops):
    u = User(name=body.name, phone=_unique_phone(db, body.phone), role=Role.crew, crew_role=body.crew_role,
             password_hash=hash_password(secrets.token_urlsafe(24)))
    db.add(u)
    safety.record(db, "crew_added", f"{me.name} added {u.name} ({u.crew_role}); vetting pending", actor=me)
    db.commit()
    return u


@router.patch("/crew/{user_id}", response_model=PersonOut)
def update_crew(user_id: int, body: CrewPatch, db: Session = Depends(get_db), me: User = Ops):
    u = db.get(User, user_id)
    if u is None or u.role != Role.crew:
        raise HTTPException(404, "Crew member not found")
    if body.vetted is True:
        if not (body.vetting_notes or u.vetting_notes):
            raise HTTPException(422, "Record the vetting evidence (police check ref, guarantor, training) in notes")
        u.vetted_at = datetime.now(UTC)
    elif body.vetted is False:
        u.vetted_at = None
    if body.vetting_expires_at is not None:
        u.vetting_expires_at = body.vetting_expires_at
    if body.vetting_notes is not None:
        u.vetting_notes = body.vetting_notes
    if body.active is not None:
        u.active = body.active
    safety.record(db, "crew_updated", f"{me.name} updated {u.name}: vetted={u.vetted_at is not None}, "
                  f"expires={u.vetting_expires_at}, active={u.active}", actor=me)
    db.commit()
    return u


# ---------------- vehicles ----------------
class VehicleIn(BaseModel):
    code: str = Field(min_length=2)
    plate: str
    kind: Tier
    seats: int = Field(ge=1, le=60)
    camera_count: int = Field(default=3, ge=0)
    cameras_online: int = Field(default=3, ge=0)


class VehiclePatch(BaseModel):
    plate: str | None = None
    seats: int | None = Field(default=None, ge=1, le=60)
    camera_count: int | None = Field(default=None, ge=0)
    cameras_online: int | None = Field(default=None, ge=0)


@router.get("/vehicles", response_model=list[VehicleOut])
def vehicles(db: Session = Depends(get_db), _: User = Ops):
    return db.scalars(select(Vehicle).order_by(Vehicle.code)).all()


@router.post("/vehicles", response_model=VehicleOut, status_code=201)
def add_vehicle(body: VehicleIn, db: Session = Depends(get_db), _: User = Ops):
    if db.scalar(select(Vehicle.id).where(Vehicle.code == body.code)):
        raise HTTPException(409, f"Vehicle {body.code} already exists")
    v = Vehicle(**body.model_dump())
    db.add(v)
    db.commit()
    return v


@router.patch("/vehicles/{vehicle_id}", response_model=VehicleOut)
def update_vehicle(vehicle_id: int, body: VehiclePatch, db: Session = Depends(get_db), _: User = Ops):
    v = db.get(Vehicle, vehicle_id)
    if v is None:
        raise HTTPException(404, "Vehicle not found")
    for k, val in body.model_dump(exclude_none=True).items():
        setattr(v, k, val)
    db.commit()
    return v


# ---------------- families ----------------
class ChildAdminOut(BaseModel):
    id: int
    name: str
    class_name: str
    school_id: int
    card_uid: str
    home_address: str
    home_lat: float | None
    home_lon: float | None
    active: bool
    parent_name: str
    parent_phone: str
    plan: str | None


class ChildPatch(BaseModel):
    class_name: str | None = None
    home_address: str | None = None
    home_lat: float | None = Field(default=None, ge=-90, le=90)
    home_lon: float | None = Field(default=None, ge=-180, le=180)
    active: bool | None = None


class ImportReport(BaseModel):
    parents_created: int
    children_created: int
    receivers_added: int
    rows_skipped: list[str]


@router.get("/families/template.csv", response_class=PlainTextResponse)
def csv_template(_: User = Ops):
    example = ["Funmi Adebayo", "0803 000 0100", "", "Tolu Adebayo", "Primary 3",
               "14 Admiralty Rd, Lekki Phase 1", "6.4430", "3.4800", "Mama Bisi", "Nanny", "0803 000 0104"]
    return ",".join(CSV_COLUMNS) + "\n" + ",".join(f'"{x}"' for x in example) + "\n"


@router.post("/families/import", response_model=ImportReport)
async def import_families(school_id: int, file: UploadFile = File(...), db: Session = Depends(get_db),
                          me: User = Ops):
    """One row per child. Parents are matched by phone, so siblings share one parent account.
    Extra approved adults can be added one per row (repeat the child with another receiver)."""
    if db.get(School, school_id) is None:
        raise HTTPException(404, "School not found")
    text = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    missing = {"parent_name", "parent_phone", "child_name"} - set(reader.fieldnames or [])
    if missing:
        raise HTTPException(422, f"CSV is missing columns: {', '.join(sorted(missing))}")
    parents = children = receivers = 0
    skipped: list[str] = []
    for n, row in enumerate(reader, start=2):
        row = {k: (v or "").strip() for k, v in row.items() if k}
        try:
            pphone = normalize(row["parent_phone"])
        except HTTPException:
            skipped.append(f"Row {n}: bad parent phone '{row.get('parent_phone')}'")
            continue
        if not row["parent_name"] or not row["child_name"]:
            skipped.append(f"Row {n}: parent_name and child_name are required")
            continue
        parent = db.scalar(select(User).where(User.phone == pphone))
        if parent is not None and parent.role != Role.parent:
            skipped.append(f"Row {n}: {pphone} belongs to a {parent.role} account")
            continue
        if parent is None:
            parent = User(name=row["parent_name"], phone=pphone, role=Role.parent,
                          email=row.get("parent_email") or None, password_hash=hash_password(secrets.token_urlsafe(24)))
            db.add(parent)
            db.flush()
            db.add(Receiver(parent_id=parent.id, name=parent.name, relationship_to_child="Parent", phone=pphone))
            parents += 1
        child = db.scalar(select(Child).where(Child.parent_id == parent.id, Child.name == row["child_name"]))
        if child is None:
            try:
                lat = float(row["home_lat"]) if row.get("home_lat") else None
                lon = float(row["home_lon"]) if row.get("home_lon") else None
            except ValueError:
                skipped.append(f"Row {n}: home_lat/home_lon must be numbers")
                continue
            child = Child(name=row["child_name"], class_name=row.get("class_name", ""), school_id=school_id,
                          parent_id=parent.id, card_uid=new_card_uid(), home_address=row.get("home_address", ""),
                          home_lat=lat, home_lon=lon)
            db.add(child)
            children += 1
        if row.get("receiver_name") and row.get("receiver_phone"):
            try:
                rphone = normalize(row["receiver_phone"])
            except HTTPException:
                skipped.append(f"Row {n}: bad receiver phone; child imported without this receiver")
                continue
            exists = db.scalar(select(Receiver.id).where(Receiver.parent_id == parent.id, Receiver.phone == rphone,
                                                         Receiver.active.is_(True)))
            if not exists:
                db.add(Receiver(parent_id=parent.id, name=row["receiver_name"],
                                relationship_to_child=row.get("receiver_relationship", ""), phone=rphone))
                receivers += 1
    safety.record(db, "families_imported", f"{me.name} imported {children} children, {parents} parents", actor=me)
    db.commit()
    return ImportReport(parents_created=parents, children_created=children, receivers_added=receivers,
                        rows_skipped=skipped)


def _child_out(db: Session, ch: Child) -> ChildAdminOut:
    plan = db.scalar(select(Booking.tier).where(Booking.child_id == ch.id, Booking.status == "active"))
    return ChildAdminOut(id=ch.id, name=ch.name, class_name=ch.class_name, school_id=ch.school_id,
                         card_uid=ch.card_uid, home_address=ch.home_address, home_lat=ch.home_lat,
                         home_lon=ch.home_lon, active=ch.active, parent_name=ch.parent.name,
                         parent_phone=ch.parent.phone, plan=plan)


@router.get("/children", response_model=list[ChildAdminOut])
def list_children(school_id: int | None = None, db: Session = Depends(get_db), _: User = Ops):
    q = select(Child).order_by(Child.name)
    if school_id:
        q = q.where(Child.school_id == school_id)
    return [_child_out(db, ch) for ch in db.scalars(q)]


@router.patch("/children/{child_id}", response_model=ChildAdminOut)
def update_child(child_id: int, body: ChildPatch, db: Session = Depends(get_db), _: User = Ops):
    ch = db.get(Child, child_id)
    if ch is None:
        raise HTTPException(404, "Child not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(ch, k, v)
    db.commit()
    return _child_out(db, ch)


class ManualBookingIn(BaseModel):
    child_id: int
    tier: Tier
    days: str = "mon,tue,wed,thu,fri"
    monthly_price: int = Field(ge=0)
    note: str = Field(min_length=3, description="e.g. 'Paid by school', 'Bank transfer ref 123'")


@router.post("/bookings", response_model=BookingOut, status_code=201)
def manual_booking(body: ManualBookingIn, db: Session = Depends(get_db), me: User = Ops):
    """For plans paid outside the app (school-sponsored, bank transfer, pilot free trial)."""
    ch = db.get(Child, body.child_id)
    if ch is None:
        raise HTTPException(404, "Child not found")
    b = Booking(child_id=ch.id, tier=body.tier, days=body.days, monthly_price=body.monthly_price,
                status="active", paid_at=datetime.now(UTC), payment_ref=f"MANUAL-{secrets.token_hex(5)}")
    db.add(b)
    safety.record(db, "manual_booking", f"{me.name} activated {body.tier} plan for {ch.name}: {body.note}",
                  child_id=ch.id, actor=me)
    db.commit()
    return b


# ---------------- routes and trips ----------------
class RouteIn(BaseModel):
    name: str = Field(min_length=2)
    school_id: int
    vehicle_id: int
    driver_id: int
    escort_id: int
    run: str = Field(default="afternoon", pattern="^(morning|afternoon)$")
    child_ids: list[int] = Field(description="In drop-off order")


class RouteOut(BaseModel):
    id: int
    name: str
    school_id: int
    vehicle_code: str
    driver_name: str
    escort_name: str
    run: str
    active: bool
    stops: list[dict]


def _route_out(r: Route) -> RouteOut:
    return RouteOut(id=r.id, name=r.name, school_id=r.school_id, vehicle_code=r.vehicle.code,
                    driver_name=r.driver.name, escort_name=r.escort.name, run=r.run, active=r.active,
                    stops=[{"order": s.stop_order, "child_id": s.child_id, "child_name": s.child.name,
                            "address": s.child.home_address} for s in r.stops])


def _validate_route(db: Session, body: RouteIn, route_id: int | None = None) -> None:
    if body.driver_id == body.escort_id:
        raise HTTPException(422, "Driver and escort must be two different people")
    for uid, need in ((body.driver_id, "driver"), (body.escort_id, "escort")):
        u = db.get(User, uid)
        if u is None or u.role != Role.crew:
            raise HTTPException(422, f"The {need} must be a crew member")
    v = db.get(Vehicle, body.vehicle_id)
    if v is None:
        raise HTTPException(404, "Vehicle not found")
    if len(body.child_ids) > v.seats:
        raise HTTPException(422, f"{v.code} has {v.seats} seats but the route has {len(body.child_ids)} children")
    if len(set(body.child_ids)) != len(body.child_ids):
        raise HTTPException(422, "A child appears twice on the route")
    clash = db.scalar(select(Route).where(Route.vehicle_id == body.vehicle_id, Route.run == body.run,
                                          Route.active.is_(True), Route.id != (route_id or 0)))
    if clash:
        raise HTTPException(409, f"{v.code} already runs '{clash.name}' on the {body.run} run")
    for cid in body.child_ids:
        ch = db.get(Child, cid)
        if ch is None or ch.school_id != body.school_id:
            raise HTTPException(422, f"Child {cid} is not at this school")


@router.get("/routes", response_model=list[RouteOut])
def routes(db: Session = Depends(get_db), _: User = Ops):
    return [_route_out(r) for r in db.scalars(select(Route).order_by(Route.name))]


@router.post("/routes", response_model=RouteOut, status_code=201)
def add_route(body: RouteIn, db: Session = Depends(get_db), _: User = Ops):
    _validate_route(db, body)
    r = Route(**body.model_dump(exclude={"child_ids"}))
    r.stops = [RouteStop(child_id=cid, stop_order=i) for i, cid in enumerate(body.child_ids, start=1)]
    db.add(r)
    db.commit()
    return _route_out(r)


@router.put("/routes/{route_id}", response_model=RouteOut)
def update_route(route_id: int, body: RouteIn, db: Session = Depends(get_db), _: User = Ops):
    r = db.get(Route, route_id)
    if r is None:
        raise HTTPException(404, "Route not found")
    _validate_route(db, body, route_id)
    for k, v in body.model_dump(exclude={"child_ids"}).items():
        setattr(r, k, v)
    r.stops = [RouteStop(child_id=cid, stop_order=i) for i, cid in enumerate(body.child_ids, start=1)]
    db.commit()
    return _route_out(r)


@router.delete("/routes/{route_id}", status_code=204)
def deactivate_route(route_id: int, db: Session = Depends(get_db), _: User = Ops):
    r = db.get(Route, route_id)
    if r is None:
        raise HTTPException(404, "Route not found")
    r.active = False
    db.commit()


class GenerateIn(BaseModel):
    run_date: date | None = None


@router.post("/trips/generate")
def generate(body: GenerateIn, db: Session = Depends(get_db), _: User = Ops):
    """Creates the day's trips from active routes. Safe to run more than once."""
    return generate_trips(db, body.run_date or today())


@router.get("/readiness")
def readiness(_: User = Ops, db: Session = Depends(get_db)):
    """Pilot readiness checklist for the ops dashboard."""
    from ..services.readiness import run_checks, summary
    return summary(run_checks(db))
