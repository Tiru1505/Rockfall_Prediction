"""
UTC timestamp handling.

Timestamps are stored in SQLite via `DateTime` columns, which are timezone
*naive* — the value comes back as `2026-08-04T06:24:11` with no offset. A
browser parsing that with `new Date(...)` treats it as **local** time, so a
reading taken seconds ago renders as hours old for any user not on UTC.

Everything leaving the API therefore goes through here, so timestamps carry an
explicit `+00:00`. Use `UtcDateTime` in Pydantic response schemas and
`utc_iso()` when building a plain dict response.
"""
from datetime import datetime, timezone
from typing import Annotated, Optional

from pydantic import AfterValidator


def as_utc(dt: datetime) -> datetime:
    """Attach UTC to a naive datetime; convert an aware one to UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def utc_iso(dt: Optional[datetime]) -> Optional[str]:
    """ISO-8601 string with an explicit UTC offset, or None."""
    return None if dt is None else as_utc(dt).isoformat()


# Pydantic field type: stamps UTC on the way in, so model serialization emits
# an offset-qualified string.
UtcDateTime = Annotated[datetime, AfterValidator(as_utc)]
