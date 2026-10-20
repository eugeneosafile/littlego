"""Adapters for outside services: SMS, payments and the in-vehicle video system.

Switch providers with environment variables (see config.py). The "console"/"mock" stand-ins
let the whole system run without accounts. Each real adapter takes an optional httpx client
so it can be tested without network access.
"""
import hashlib
import hmac
import logging
import secrets
from dataclasses import dataclass
from typing import Protocol

import httpx

from ..config import settings
from .phone import for_provider

log = logging.getLogger("littlego.providers")
TIMEOUT = httpx.Timeout(15.0)


class ProviderError(RuntimeError):
    pass


# =========================== SMS ===========================
class SmsProvider(Protocol):
    def send(self, phone: str, message: str) -> str: ...


class ConsoleSms:
    """Development only: prints messages to the server log."""

    def send(self, phone: str, message: str) -> str:
        log.info("SMS to %s: %s", phone, message)
        return f"console-{secrets.token_hex(4)}"


class TermiiSms:
    """Termii messaging API: POST {base}/api/sms/send with JSON body.
    Use channel "dnd" for transactional messages and codes (ask Termii support to enable it);
    "generic" does not reach numbers on Do-Not-Disturb lists."""

    def __init__(self, client: httpx.Client | None = None):
        if not settings.termii_api_key:
            raise ProviderError("LITTLEGO_TERMII_API_KEY is not set")
        self.client = client or httpx.Client(timeout=TIMEOUT)

    def send(self, phone: str, message: str) -> str:
        r = self.client.post(f"{settings.termii_base_url.rstrip('/')}/{settings.termii_send_path.lstrip('/')}", json={
            "api_key": settings.termii_api_key,
            "to": for_provider(phone),
            "from": settings.sms_sender_id,
            "sms": message,
            "type": "plain",
            "channel": settings.termii_channel,
        })
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if r.status_code >= 400 or not body.get("message_id"):
            raise ProviderError(f"Termii send failed ({r.status_code}): {body.get('message') or r.text[:200]}")
        return str(body.get("message_id_str") or body["message_id"])


class AfricasTalkingSms:
    """Africa's Talking SMS: POST /version1/messaging, form-encoded, apiKey header.
    The username "sandbox" uses the sandbox host. Confirm details on your AT dashboard."""

    def __init__(self, client: httpx.Client | None = None):
        if not settings.africastalking_api_key:
            raise ProviderError("LITTLEGO_AFRICASTALKING_API_KEY is not set")
        self.client = client or httpx.Client(timeout=TIMEOUT)

    @property
    def url(self) -> str:
        host = "api.sandbox.africastalking.com" if settings.africastalking_username == "sandbox" \
            else "api.africastalking.com"
        return f"https://{host}/version1/messaging"

    def send(self, phone: str, message: str) -> str:
        data = {"username": settings.africastalking_username, "to": f"+{for_provider(phone)}", "message": message}
        if settings.sms_sender_id and settings.africastalking_username != "sandbox":
            data["from"] = settings.sms_sender_id
        r = self.client.post(self.url, data=data, headers={
            "apiKey": settings.africastalking_api_key, "Accept": "application/json"})
        if r.status_code >= 400:
            raise ProviderError(f"Africa's Talking send failed ({r.status_code}): {r.text[:200]}")
        recipients = r.json().get("SMSMessageData", {}).get("Recipients", [])
        if not recipients or recipients[0].get("status") != "Success":
            raise ProviderError(f"Africa's Talking rejected the message: {r.text[:200]}")
        return recipients[0].get("messageId", "")


def sms() -> SmsProvider:
    kind = settings.sms_provider
    if kind == "termii":
        return TermiiSms()
    if kind == "africastalking":
        return AfricasTalkingSms()
    return ConsoleSms()


# =========================== Payments ===========================
@dataclass
class Checkout:
    reference: str
    checkout_url: str
    paid: bool


class MockPayments:
    """Development only: every payment succeeds immediately."""

    def create_checkout(self, amount_ngn: int, email: str, reference: str, metadata: dict) -> Checkout:
        return Checkout(reference=reference, checkout_url=f"https://pay.example/{reference}", paid=True)

    def verify(self, reference: str) -> tuple[bool, int]:
        return True, 0

    def valid_webhook(self, raw_body: bytes, signature: str | None) -> bool:
        return False


class PaystackPayments:
    """Paystack: initialize a transaction, send the parent to authorization_url, then confirm by
    webhook (charge.success) or by calling verify. Amounts are sent in kobo."""

    BASE = "https://api.paystack.co"

    def __init__(self, client: httpx.Client | None = None):
        if not settings.paystack_secret_key:
            raise ProviderError("LITTLEGO_PAYSTACK_SECRET_KEY is not set")
        self.client = client or httpx.Client(timeout=TIMEOUT)
        self.headers = {"Authorization": f"Bearer {settings.paystack_secret_key}"}

    def create_checkout(self, amount_ngn: int, email: str, reference: str, metadata: dict) -> Checkout:
        payload = {
            "email": email,
            "amount": str(amount_ngn * 100),
            "currency": "NGN",
            "reference": reference,
            "metadata": metadata,
            "channels": ["card", "bank", "ussd", "bank_transfer"],
        }
        if settings.paystack_callback_url:
            payload["callback_url"] = settings.paystack_callback_url
        r = self.client.post(f"{self.BASE}/transaction/initialize", json=payload, headers=self.headers)
        body = r.json()
        if r.status_code >= 400 or not body.get("status"):
            raise ProviderError(f"Paystack initialize failed: {body.get('message', r.text[:200])}")
        return Checkout(reference=body["data"]["reference"], checkout_url=body["data"]["authorization_url"],
                        paid=False)

    def verify(self, reference: str) -> tuple[bool, int]:
        """Returns (paid, amount in kobo)."""
        r = self.client.get(f"{self.BASE}/transaction/verify/{reference}", headers=self.headers)
        body = r.json()
        if r.status_code >= 400 or not body.get("status"):
            return False, 0
        data = body.get("data", {})
        return data.get("status") == "success", int(data.get("amount", 0))

    def valid_webhook(self, raw_body: bytes, signature: str | None) -> bool:
        """x-paystack-signature = HMAC-SHA512 of the raw body, keyed with the secret key."""
        if not signature:
            return False
        expected = hmac.new(settings.paystack_secret_key.encode(), raw_body, hashlib.sha512).hexdigest()
        return hmac.compare_digest(expected, signature)


def payments():
    return PaystackPayments() if settings.payment_provider == "paystack" else MockPayments()


# =========================== Video ===========================
@dataclass
class StreamInfo:
    url: str
    cameras: list[str]
    bitrate_kbps: int
    expires_in_s: int


class MockVideo:
    """Placeholder. Real mobile-DVR vendors issue short-lived signed stream URLs (HLS/WebRTC);
    implement live_stream() with their API once a vendor is chosen."""

    def live_stream(self, vehicle_code: str, low_data: bool = True) -> StreamInfo:
        token = secrets.token_urlsafe(12)
        return StreamInfo(url=f"https://video.example/live/{vehicle_code}?t={token}",
                          cameras=["cabin", "door", "road"], bitrate_kbps=250 if low_data else 900,
                          expires_in_s=300)


def video():
    return MockVideo()
