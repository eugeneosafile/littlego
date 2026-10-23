import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import Base, engine
from .routers import admin, auth, crew, ops, parent, payments, school, ussd, waitlist

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_tables and not settings.is_production:
        Base.metadata.create_all(engine)  # development only; production runs `alembic upgrade head`
    yield


app = FastAPI(
    title="LittleGo API",
    version="0.2.0",
    description="Child-only school transport: bookings, trips, verified release and handover, alerts.",
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.get("/health")
def health():
    return {"status": "ok", "environment": settings.environment}


for r in (auth.router, parent.router, crew.router, school.router, ops.router, admin.router,
          payments.router, ussd.router, waitlist.public, waitlist.ops):
    app.include_router(r)
