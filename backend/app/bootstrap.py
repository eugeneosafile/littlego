"""Create the first ops account on a fresh production database (no demo data).

    python -m app.bootstrap --name "Ops Lead" --phone 0803xxxxxxx --password "a-long-password"
"""
import argparse

from sqlalchemy import select

from .db import SessionLocal
from .models import Role, User
from .security import hash_password
from .services.phone import normalize


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--name", required=True)
    p.add_argument("--phone", required=True)
    p.add_argument("--password", required=True)
    a = p.parse_args()
    if len(a.password) < 12:
        raise SystemExit("Use a password of at least 12 characters")
    phone = normalize(a.phone)
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.phone == phone)):
            raise SystemExit(f"{phone} already exists")
        db.add(User(name=a.name, phone=phone, role=Role.ops, password_hash=hash_password(a.password)))
        db.commit()
    print(f"Created ops account for {a.name} ({phone})")


if __name__ == "__main__":
    main()
