from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import ChildStatus, Tier


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginIn(BaseModel):
    phone: str
    password: str


class UserOut(ORM):
    id: int
    name: str
    phone: str
    role: str
    school_id: int | None = None
    crew_role: str | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class SchoolOut(ORM):
    id: int
    name: str
    address: str
    lat: float
    lon: float
    safe_hub_name: str


class ChildOut(ORM):
    id: int
    name: str
    class_name: str
    school_id: int
    home_address: str
    home_lat: float | None = None
    home_lon: float | None = None


class ReceiverIn(BaseModel):
    name: str = Field(min_length=2)
    relationship_to_child: str = ""
    phone: str = Field(min_length=7)


class ReceiverOut(ORM):
    id: int
    name: str
    relationship_to_child: str
    phone: str
    active: bool


class VehicleOut(ORM):
    id: int
    code: str
    plate: str
    kind: str
    seats: int
    camera_count: int
    cameras_online: int


class CrewOut(ORM):
    id: int
    name: str
    crew_role: str | None
    vetted_at: datetime | None


class TripChildOut(ORM):
    id: int
    child: ChildOut
    stop_order: int
    status: ChildStatus
    released_at: datetime | None
    boarded_at: datetime | None
    handed_over_at: datetime | None
    pin_locked: bool


class TripOut(ORM):
    id: int
    run_date: date
    run: str
    status: str
    started_at: datetime | None
    ended_at: datetime | None
    last_lat: float | None
    last_lon: float | None
    last_ping_at: datetime | None
    vehicle: VehicleOut
    school: SchoolOut
    driver: CrewOut
    escort: CrewOut
    children: list[TripChildOut]


class ParentTripView(BaseModel):
    """What a parent sees: their own children only, never other families' details."""
    trip_id: int
    vehicle: VehicleOut
    status: str
    driver: CrewOut
    escort: CrewOut
    last_lat: float | None
    last_lon: float | None
    last_ping_at: datetime | None
    school_lat: float
    school_lon: float
    my_children: list[TripChildOut]
    handover_pins: dict[int, str]  # trip_child_id -> PIN, only while on board
    timeline: list["EventOut"]


class EventOut(ORM):
    id: int
    kind: str
    severity: str
    message: str
    trip_id: int | None
    child_id: int | None
    resolved: bool
    created_at: datetime


class BookingIn(BaseModel):
    child_id: int
    tier: Tier
    days: str = "mon,tue,wed,thu,fri"
    pickup_time: str = Field(default="14:45", pattern=r"^\d{2}:\d{2}$")


class BookingOut(ORM):
    id: int
    child_id: int
    tier: str
    days: str
    pickup_time: str
    monthly_price: int
    status: str
    payment_ref: str | None


class CheckoutOut(BaseModel):
    booking: BookingOut
    checkout_url: str


class CardIn(BaseModel):
    card_uid: str


class HandoverIn(BaseModel):
    trip_child_id: int
    receiver_id: int
    pin: str = Field(pattern=r"^\d{4}$")


class TripChildRef(BaseModel):
    trip_child_id: int


class PingIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    speed_kmh: float = Field(default=0, ge=0)


class SosIn(BaseModel):
    note: str = ""


class StreamOut(BaseModel):
    url: str
    cameras: list[str]
    bitrate_kbps: int
    expires_in_s: int
    low_data: bool


class PriceOut(BaseModel):
    tier: str
    monthly_price: int


ParentTripView.model_rebuild()
