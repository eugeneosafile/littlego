import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import Base, engine
from .routers import auth, crew, ops, parent, school

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # For the MVP tables are created automatically. Use Alembic migrations before production.
    Base.metadata.create_all(engine)
    yield


app = FastAPI(
    title="WardRide API",
    version="0.1.0",
    description="Child-only school transport: bookings, trips, verified release and handover, alerts.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten to your web and app origins before production.
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


for r in (auth.router, parent.router, crew.router, school.router, ops.router):
    app.include_router(r)
