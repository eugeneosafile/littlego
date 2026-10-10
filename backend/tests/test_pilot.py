"""Tests for pilot features: SMS codes, providers, Paystack, admin set-up, trip generation, USSD."""
import hashlib
import hmac
import json
from datetime import UTC, date, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models import Booking, Event, Notification, OtpCode, Trip, TripChild, User
from app.services import providers
from app.services.phone import normalize
from app.services.scheduling import generate_trips


def _last_sms(phone: str) -> str:
    with SessionLocal() as s:
        return s.scalars(select(Notification.message).where(Notification.to_phone == phone)
                         .order_by(Notification.id.desc())).first()


# ---------------- phone numbers ----------------
@pytest.mark.parametrize("raw", ["08031234567", "0803 123 4567", "+2348031234567", "2348031234567", "8031234567"])
def test_phone_normalization(raw):
    assert normalize(raw) == "+2348031234567"


# ---------------- SMS one-time codes ----------------
def test_otp_sign_in(client, data):
    r = client.post("/auth/otp/request", json={"phone": "0803 000 0100"})
    assert r.status_code == 202
    code = _last_sms("+2348030000100").split("code is ")[1][:6]
    with SessionLocal() as s:
        assert s.scalars(select(OtpCode)).first().code_hash != code  # only a hash is stored
    r = client.post("/auth/otp/verify", json={"phone": "08030000100", "code": code})
    assert r.status_code == 200 and r.json()["user"]["role"] == "parent"
    # single use
    assert client.post("/auth/otp/verify", json={"phone": "08030000100", "code": code}).status_code == 401


def test_otp_unknown_number_gets_same_answer_and_no_sms(client, data):
    r = client.post("/auth/otp/request", json={"phone": "08099999999"})
    assert r.status_code == 202
    assert _last_sms("+2348099999999") is None


def test_otp_wrong_code_limit_and_request_rate_limit(client, data):
    client.post("/auth/otp/request", json={"phone": "08030000100"})
    for _ in range(settings.otp_max_attempts):
        assert client.post("/auth/otp/verify", json={"phone": "08030000100", "code": "000000"}).status_code == 401
    assert client.post("/auth/otp/verify", json={"phone": "08030000100", "code": "000000"}).status_code == 429
    client.post("/auth/otp/request", json={"phone": "08030000100"})
    client.post("/auth/otp/request", json={"phone": "08030000100"})
    assert client.post("/auth/otp/request", json={"phone": "08030000100"}).status_code == 429


def test_expired_code_rejected(client, data):
    client.post("/auth/otp/request", json={"phone": "08030000100"})
    code = _last_sms("+2348030000100").split("code is ")[1][:6]
    with SessionLocal() as s:
        otp = s.scalars(select(OtpCode)).first()
        otp.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        s.commit()
    assert client.post("/auth/otp/verify", json={"phone": "08030000100", "code": code}).status_code == 401


def test_password_login_rate_limited(client, data):
    for _ in range(settings.login_max_attempts_per_15min):
        client.post("/auth/login", json={"phone": "08030000001", "password": "wrong"})
    assert client.post("/auth/login", json={"phone": "08030000001", "password": "wardride123"}).status_code == 429


def test_deactivated_user_is_locked_out(client, data, as_parent):
    with SessionLocal() as s:
        s.get(User, data["funmi"]).active = False
        s.commit()
    assert client.get("/auth/me", headers=as_parent).status_code == 401


# ---------------- providers (no network: mocked HTTP) ----------------
def _client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_termii_request_shape(monkeypatch):
    monkeypatch.setattr(settings, "termii_api_key", "TK")
    seen = {}

    def handler(req: httpx.Request):
        seen["url"], seen["body"] = str(req.url), json.loads(req.content)
        return httpx.Response(200, json={"code": "ok", "message_id": "9122", "message": "Successfully Sent"})

    ref = providers.TermiiSms(_client(handler)).send("+2348031234567", "hello")
    assert ref == "9122" and seen["url"].endswith("/api/sms/send")
    assert seen["body"] == {"api_key": "TK", "to": "2348031234567", "from": "WardRide", "sms": "hello",
                            "type": "plain", "channel": "dnd"}


def test_termii_error_raises(monkeypatch):
    monkeypatch.setattr(settings, "termii_api_key", "TK")
    sms = providers.TermiiSms(_client(lambda r: httpx.Response(400, json={"message": "Insufficient balance"})))
    with pytest.raises(providers.ProviderError, match="Insufficient balance"):
        sms.send("+2348031234567", "hi")


def test_africastalking_request_shape(monkeypatch):
    monkeypatch.setattr(settings, "africastalking_api_key", "AK")
    seen = {}

    def handler(req: httpx.Request):
        seen["req"] = req
        return httpx.Response(201, json={"SMSMessageData": {"Recipients": [
            {"status": "Success", "messageId": "ATX-1", "number": "+2348031234567"}]}})

    assert providers.AfricasTalkingSms(_client(handler)).send("+2348031234567", "hi") == "ATX-1"
    assert seen["req"].headers["apiKey"] == "AK"
    assert "sandbox" in str(seen["req"].url)
    assert b"to=%2B2348031234567" in seen["req"].content


def test_sms_failure_never_blocks_boarding(client, data, as_driver, as_school, monkeypatch):
    class Broken:
        def send(self, phone, message):
            raise providers.ProviderError("network down")

    monkeypatch.setattr("app.services.safety.sms", lambda: Broken())
    client.post(f"/crew/trips/{data['trip_bus']}/start", headers=as_driver)
    client.post("/school/release", json={"card_uid": "CARD-TOLU"}, headers=as_school)
    r = client.post(f"/crew/trips/{data['trip_bus']}/board", json={"card_uid": "CARD-TOLU"}, headers=as_driver)
    assert r.status_code == 200
    with SessionLocal() as s:
        assert s.scalars(select(Notification).where(Notification.provider_ref == "FAILED")).first()


def test_paystack_initialize_and_verify(monkeypatch):
    monkeypatch.setattr(settings, "paystack_secret_key", "sk_test_x")

    def handler(req: httpx.Request):
        assert req.headers["Authorization"] == "Bearer sk_test_x"
        if req.url.path.endswith("/initialize"):
            body = json.loads(req.content)
            assert body["amount"] == "4500000" and body["email"] == "a@b.ng" and "ussd" in body["channels"]
            return httpx.Response(200, json={"status": True, "data": {
                "authorization_url": "https://checkout.paystack.com/abc", "reference": body["reference"]}})
        return httpx.Response(200, json={"status": True, "data": {"status": "success", "amount": 4500000}})

    ps = providers.PaystackPayments(_client(handler))
    co = ps.create_checkout(45_000, "a@b.ng", "WR-1-abc", {"booking_id": 1})
    assert co.checkout_url.startswith("https://checkout.paystack.com") and not co.paid
    assert ps.verify("WR-1-abc") == (True, 4500000)


def _signed(body: dict, key: str = "sk_test_x"):
    raw = json.dumps(body).encode()
    return raw, hmac.new(key.encode(), raw, hashlib.sha512).hexdigest()


def test_paystack_webhook_activates_booking(client, data, as_parent, monkeypatch):
    monkeypatch.setattr(settings, "payment_provider", "paystack")
    monkeypatch.setattr(settings, "paystack_secret_key", "sk_test_x")
    with SessionLocal() as s:
        b = Booking(child_id=data["tolu"], tier="exclusive", monthly_price=240_000, payment_ref="WR-99-ab12")
        s.add(b)
        s.commit()
        bid = b.id
    event = {"event": "charge.success", "data": {"reference": "WR-99-ab12", "amount": 24_000_000, "status": "success"}}
    raw, sig = _signed(event)
    # forged signature refused
    assert client.post("/payments/paystack/webhook", content=raw, headers={"x-paystack-signature": "bad"}).status_code == 401
    r = client.post("/payments/paystack/webhook", content=raw, headers={"x-paystack-signature": sig})
    assert r.status_code == 200
    with SessionLocal() as s:
        assert s.get(Booking, bid).status == "active"
    assert "payment received" in _last_sms("+2348030000100")


def test_paystack_underpayment_does_not_activate(client, data, monkeypatch):
    monkeypatch.setattr(settings, "payment_provider", "paystack")
    monkeypatch.setattr(settings, "paystack_secret_key", "sk_test_x")
    with SessionLocal() as s:
        s.add(Booking(child_id=data["tolu"], tier="shared", monthly_price=45_000, payment_ref="WR-98-cd34"))
        s.commit()
    raw, sig = _signed({"event": "charge.success", "data": {"reference": "WR-98-cd34", "amount": 100}})
    client.post("/payments/paystack/webhook", content=raw, headers={"x-paystack-signature": sig})
    with SessionLocal() as s:
        assert s.scalar(select(Booking.status).where(Booking.payment_ref == "WR-98-cd34")) == "pending_payment"


# ---------------- PIN encryption ----------------
def test_handover_pin_is_encrypted_at_rest(client, data, as_driver, as_school):
    client.post(f"/crew/trips/{data['trip_bus']}/start", headers=as_driver)
    client.post("/school/release", json={"card_uid": "CARD-TOLU"}, headers=as_school)
    tcid = client.post(f"/crew/trips/{data['trip_bus']}/board", json={"card_uid": "CARD-TOLU"},
                       headers=as_driver).json()["id"]
    with SessionLocal() as s:
        tc = s.get(TripChild, tcid)
        assert len(tc.pin) == 4 and tc.pin not in tc.pin_enc and len(tc.pin_enc) > 40


# ---------------- admin set-up ----------------
CSV = """parent_name,parent_phone,parent_email,child_name,class_name,home_address,home_lat,home_lon,receiver_name,receiver_relationship,receiver_phone
Ada Eze,0803 111 2222,,Obi Eze,Primary 2,1 Bourdillon Rd,6.4500,3.4300,Auntie Ngo,Aunt,0803 111 3333
Ada Eze,08031112222,,Ife Eze,Primary 4,1 Bourdillon Rd,6.4500,3.4300,,,
Bad Row,12345,,Nope,,,,,,,
"""


def test_family_csv_import(client, data, as_ops):
    r = client.post(f"/admin/families/import?school_id={data['school']}", headers=as_ops,
                    files={"file": ("families.csv", CSV, "text/csv")})
    assert r.status_code == 200, r.text
    rep = r.json()
    assert rep["parents_created"] == 1 and rep["children_created"] == 2 and rep["receivers_added"] == 1
    assert len(rep["rows_skipped"]) == 1 and "bad parent phone" in rep["rows_skipped"][0]
    # importing again changes nothing
    again = client.post(f"/admin/families/import?school_id={data['school']}", headers=as_ops,
                        files={"file": ("families.csv", CSV, "text/csv")}).json()
    assert again["children_created"] == 0 and again["parents_created"] == 0
    kids = [c for c in client.get("/admin/children", headers=as_ops).json() if c["name"].endswith("Eze")]
    assert len(kids) == 2 and all(c["card_uid"].startswith("WR") for c in kids)


def test_crew_vetting_requires_evidence_and_expiry_blocks_trips(client, data, as_ops, as_driver):
    new = client.post("/admin/crew", headers=as_ops,
                      json={"name": "Ade Ola", "phone": "08035550000", "crew_role": "driver"}).json()
    assert new["vetted_at"] is None
    assert client.patch(f"/admin/crew/{new['id']}", headers=as_ops, json={"vetted": True}).status_code == 422
    ok = client.patch(f"/admin/crew/{new['id']}", headers=as_ops,
                      json={"vetted": True, "vetting_notes": "Police ref LG/123; guarantor; first aid 2026-10-01",
                            "vetting_expires_at": "2027-10-01"})
    assert ok.status_code == 200 and ok.json()["vetted_at"]
    # Expired vetting stops a trip from starting
    client.patch(f"/admin/crew/{data['musa']}", headers=as_ops,
                 json={"vetting_expires_at": (date.today() - timedelta(days=1)).isoformat()})
    r = client.post(f"/crew/trips/{data['trip_bus']}/start", headers=as_driver)
    assert r.status_code == 400 and "expired" in r.json()["detail"]


def test_route_validation(client, data, as_ops):
    base = {"name": "Test", "school_id": data["school"], "vehicle_id": data["van"], "driver_id": data["musa"],
            "escort_id": data["musa"], "run": "morning", "child_ids": [data["tolu"]]}
    assert client.post("/admin/routes", headers=as_ops, json=base).status_code == 422  # same person twice
    base["escort_id"] = data["grace"]
    base["run"] = "afternoon"
    assert client.post("/admin/routes", headers=as_ops, json=base).status_code == 409  # van already on afternoon run
    base["run"] = "morning"
    assert client.post("/admin/routes", headers=as_ops, json=base).status_code == 201


def test_generate_trips_respects_paid_plans_and_days(data):
    next_monday = date.today() + timedelta(days=(7 - date.today().weekday()))
    with SessionLocal() as s:
        s.scalars(select(Booking).where(Booking.child_id == data["amina"])).first().status = "cancelled"
        s.commit()
        rep = generate_trips(s, next_monday)
        assert len(rep.created) == 2
        assert any("Amina" in x and "no active paid plan" in x for x in rep.skipped_children)
        trip = s.scalar(select(Trip).where(Trip.route_id == data["route_bus"], Trip.run_date == next_monday))
        assert [tc.child.name for tc in trip.children] == ["Chidera Okeke", "Tolu Adebayo"]
        assert [tc.stop_order for tc in trip.children] == [1, 2]
        # running again is safe
        assert generate_trips(s, next_monday).already_existed == ["Lekki Phase 1 bus", "Nursery van"]
        # no school-day plans on Sunday
        assert generate_trips(s, next_monday + timedelta(days=6)).created == []


def test_admin_is_ops_only(client, data, as_school):
    assert client.get("/admin/vehicles", headers=as_school).status_code == 403


# ---------------- USSD and watchdog ----------------
def test_ussd_status(client, data, as_driver, as_school):
    client.post(f"/crew/trips/{data['trip_bus']}/start", headers=as_driver)
    client.post("/school/release", json={"card_uid": "CARD-TOLU"}, headers=as_school)
    client.post(f"/crew/trips/{data['trip_bus']}/board", json={"card_uid": "CARD-TOLU"}, headers=as_driver)
    menu = client.post("/ussd", data={"phoneNumber": "+2348030000100", "text": "", "sessionId": "s"}).text
    assert menu.startswith("CON")
    status = client.post("/ussd", data={"phoneNumber": "+2348030000100", "text": "1", "sessionId": "s"}).text
    assert status.startswith("END") and "Tolu: on board (WR-14) PIN" in status and "Kemi: in school" in status
    stranger = client.post("/ussd", data={"phoneNumber": "+2348099999999", "text": ""}).text
    assert "not registered" in stranger


def test_stale_location_alert(client, data, as_driver):
    from app.services.safety import check_stale_locations
    client.post(f"/crew/trips/{data['trip_bus']}/start", headers=as_driver)
    with SessionLocal() as s:
        s.get(Trip, data["trip_bus"]).started_at = datetime.now(UTC) - timedelta(minutes=20)
        s.commit()
        assert len(check_stale_locations(s)) == 1
        s.commit()
        assert check_stale_locations(s) == []  # not repeated
        assert s.scalars(select(Event).where(Event.kind == "location_stale")).first().severity == "warning"


def test_production_settings_refuse_unsafe_defaults():
    from app.config import Settings
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings(environment="production")
