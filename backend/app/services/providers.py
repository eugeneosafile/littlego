"""Adapters for outside services: SMS, payments and the in-vehicle video system.

Each adapter has a working stand-in ("console" / "mock") so the whole system runs without
accounts. To go live, implement the real class and switch the setting, e.g.
WARDRIDE_SMS_PROVIDER=termii. Nothing else in the code needs to change.
"""
import logging
import secrets
from dataclasses import dataclass
from typing import Protocol

from ..config import settings

log = logging.getLogger("wardride.providers")


# ---------- SMS ----------
class SmsProvider(Protocol):
    def send(self, phone: str, message: str) -> str: ...


class ConsoleSms:
    def send(self, phone: str, message: str) -> str:
        log.info("SMS to %s: %s", phone, message)
        return f"console-{secrets.token_hex(4)}"


class TermiiSms:
    """Termii (https://developers.termii.com). Needs WARDRIDE_TERMII_API_KEY and a sender ID."""

    def send(self, phone: str, message: str) -> str:  # pragma: no cover - needs credentials
        raise NotImplementedError("Add your Termii API key and implement the HTTP call here.")


class AfricasTalkingSms:
    """Africa's Talking SMS and USSD (https://developers.africastalking.com)."""

    def send(self, phone: str, message: str) -> str:  # pragma: no cover - needs credentials
        raise NotImplementedError("Add your Africa's Talking credentials and implement the call here.")


def sms() -> SmsProvider:
    return {"termii": TermiiSms, "africastalking": AfricasTalkingSms}.get(settings.sms_provider, ConsoleSms)()


# ---------- Payments ----------
@dataclass
class Checkout:
    reference: str
    checkout_url: str
    paid: bool


class MockPayments:
    """Marks every payment as paid immediately. For demos and tests only."""

    def create_checkout(self, amount_ngn: int, email_or_phone: str, description: str) -> Checkout:
        ref = f"mock-{secrets.token_hex(6)}"
        return Checkout(reference=ref, checkout_url=f"https://pay.example/{ref}", paid=True)

    def verify(self, reference: str) -> bool:
        return reference.startswith("mock-")


class PaystackPayments:  # pragma: no cover - needs credentials
    """Paystack (https://paystack.com/docs). Card, bank transfer and USSD."""

    def create_checkout(self, amount_ngn: int, email_or_phone: str, description: str) -> Checkout:
        raise NotImplementedError("Initialise a Paystack transaction here (amount in kobo).")

    def verify(self, reference: str) -> bool:
        raise NotImplementedError


def payments():
    return {"paystack": PaystackPayments}.get(settings.payment_provider, MockPayments)()


# ---------- Video ----------
@dataclass
class StreamInfo:
    url: str
    cameras: list[str]
    bitrate_kbps: int
    expires_in_s: int


class MockVideo:
    """Returns a placeholder stream. Real DVR vendors issue short-lived, signed stream URLs."""

    def live_stream(self, vehicle_code: str, low_data: bool = True) -> StreamInfo:
        token = secrets.token_urlsafe(12)
        return StreamInfo(
            url=f"https://video.example/live/{vehicle_code}?t={token}",
            cameras=["cabin", "door", "road"],
            bitrate_kbps=250 if low_data else 900,
            expires_in_s=300,
        )


def video():
    return MockVideo()
