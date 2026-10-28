"""Calendar-date helpers. Dates are ISO strings (YYYY-MM-DD) everywhere, like the frontend.

Day maths uses plain calendar dates, never UTC timestamps, so a day never shifts in zones such as IST.
"""
from __future__ import annotations

import math
from datetime import date, datetime, timedelta
from functools import lru_cache


@lru_cache(maxsize=8192)  # a few thousand distinct dates are parsed hundreds of thousands of times per request
def to_date(s: str) -> date:
    return date.fromisoformat(s[:10])


def iso(d: date) -> str:
    return d.isoformat()


@lru_cache(maxsize=65536)
def days_between(a: str, b: str) -> int:
    return (to_date(b) - to_date(a)).days


@lru_cache(maxsize=65536)
def add_days(s: str, n: int) -> str:
    return iso(to_date(s) + timedelta(days=n))


def js_round(x: float) -> int:
    """JavaScript's Math.round (halves go up), so percentages match the frontend exactly."""
    return math.floor(x + 0.5)


def short_date(s: str) -> str:
    d = to_date(s)
    return f"{d.day} {d.strftime('%b')}"


def now_at(today: str) -> str:
    """Timestamp used in audit entries: the working date plus the current clock time."""
    return f"{today}T{datetime.now().strftime('%H:%M')}"
