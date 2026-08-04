from typing import Optional

from fastapi import APIRouter, Query

from app.services import weather_service

router = APIRouter(prefix="/api/weather", tags=["Weather"])


@router.get("/summary")
def weather_summary(trend_points: int = 48, site_id: Optional[str] = Query(None)):
    """Latest reading + trend + weather risk index, derived from the real JFK
    weather dataset. Each site reads its own offset window of that record —
    see the module docstring in `weather_service.py`."""
    return weather_service.get_weather_summary(trend_points=trend_points, site_id=site_id)


@router.get("/latest")
def weather_latest(site_id: Optional[str] = Query(None)):
    return weather_service.get_latest_reading(site_id=site_id)
