"""Simple in-memory sliding-window rate limiter.

Good enough for a single API instance during the pilot. If you run several instances,
move this to Redis so the limits are shared.
"""
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException

_hits: dict[str, deque[float]] = defaultdict(deque)
_lock = Lock()


def hit(key: str, limit: int, window_s: int) -> None:
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and q[0] <= now - window_s:
            q.popleft()
        if len(q) >= limit:
            wait = int(window_s - (now - q[0])) + 1
            raise HTTPException(429, f"Too many attempts. Try again in {max(1, wait // 60)} minute(s).")
        q.append(now)


def reset() -> None:
    with _lock:
        _hits.clear()
