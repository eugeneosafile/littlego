import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["WARDRIDE_DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import DEMO_PASSWORD, seed  # noqa: E402


@pytest.fixture()
def data():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as s:
        d = seed(s)
        return {k: getattr(v, "id", v) for k, v in d.items()}


@pytest.fixture()
def client(data):
    with TestClient(app) as c:
        yield c


def login(client: TestClient, phone: str) -> dict:
    r = client.post("/auth/login", json={"phone": phone, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def as_parent(client):
    return login(client, "08030000100")  # Funmi Adebayo


@pytest.fixture()
def as_other_parent(client):
    return login(client, "08030000101")  # Chika Okeke


@pytest.fixture()
def as_driver(client):
    return login(client, "08030000010")  # Musa, WR-14


@pytest.fixture()
def as_other_crew(client):
    return login(client, "08030000012")  # Kunle, WR-22


@pytest.fixture()
def as_school(client):
    return login(client, "08030000001")


@pytest.fixture()
def as_ops(client):
    return login(client, "08030000002")
