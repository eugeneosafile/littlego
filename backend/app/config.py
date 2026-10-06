"""Application settings, read from environment variables (or a .env file)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="WARDRIDE_")

    database_url: str = "sqlite:///./wardride.db"
    # Development default only. Set WARDRIDE_JWT_SECRET to a long random value in production.
    jwt_secret: str = "dev-only-secret-change-me-before-any-real-deployment"
    jwt_expiry_minutes: int = 60 * 12

    # Provider switches. "console"/"mock" work with no accounts; swap for real ones later.
    sms_provider: str = "console"        # console | termii | africastalking
    payment_provider: str = "mock"       # mock | paystack | flutterwave
    video_provider: str = "mock"         # mock | <your DVR / streaming vendor>

    # Safety rules
    handover_pin_max_attempts: int = 3
    route_deviation_km: float = 1.5
    speed_limit_kmh: float = 80.0

    # Ops numbers alerted on SOS / critical events (comma separated)
    ops_alert_phones: str = "+2348000000000"

    # Illustrative monthly prices per child (NGN). Validate with parents before launch.
    price_shared: int = 45_000
    price_group: int = 85_000
    price_exclusive: int = 240_000


settings = Settings()
