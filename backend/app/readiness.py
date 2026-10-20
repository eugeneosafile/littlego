"""Pilot readiness report.

    python -m app.readiness            # settings, database and set-up data
    python -m app.readiness --live     # also calls Paystack to confirm the key works
    python -m app.readiness --sms 0803xxxxxxx   # also sends a real test SMS to that number
"""
import argparse
import sys

from .db import SessionLocal
from .services.phone import normalize
from .services.readiness import FAIL, PASS, WARN, Check, run_checks

ICON = {PASS: "PASS", WARN: "WARN", FAIL: "FAIL"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--sms", help="send a test SMS to this number")
    a = ap.parse_args()
    with SessionLocal() as db:
        checks = run_checks(db, live=a.live)
        if a.sms:
            from .services.safety import notify
            ok = notify(db, normalize(a.sms), "LittleGo test message: your SMS set-up works.")
            db.commit()
            checks.append(Check("Services", "Test SMS", PASS if ok else FAIL, f"to {a.sms}",
                                "Check the provider key, sender ID approval and account credit."))
    area = None
    for c in checks:
        if c.area != area:
            area = c.area
            print(f"\n== {area} ==")
        print(f"[{ICON[c.status]}] {c.name}: {c.detail}")
        if c.status != PASS and c.fix:
            print(f"        -> {c.fix}")
    fails = sum(c.status == FAIL for c in checks)
    warns = sum(c.status == WARN for c in checks)
    print(f"\n{'READY' if not fails else 'NOT READY'}: {fails} blocking, {warns} warnings, "
          f"{sum(c.status == PASS for c in checks)} passed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
