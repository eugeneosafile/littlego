"""Tests for the safety rules. These are the behaviours parents are trusting us with."""
from sqlalchemy import select

from app.db import SessionLocal
from app.models import Event, Notification, Trip, TripChild


def _start(client, h, trip_id):
    r = client.post(f"/crew/trips/{trip_id}/start", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def _release(client, h, card):
    r = client.post("/school/release", json={"card_uid": card}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def _board(client, h, trip_id, card):
    return client.post(f"/crew/trips/{trip_id}/board", json={"card_uid": card}, headers=h)


def _tolu_on_board(client, data, as_driver, as_school):
    trip = data["trip_bus"]
    _start(client, as_driver, trip)
    _release(client, as_school, "CARD-TOLU")
    r = _board(client, as_driver, trip, "CARD-TOLU")
    assert r.status_code == 200, r.text
    return trip, r.json()["id"]


def _pin(trip_child_id):
    with SessionLocal() as s:
        return s.get(TripChild, trip_child_id).pin


def _receivers(client, h, trip, tcid):
    r = client.get(f"/crew/trips/{trip}/children/{tcid}/receivers", headers=h)
    assert r.status_code == 200
    return r.json()


def _events(kind):
    with SessionLocal() as s:
        return s.scalars(select(Event).where(Event.kind == kind)).all()


# ---------- happy path ----------
def test_full_journey(client, data, as_driver, as_school, as_parent):
    trip, tcid = _tolu_on_board(client, data, as_driver, as_school)

    # Parent sees the PIN and only their own child.
    view = client.get("/parent/trips/today", headers=as_parent).json()
    bus = next(v for v in view if v["trip_id"] == trip)
    assert [c["child"]["name"] for c in bus["my_children"]] == ["Tolu Adebayo"]
    assert bus["handover_pins"][str(tcid)] == _pin(tcid)

    # Parent was told by SMS, including the PIN.
    with SessionLocal() as s:
        sms = s.scalars(select(Notification).where(Notification.to_phone == "+2348030000100")).all()
    assert any(_pin(tcid) in n.message for n in sms)

    receiver = next(r for r in _receivers(client, as_driver, trip, tcid) if r["name"] == "Mama Bisi")
    r = client.post(f"/crew/trips/{trip}/handover", headers=as_driver,
                    json={"trip_child_id": tcid, "receiver_id": receiver["id"], "pin": _pin(tcid)})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "handed_over"
    assert _pin(tcid) is None  # PIN is single use


def test_trip_ends_only_when_nobody_is_on_board(client, data, as_driver, as_school):
    trip, tcid = _tolu_on_board(client, data, as_driver, as_school)
    r = client.post(f"/crew/trips/{trip}/end", headers=as_driver)
    assert r.status_code == 400 and "Tolu" in r.json()["detail"]
    client.post(f"/crew/trips/{trip}/no-receiver", json={"trip_child_id": tcid}, headers=as_driver)
    assert client.post(f"/crew/trips/{trip}/end", headers=as_driver).status_code == 200


# ---------- release and boarding ----------
def test_cannot_board_child_school_has_not_released(client, data, as_driver):
    _start(client, as_driver, data["trip_bus"])
    r = _board(client, as_driver, data["trip_bus"], "CARD-TOLU")
    assert r.status_code == 400 and "not been released" in r.json()["detail"]


def test_cannot_board_child_from_another_trip(client, data, as_driver, as_school):
    _start(client, as_driver, data["trip_bus"])
    _release(client, as_school, "CARD-KEMI")  # Kemi rides the van, not the bus
    assert _board(client, as_driver, data["trip_bus"], "CARD-KEMI").status_code == 404


def test_school_cannot_release_without_a_booked_trip(client, data, as_school):
    _release(client, as_school, "CARD-TOLU")
    r = client.post("/school/release", json={"card_uid": "CARD-TOLU"}, headers=as_school)
    assert r.status_code == 400 and "Do not release" in r.json()["detail"]
    assert client.post("/school/release", json={"card_uid": "NOPE"}, headers=as_school).status_code == 404


# ---------- the two-adult, child-only rule ----------
def test_unvetted_crew_cannot_run_a_trip(client, data, as_driver):
    with SessionLocal() as s:
        s.get(Trip, data["trip_bus"]).escort_id = data["trainee"]
        s.commit()
    r = client.post(f"/crew/trips/{data['trip_bus']}/start", headers=as_driver)
    assert r.status_code == 400 and "vetting" in r.json()["detail"]


def test_driver_and_escort_must_be_different_people(client, data, as_driver):
    with SessionLocal() as s:
        s.get(Trip, data["trip_bus"]).escort_id = data["musa"]
        s.commit()
    r = client.post(f"/crew/trips/{data['trip_bus']}/start", headers=as_driver)
    assert r.status_code == 400 and "two different people" in r.json()["detail"]


def test_crew_cannot_act_on_another_vehicles_trip(client, data, as_other_crew):
    assert client.post(f"/crew/trips/{data['trip_bus']}/start", headers=as_other_crew).status_code == 403


# ---------- handover ----------
def test_wrong_pin_locks_after_three_attempts_and_alerts_ops(client, data, as_driver, as_school):
    trip, tcid = _tolu_on_board(client, data, as_driver, as_school)
    rid = _receivers(client, as_driver, trip, tcid)[0]["id"]
    wrong = "0000" if _pin(tcid) != "0000" else "1111"
    for _ in range(3):
        r = client.post(f"/crew/trips/{trip}/handover", headers=as_driver,
                        json={"trip_child_id": tcid, "receiver_id": rid, "pin": wrong})
        assert r.status_code == 403
    # Even the right PIN is now refused.
    r = client.post(f"/crew/trips/{trip}/handover", headers=as_driver,
                    json={"trip_child_id": tcid, "receiver_id": rid, "pin": _pin(tcid)})
    assert r.status_code == 423
    assert _events("pin_locked")[0].severity == "critical"
    with SessionLocal() as s:
        assert s.scalars(select(Notification).where(Notification.message.contains("CRITICAL"))).first()


def test_cannot_hand_child_to_another_familys_adult(client, data, as_driver, as_school):
    trip, tcid = _tolu_on_board(client, data, as_driver, as_school)
    _release(client, as_school, "CARD-CHIDERA")
    other_tc = _board(client, as_driver, trip, "CARD-CHIDERA").json()["id"]
    okeke_receiver = _receivers(client, as_driver, trip, other_tc)[0]["id"]
    r = client.post(f"/crew/trips/{trip}/handover", headers=as_driver,
                    json={"trip_child_id": tcid, "receiver_id": okeke_receiver, "pin": _pin(tcid)})
    assert r.status_code == 403
    assert _events("unapproved_receiver")[0].severity == "critical"


def test_no_approved_adult_sends_child_to_safe_hub(client, data, as_driver, as_school):
    trip, tcid = _tolu_on_board(client, data, as_driver, as_school)
    r = client.post(f"/crew/trips/{trip}/no-receiver", json={"trip_child_id": tcid}, headers=as_driver)
    assert r.json()["status"] == "at_safe_hub"
    with SessionLocal() as s:
        msgs = s.scalars(select(Notification.message).where(Notification.to_phone == "+2348030000100")).all()
    assert any("safe hub" in m for m in msgs)


# ---------- privacy and live video ----------
def test_live_video_only_while_own_child_is_on_board_and_is_logged(client, data, as_driver, as_school,
                                                                    as_parent, as_other_parent):
    trip = data["trip_bus"]
    _start(client, as_driver, trip)
    assert client.get(f"/parent/trips/{trip}/live", headers=as_parent).status_code == 403  # not yet in care
    _release(client, as_school, "CARD-TOLU")
    _board(client, as_driver, trip, "CARD-TOLU")
    r = client.get(f"/parent/trips/{trip}/live", headers=as_parent)
    assert r.status_code == 200 and r.json()["low_data"] is True
    assert len(_events("video_access")) == 1
    # Chika's child is booked on the bus but not released yet: no live view.
    assert client.get(f"/parent/trips/{trip}/live", headers=as_other_parent).status_code == 403


def test_parent_cannot_see_trip_without_their_child(client, data, as_other_parent):
    assert client.get(f"/parent/trips/{data['trip_van']}", headers=as_other_parent).status_code == 404


def test_roles_are_enforced(client, data, as_parent):
    assert client.post("/school/release", json={"card_uid": "CARD-TOLU"}, headers=as_parent).status_code == 403
    assert client.get("/ops/alerts", headers=as_parent).status_code == 403
    assert client.get("/parent/children").status_code == 401


# ---------- tracking and SOS ----------
def test_route_deviation_and_speeding_raise_one_alert_each(client, data, as_driver):
    trip = data["trip_bus"]
    _start(client, as_driver, trip)
    on_route = client.post(f"/crew/trips/{trip}/ping", json={"lat": 6.4450, "lon": 3.4760, "speed_kmh": 30},
                           headers=as_driver).json()
    assert on_route == []
    far = {"lat": 6.5244, "lon": 3.3792, "speed_kmh": 95}  # Yaba, well off a Lekki route
    first = client.post(f"/crew/trips/{trip}/ping", json=far, headers=as_driver).json()
    assert {e["kind"] for e in first} == {"route_deviation", "speeding"}
    again = client.post(f"/crew/trips/{trip}/ping", json=far, headers=as_driver).json()
    assert again == []  # not repeated while the first alert is open


def test_sos_is_critical_and_reaches_ops(client, data, as_parent, as_ops):
    r = client.post(f"/parent/trips/{data['trip_bus']}/sos", json={"note": "Child called me upset"},
                    headers=as_parent)
    assert r.status_code == 200 and r.json()["severity"] == "critical"
    alerts = client.get("/ops/alerts", headers=as_ops).json()
    assert alerts[0]["kind"] == "sos"


# ---------- bookings ----------
def test_booking_uses_tier_price_and_activates_on_payment(client, data, as_parent):
    r = client.post("/parent/bookings", json={"child_id": data["tolu"], "tier": "exclusive"}, headers=as_parent)
    assert r.status_code == 201
    b = r.json()["booking"]
    assert b["monthly_price"] == 240_000 and b["status"] == "active"


def test_parent_cannot_book_for_someone_elses_child(client, data, as_other_parent):
    r = client.post("/parent/bookings", json={"child_id": data["tolu"], "tier": "shared"},
                    headers=as_other_parent)
    assert r.status_code == 404
