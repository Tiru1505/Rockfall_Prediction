from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services import sensor_service, site_service

router = APIRouter(prefix="/api/sensors", tags=["Sensors"])


@router.get("/live")
def live_reading(
    db: Session = Depends(get_db),
    site_id: Optional[str] = Query(None, description="Target site; defaults to the first site"),
):
    """Simulated live sensor reading (ground vibration, tilt, soil moisture)
    for one site, seasoned with the real seismic-activity index. Each site keeps
    its own drifting state seeded from its geology profile."""
    site = site_service.get_site(db, site_id) if site_id else site_service.default_site(db)
    if site is None:
        return sensor_service.simulate_reading("site-a", None)
    return sensor_service.simulate_reading(site.site_id, site_service.site_profile(site))
