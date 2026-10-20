"""Pilot readiness checks: settings, outside services, database and set-up data.

Used by `python -m app.readiness` (command line) and GET /admin/readiness (ops dashboard).
"""
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta

import httpx
from cryptography.fernet import Fernet
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session

from ..config import DEV_SECRET, settings
from ..models import Booking, Child, Receiver, Role, Route, School, User, Vehicle

PASS, WARN, FAIL = "pass", "warn", "fail"


@dataclass
class Check:
    area: str
    name: str
    status: str
    detail: str
    fix: str = ""


def _settings_checks() -> list[Check]:
    c: list[Check] = []
    add = lambda *a: c.append(Check("Settings", *a))  # noqa: E731
    add("Production mode", PASS if settings.is_production else WARN,
        f"environment={settings.environment}",
        "Set LITTLEGO_ENVIRONMENT=production on the live server (turns on all safety guards).")
    strong = settings.jwt_secret != DEV_SECRET and len(settings.jwt_secret) >= 32
    add("Sign-in secret", PASS if strong else FAIL, "strong" if strong else "default or too short",
        "Set LITTLEGO_JWT_SECRET to 32+ random characters (Render can generate it).")
    try:
        if not settings.pin_encryption_key:
            raise ValueError("empty")
        Fernet(settings.pin_encryption_key.encode())
        add("PIN encryption key", PASS, "valid key set")
    except Exception:
        add("PIN encryption key", FAIL, "missing or invalid",
            "Generate one with python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\" "
            "and store a copy safely.")
    add("Allowed web origins", FAIL if settings.cors_origins.strip() == "*" else PASS, settings.cors_origins,
        "Set LITTLEGO_CORS_ORIGINS to your dashboard address, e.g. https://littlego-dashboard.onrender.com")
    phones = [p for p in settings.ops_alert_phones.split(",") if p.strip()]
    placeholder = any(p.strip() in ("+2348000000000",) for p in phones)
    add("Ops alert phones", FAIL if not phones or placeholder else PASS,
        f"{len(phones)} number(s)" + (" (placeholder)" if placeholder else ""),
        "Set LITTLEGO_OPS_ALERT_PHONES to the real phones that must receive every SOS.")
    return c


def _provider_checks(live: bool) -> list[Check]:
    c: list[Check] = []
    add = lambda *a: c.append(Check("Services", *a))  # noqa: E731
    sms = settings.sms_provider
    if sms == "console":
        add("SMS provider", FAIL, "console (messages are only printed, not sent)",
            "Open a Termii or Africa's Talking account; set LITTLEGO_SMS_PROVIDER and the API key.")
    else:
        key = settings.termii_api_key if sms == "termii" else settings.africastalking_api_key
        add("SMS provider", PASS if key else FAIL, f"{sms}, key {'set' if key else 'missing'}",
            f"Set the {sms} API key.")
        add("SMS sender ID", PASS if settings.sms_sender_id else FAIL, settings.sms_sender_id or "missing",
            "Register the sender ID (e.g. LittleGo) with your SMS provider; approval can take several days.")
        if sms == "termii":
            add("Termii DND channel", PASS if settings.termii_channel == "dnd" else WARN, settings.termii_channel,
                "Ask Termii support to enable DND, then set LITTLEGO_TERMII_CHANNEL=dnd. Without it many numbers miss PINs.")
    if settings.payment_provider == "mock":
        add("Payments", FAIL, "mock (every payment succeeds)", "Set LITTLEGO_PAYMENT_PROVIDER=paystack and the secret key.")
    else:
        k = settings.paystack_secret_key
        mode = "live" if k.startswith("sk_live_") else "test" if k.startswith("sk_test_") else "missing"
        add("Paystack key", {"live": PASS, "test": WARN, "missing": FAIL}[mode], f"{mode} key",
            "Use the test key for dry runs; switch to sk_live_ after Paystack business verification.")
        add("Paystack return page", PASS if settings.paystack_callback_url else WARN,
            settings.paystack_callback_url or "not set", f"Set LITTLEGO_PAYSTACK_CALLBACK_URL to {settings.public_api_url}/payments/return")
        add("Paystack webhook", WARN, f"must point to {settings.public_api_url}/payments/paystack/webhook",
            "Set this URL in Paystack → Settings → API Keys & Webhooks (cannot be checked from here).")
        if live and k:
            try:
                r = httpx.get("https://api.paystack.co/transaction", params={"perPage": 1},
                              headers={"Authorization": f"Bearer {k}"}, timeout=10)
                add("Paystack key works", PASS if r.status_code == 200 else FAIL, f"HTTP {r.status_code}",
                    "Check the secret key in the Paystack dashboard.")
            except httpx.HTTPError as exc:
                add("Paystack key works", FAIL, f"cannot reach Paystack: {exc}", "Check network access.")
    add("Live video", WARN, "placeholder stream", "Choose a mobile DVR vendor and connect its stream API (not needed for a dry run).")
    return c


def _database_checks(db: Session) -> list[Check]:
    c: list[Check] = []
    add = lambda *a: c.append(Check("Database", *a))  # noqa: E731
    url = settings.database_url
    add("Database type", PASS if url.startswith("postgresql") else FAIL,
        "PostgreSQL" if url.startswith("postgresql") else "SQLite (development only)",
        "Use the Render PostgreSQL connection string in LITTLEGO_DATABASE_URL.")
    try:
        db.execute(text("select 1"))
        has_version = "alembic_version" in inspect(db.get_bind()).get_table_names()
        add("Migrations applied", PASS if has_version else WARN,
            "alembic_version present" if has_version else "tables created without migrations",
            "Run alembic upgrade head (the Docker image does this on start).")
    except Exception as exc:
        add("Database reachable", FAIL, str(exc)[:120], "Check LITTLEGO_DATABASE_URL.")
    return c


def _data_checks(db: Session) -> list[Check]:
    c: list[Check] = []
    add = lambda *a: c.append(Check("Set-up data", *a))  # noqa: E731
    n = lambda q: db.scalar(select(func.count()).select_from(q.subquery()))  # noqa: E731

    ops = n(select(User).where(User.role == Role.ops, User.active.is_(True)))
    add("Ops accounts", PASS if ops >= 2 else WARN if ops == 1 else FAIL, f"{ops} active",
        "Create at least two ops users so someone always answers alerts (Schools & staff tab).")
    schools = db.scalars(select(School)).all()
    add("Schools", PASS if schools else FAIL, f"{len(schools)}", "Add the partner schools with their gate location.")
    for s in schools:
        staff = n(select(User).where(User.role == Role.school_admin, User.school_id == s.id, User.active.is_(True)))
        add(f"Gate staff at {s.name}", PASS if staff >= 2 else WARN if staff == 1 else FAIL, f"{staff}",
            "Add at least two staff who release children at the gate (cover for absence).")
    vehicles = db.scalars(select(Vehicle)).all()
    add("Vehicles", PASS if vehicles else FAIL, f"{len(vehicles)}", "Add vehicles in the Vehicles tab.")
    no_cams = [v.code for v in vehicles if v.camera_count == 0]
    if no_cams:
        add("Cameras fitted", FAIL, ", ".join(no_cams) + " have no cameras", "Fit cameras before carrying children.")
    soon = (datetime.now(UTC) + timedelta(days=30)).date()
    crew = db.scalars(select(User).where(User.role == Role.crew, User.active.is_(True))).all()
    vetted = [u for u in crew if u.vetted_at and (u.vetting_expires_at is None or u.vetting_expires_at >= datetime.now(UTC).date())]
    add("Vetted crew", PASS if len(vetted) >= 2 else FAIL, f"{len(vetted)} of {len(crew)} active crew",
        "Record vetting evidence and expiry for every driver and escort (Crew tab).")
    no_expiry = [u.name for u in vetted if u.vetting_expires_at is None]
    if no_expiry:
        add("Vetting expiry dates", WARN, f"{len(no_expiry)} without expiry", "Set a renewal date for each person (usually 12 months).")
    expiring = [u.name for u in vetted if u.vetting_expires_at and u.vetting_expires_at <= soon]
    if expiring:
        add("Vetting renewals due", WARN, ", ".join(expiring), "Renew these checks within 30 days.")
    routes = db.scalars(select(Route).where(Route.active.is_(True))).all()
    add("Routes", PASS if routes else FAIL, f"{len(routes)} active", "Build routes in the Routes tab.")
    for r in routes:
        problems = []
        for p in (r.driver, r.escort):
            if p not in vetted:
                problems.append(f"{p.name} not vetted/active")
        if len(r.stops) > r.vehicle.seats:
            problems.append("more children than seats")
        if not r.stops:
            problems.append("no stops")
        add(f"Route: {r.name}", FAIL if problems else PASS, "; ".join(problems) or f"{len(r.stops)} stops, crew cleared",
            "Fix the crew or stops on this route.")
    children = db.scalars(select(Child).where(Child.active.is_(True))).all()
    add("Children enrolled", PASS if children else FAIL, f"{len(children)}", "Import families (Families tab).")
    if children:
        no_loc = [ch for ch in children if ch.home_lat is None]
        add("Home locations", PASS if not no_loc else WARN, f"{len(children) - len(no_loc)} of {len(children)} set",
            "Set missing home locations so route-deviation alerts work.")
        paid = {b.child_id for b in db.scalars(select(Booking).where(Booking.status == "active"))}
        unpaid = [ch for ch in children if ch.id not in paid]
        add("Active plans", PASS if not unpaid else WARN, f"{len(children) - len(unpaid)} of {len(children)} paid",
            "Children without an active plan are left off daily trips.")
        on_route = {s.child_id for r in routes for s in r.stops}
        orphan = [ch for ch in children if ch.id in paid and ch.id not in on_route]
        if orphan:
            add("Paid children without a route", WARN, ", ".join(ch.name for ch in orphan[:5]) + ("…" if len(orphan) > 5 else ""),
                "Add them to a route, or they will not be picked up.")
        parents = {ch.parent_id for ch in children}
        with_receivers = {r.parent_id for r in db.scalars(select(Receiver).where(Receiver.active.is_(True)))}
        missing = parents - with_receivers
        add("Approved adults", PASS if not missing else FAIL, f"{len(parents) - len(missing)} of {len(parents)} families",
            "Every family needs at least one approved adult for handover.")
    return c


def run_checks(db: Session, live: bool = False) -> list[Check]:
    return _settings_checks() + _provider_checks(live) + _database_checks(db) + _data_checks(db)


def summary(checks: list[Check]) -> dict:
    counts = {s: sum(1 for c in checks if c.status == s) for s in (PASS, WARN, FAIL)}
    return {"ready": counts[FAIL] == 0, "counts": counts, "checks": [asdict(c) for c in checks]}
