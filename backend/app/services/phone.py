"""Phone numbers are stored in E.164 form (+2348031234567) so logins and SMS always match."""
import re

from fastapi import HTTPException


def normalize(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if raw.strip().startswith("+") and len(digits) >= 10:
        return f"+{digits}"
    if digits.startswith("234") and len(digits) == 13:
        return f"+{digits}"
    if digits.startswith("0") and len(digits) == 11:      # 0803 123 4567
        return f"+234{digits[1:]}"
    if len(digits) == 10 and digits[0] in "789":          # 803 123 4567
        return f"+234{digits}"
    raise HTTPException(422, f"'{raw}' is not a valid Nigerian phone number")


def for_provider(e164: str) -> str:
    """Termii and Africa's Talking accept international format; Termii wants it without '+'."""
    return e164.lstrip("+")
