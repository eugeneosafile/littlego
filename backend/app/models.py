"""Database models.

Safety-relevant design notes:
- A Trip carries exactly one driver and one escort. No other adult can be attached to a trip.
- TripChild tracks each child's journey: scheduled -> released -> on_board -> handed_over
  (or at_safe_hub when no approved adult is present).
- Event is the audit log: every release, boarding, handover, SOS, alert and video access is recorded.
"""
from datetime import UTC, date, datetime
from enum import StrEnum

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base
from .services.crypto import decrypt, encrypt


def now() -> datetime:
    return datetime.now(UTC)


class Role(StrEnum):
    parent = "parent"
    crew = "crew"
    school_admin = "school_admin"
    ops = "ops"


class Tier(StrEnum):
    shared = "shared"
    group = "group"
    exclusive = "exclusive"


class ChildStatus(StrEnum):
    scheduled = "scheduled"
    released = "released"
    on_board = "on_board"
    handed_over = "handed_over"
    at_safe_hub = "at_safe_hub"
    absent = "absent"


class TripStatus(StrEnum):
    scheduled = "scheduled"
    in_progress = "in_progress"
    completed = "completed"


class Severity(StrEnum):
    info = "info"
    warning = "warning"
    critical = "critical"


class School(Base):
    __tablename__ = "schools"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(String(300), default="")
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    safe_hub_name: Mapped[str] = mapped_column(String(200), default="School safe hub")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    role: Mapped[Role] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Crew only: background checks and training. Unvetted or expired crew cannot run trips.
    crew_role: Mapped[str | None] = mapped_column(String(20), nullable=True)  # driver | escort
    vetted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    vetting_expires_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    vetting_notes: Mapped[str] = mapped_column(Text, default="")  # police check ref, guarantor, training
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Child(Base):
    __tablename__ = "children"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    class_name: Mapped[str] = mapped_column(String(50), default="")
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"))
    parent_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    card_uid: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # NFC / QR id
    home_address: Mapped[str] = mapped_column(String(300), default="")
    home_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    home_lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    parent: Mapped[User] = relationship()
    school: Mapped[School] = relationship()


class Receiver(Base):
    """An adult the parent has approved to receive their children at drop-off."""
    __tablename__ = "receivers"
    id: Mapped[int] = mapped_column(primary_key=True)
    parent_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    relationship_to_child: Mapped[str] = mapped_column(String(60), default="")
    phone: Mapped[str] = mapped_column(String(20))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Vehicle(Base):
    __tablename__ = "vehicles"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)  # e.g. LG-14
    plate: Mapped[str] = mapped_column(String(20))
    kind: Mapped[Tier] = mapped_column(String(20))
    seats: Mapped[int] = mapped_column(Integer)
    camera_count: Mapped[int] = mapped_column(Integer, default=3)
    cameras_online: Mapped[int] = mapped_column(Integer, default=3)


class Booking(Base):
    __tablename__ = "bookings"
    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"))
    tier: Mapped[Tier] = mapped_column(String(20))
    days: Mapped[str] = mapped_column(String(40), default="mon,tue,wed,thu,fri")
    pickup_time: Mapped[str] = mapped_column(String(5), default="14:45")
    monthly_price: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="pending_payment")  # pending_payment|active|cancelled
    payment_ref: Mapped[str | None] = mapped_column(String(80), nullable=True, unique=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    child: Mapped[Child] = relationship()


class Trip(Base):
    __tablename__ = "trips"
    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"))
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"))
    route_id: Mapped[int | None] = mapped_column(ForeignKey("routes.id"), nullable=True)
    driver_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    escort_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    run_date: Mapped[date] = mapped_column(Date)
    run: Mapped[str] = mapped_column(String(20), default="afternoon")
    status: Mapped[TripStatus] = mapped_column(String(20), default=TripStatus.scheduled)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_ping_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    vehicle: Mapped[Vehicle] = relationship()
    school: Mapped[School] = relationship()
    driver: Mapped[User] = relationship(foreign_keys=[driver_id])
    escort: Mapped[User] = relationship(foreign_keys=[escort_id])
    children: Mapped[list["TripChild"]] = relationship(back_populates="trip", order_by="TripChild.stop_order")


class TripChild(Base):
    __tablename__ = "trip_children"
    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id"), index=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    stop_order: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[ChildStatus] = mapped_column(String(20), default=ChildStatus.scheduled)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    released_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    boarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    handed_over_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    handed_over_to_id: Mapped[int | None] = mapped_column(ForeignKey("receivers.id"), nullable=True)
    # One-time handover PIN, encrypted at rest (see services/crypto.py). Cleared after handover.
    pin_enc: Mapped[str | None] = mapped_column(String(200), nullable=True)

    @property
    def pin(self) -> str | None:
        return decrypt(self.pin_enc)

    @pin.setter
    def pin(self, value: str | None) -> None:
        self.pin_enc = encrypt(value) if value else None
    pin_attempts: Mapped[int] = mapped_column(Integer, default=0)
    pin_locked: Mapped[bool] = mapped_column(Boolean, default=False)

    trip: Mapped[Trip] = relationship(back_populates="children")
    child: Mapped[Child] = relationship()
    handed_over_to: Mapped[Receiver | None] = relationship()


class Event(Base):
    """Audit log and alert feed."""
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(40), index=True)
    severity: Mapped[Severity] = mapped_column(String(10), default=Severity.info)
    message: Mapped[str] = mapped_column(Text)
    trip_id: Mapped[int | None] = mapped_column(ForeignKey("trips.id"), nullable=True, index=True)
    child_id: Mapped[int | None] = mapped_column(ForeignKey("children.id"), nullable=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True, index=True)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class Notification(Base):
    """Outbox of every message sent (SMS, WhatsApp, push). Useful for audit and for tests."""
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    to_phone: Mapped[str] = mapped_column(String(20), index=True)
    channel: Mapped[str] = mapped_column(String(20), default="sms")
    message: Mapped[str] = mapped_column(Text)
    provider_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class LocationPing(Base):
    __tablename__ = "location_pings"
    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id"), index=True)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    speed_kmh: Mapped[float] = mapped_column(Float, default=0)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class OtpCode(Base):
    """One-time sign-in codes sent by SMS. Only a hash of the code is stored."""
    __tablename__ = "otp_codes"
    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(20), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class Route(Base):
    """A standing route: vehicle, crew and ordered stops. Daily trips are generated from routes."""
    __tablename__ = "routes"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"))
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"))
    driver_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    escort_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    run: Mapped[str] = mapped_column(String(20), default="afternoon")  # morning | afternoon
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    school: Mapped[School] = relationship()
    vehicle: Mapped[Vehicle] = relationship()
    driver: Mapped[User] = relationship(foreign_keys=[driver_id])
    escort: Mapped[User] = relationship(foreign_keys=[escort_id])
    stops: Mapped[list["RouteStop"]] = relationship(back_populates="route", order_by="RouteStop.stop_order",
                                                    cascade="all, delete-orphan")


class RouteStop(Base):
    __tablename__ = "route_stops"
    id: Mapped[int] = mapped_column(primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"), index=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"))
    stop_order: Mapped[int] = mapped_column(Integer)

    route: Mapped[Route] = relationship(back_populates="stops")
    child: Mapped[Child] = relationship()


class WaitlistSignup(Base):
    """Early-access interest from the littlego.ng website.

    Deliberately minimal: no child names, schools or home addresses are ever collected.
    """
    __tablename__ = "waitlist_signups"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    area: Mapped[str] = mapped_column(String(40), index=True)
    journeys: Mapped[str] = mapped_column(String(80))  # comma separated: school,lessons,sports_clubs,other
    start_window: Mapped[str | None] = mapped_column(String(20), nullable=True)
    consent_text: Mapped[str] = mapped_column(String(400))
    consent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    source: Mapped[str | None] = mapped_column(String(80), nullable=True)
    utm_source: Mapped[str | None] = mapped_column(String(80), nullable=True)
    utm_medium: Mapped[str | None] = mapped_column(String(80), nullable=True)
    utm_campaign: Mapped[str | None] = mapped_column(String(80), nullable=True)
    ip_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    unsubscribed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
