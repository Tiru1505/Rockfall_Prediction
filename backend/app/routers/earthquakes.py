from fastapi import APIRouter
from app.services import earthquake_service

router = APIRouter(prefix="/api/earthquakes", tags=["Earthquakes"])


@router.get("/recent")
def recent_events(limit: int = 20):
    """Most recent real seismic events from the global earthquake catalog."""
    return earthquake_service.get_recent_events(limit=limit)


@router.get("/seismic-index")
def seismic_index():
    return {"seismic_activity_index": earthquake_service.get_seismic_activity_index()}
