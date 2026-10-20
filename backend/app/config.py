"""Application settings, read from environment variables (or a .env file).

Every setting can be overridden with an environment variable named LITTLEGO_<SETTING>,
for example LITTLEGO_DATABASE_URL or LITTLEGO_SMS_PROVIDER.
"""
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-only-secret-change-me-before-any-real-deployment"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="LITTLEGO_")

    environment: str = "development"  # development | production
    database_url: str = "sqlite:///./littlego.db"
    auto_create_tables: bool = True    # development convenience; production uses Alembic migrations
    jwt_secret: str = DEV_SECRET
    jwt_expiry_minutes: int = 60 * 12
    # Fernet key for encrypting handover PINs at rest. Generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # If empty, a key is derived from jwt_secret (fine for development only).
    pin_encryption_key: str = ""
    cors_origins: str = "*"            # comma separated, e.g. https://app.littlego.ng,https://ops.littlego.ng
    public_api_url: str = "http://localhost:8000"
    password_login_enabled: bool = True  # staff and demo accounts; parents and crew use SMS codes

    # ---- SMS ----
    sms_provider: str = "console"      # console | termii | africastalking
    sms_sender_id: str = "LittleGo"    # must be registered with the provider
    termii_api_key: str = ""
    termii_base_url: str = "https://api.ng.termii.com"  # use the base URL shown on your Termii dashboard
    termii_channel: str = "dnd"        # "dnd" for transactional/OTP (enable via Termii support), else "generic"
    africastalking_username: str = "sandbox"
    africastalking_api_key: str = ""

    # ---- Payments ----
    payment_provider: str = "mock"     # mock | paystack
    paystack_secret_key: str = ""
    paystack_callback_url: str = ""    # where Paystack returns the parent after paying
    payment_email_domain: str = "parents.littlego.ng"  # Paystack needs an email; used when a parent has none

    video_provider: str = "mock"

    # ---- One-time codes and rate limits ----
    otp_ttl_minutes: int = 10
    otp_max_attempts: int = 5
    otp_max_requests_per_10min: int = 3
    login_max_attempts_per_15min: int = 10

    # ---- Safety rules ----
    handover_pin_max_attempts: int = 3
    route_deviation_km: float = 1.5
    speed_limit_kmh: float = 80.0
    stale_location_minutes: int = 5
    ops_alert_phones: str = "+2348000000000"

    # Illustrative monthly prices per child (NGN). Validate with parents before launch.
    price_shared: int = 45_000
    price_group: int = 85_000
    price_exclusive: int = 240_000

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @model_validator(mode="after")
    def _production_guards(self):
        if self.is_production:
            problems = []
            if self.jwt_secret == DEV_SECRET or len(self.jwt_secret) < 32:
                problems.append("LITTLEGO_JWT_SECRET must be set to a random value of 32+ characters")
            if not self.pin_encryption_key:
                problems.append("LITTLEGO_PIN_ENCRYPTION_KEY must be set")
            if self.cors_origins.strip() == "*":
                problems.append("LITTLEGO_CORS_ORIGINS must list your web and app origins")
            if self.database_url.startswith("sqlite"):
                problems.append("Use PostgreSQL in production (LITTLEGO_DATABASE_URL)")
            if self.sms_provider == "console":
                problems.append("Set LITTLEGO_SMS_PROVIDER to termii or africastalking")
            if self.payment_provider == "mock":
                problems.append("Set LITTLEGO_PAYMENT_PROVIDER=paystack")
            if problems:
                raise ValueError("Unsafe production settings:\n- " + "\n- ".join(problems))
        return self


settings = Settings()
