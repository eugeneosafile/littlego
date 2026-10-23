"""Website waitlist: the public form endpoint and the ops view."""
from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import WaitlistSignup

GOOD = {
    "full_name": "  Ada   Okafor ", "email": "Ada@Example.com", "phone": "0803 123 4567",
    "area": "lagos_lekki_ajah", "journeys": ["school", "school", "lessons"], "start_window": "asap",
    "consent": True, "consent_text": "Email me launch updates.", "source": "littlego.ng",
    "website": "", "elapsed_ms": 9000,
}


def _post(client, body, ip="1.1.1.1"):
    return client.post("/public/waitlist", json=body, headers={"x-forwarded-for": ip})


def _count():
    with SessionLocal() as s:
        return s.scalar(select(func.count()).select_from(WaitlistSignup))


def test_signup_is_saved_normalised(client):
    r = _post(client, GOOD)
    assert r.status_code == 201, r.text
    with SessionLocal() as s:
        row = s.scalars(select(WaitlistSignup)).one()
        assert row.email == "ada@example.com"
        assert row.full_name == "Ada Okafor"
        assert row.journeys == "school,lessons"
        assert row.phone == "08031234567"
        assert row.ip_hash and "1.1.1.1" not in row.ip_hash


def test_repeat_email_updates_one_row_with_same_reply(client):
    assert _post(client, GOOD).status_code == 201
    r = _post(client, {**GOOD, "email": "ada@example.com", "area": "lagos_ikeja"}, ip="2.2.2.2")
    assert r.status_code == 201 and r.json() == {"ok": True}
    assert _count() == 1
    with SessionLocal() as s:
        assert s.scalars(select(WaitlistSignup)).one().area == "lagos_ikeja"


def test_validation_errors_use_form_field_names(client):
    r = _post(client, {**GOOD, "email": "bad", "journeys": [], "consent": False, "area": "mars"})
    assert r.status_code == 422
    assert {"email", "journeys", "consent", "area"} <= set(r.json()["errors"])
    assert _count() == 0


def test_no_child_or_address_fields_are_stored(client):
    _post(client, {**GOOD, "child_name": "Tolu", "school": "Grace", "address": "12 Admiralty Way"})
    columns = set(WaitlistSignup.__table__.columns.keys())
    assert not columns & {"child_name", "school", "address"}


def test_spam_traps_store_nothing(client):
    assert _post(client, {**GOOD, "website": "http://spam"}).status_code == 201
    assert _post(client, {**GOOD, "email": "fast@x.com", "elapsed_ms": 200}).status_code == 201
    assert _count() == 0


def test_rate_limit_per_address(client):
    codes = [_post(client, {**GOOD, "email": f"r{i}@x.com"}, ip="9.9.9.9").status_code for i in range(6)]
    assert codes[:5] == [201] * 5 and codes[5] == 429


def test_malformed_body(client):
    r = client.post("/public/waitlist", content="not json", headers={"content-type": "application/json"})
    assert r.status_code == 422


def test_ops_can_list_and_export(client, as_ops):
    _post(client, GOOD)
    _post(client, {**GOOD, "email": "b@x.com", "area": "abuja", "journeys": ["sports_clubs"]}, ip="3.3.3.3")
    r = client.get("/ops/waitlist", headers=as_ops)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    assert body["by_area"] == {"lagos_lekki_ajah": 1, "abuja": 1}
    assert body["by_journey"]["school"] == 1
    csv = client.get("/ops/waitlist.csv", headers=as_ops)
    assert csv.status_code == 200 and csv.headers["content-type"].startswith("text/csv")
    assert "ada@example.com" in csv.text and "b@x.com" in csv.text


def test_waitlist_is_ops_only(client, as_parent, as_school):
    assert client.get("/ops/waitlist").status_code in (401, 403)
    assert client.get("/ops/waitlist", headers=as_parent).status_code == 403
    assert client.get("/ops/waitlist.csv", headers=as_school).status_code == 403
