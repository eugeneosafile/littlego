"""Scheduled jobs. Run from a cron service (see render.yaml):

    python -m app.jobs generate-trips      # each school morning, e.g. 05:00 Lagos time
    python -m app.jobs watchdog            # every 5 minutes during school hours
"""
import sys
from datetime import UTC, datetime

from .db import SessionLocal
from .services.safety import check_stale_locations
from .services.scheduling import generate_trips


def main(argv: list[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else ""
    with SessionLocal() as db:
        if cmd == "generate-trips":
            r = generate_trips(db, datetime.now(UTC).date())
            print(f"Trips for {r.run_date}: created {r.created}, existing {r.already_existed}")
            for line in r.skipped_children + r.warnings:
                print("  !", line)
            return 0
        if cmd == "watchdog":
            raised = check_stale_locations(db)
            db.commit()
            print(f"Stale-location alerts raised: {len(raised)}")
            return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
