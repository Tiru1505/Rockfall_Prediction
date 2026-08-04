from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, Query, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.db_models import Prediction, Alert
from app.schemas.schemas import PredictionOut, ImagePredictionOut, AlertOut
from app.services import image_predictor, site_service

router = APIRouter(prefix="/api", tags=["Prediction & Risk"])


def _resolve_site(db: Session, site_id: Optional[str]):
    """Named site, else the default one. 404s rather than silently retargeting."""
    if site_id:
        site = site_service.get_site(db, site_id)
        if not site:
            raise HTTPException(status_code=404, detail=f"Site '{site_id}' not found")
        return site

    site = site_service.default_site(db)
    if not site:
        raise HTTPException(
            status_code=409,
            detail="No mining sites configured. Add a site before running an evaluation.",
        )
    return site


@router.post("/predict/image", response_model=ImagePredictionOut)
async def predict_image(file: UploadFile = File(...)):
    """Upload a slope image and get a risk prediction (see image_predictor.py docstring)."""
    image_bytes = await file.read()
    result = image_predictor.predict(image_bytes, file.filename)
    return ImagePredictionOut(
        image_filename=file.filename,
        image_risk=result["image_risk"],
        confidence=result["confidence"],
        predicted_class=result["predicted_class"],
        gradcam_note=result["gradcam_note"],
    )


@router.post("/risk/evaluate", response_model=PredictionOut)
async def evaluate_risk(
    db: Session = Depends(get_db),
    file: Optional[UploadFile] = File(None),
    site_id: Optional[str] = Query(None, description="Target site; defaults to the first site"),
):
    """
    Full pipeline for one site: fuse image risk (if an image is provided, else a
    neutral default) + that site's live simulated sensor risk + its weather risk
    into a final score, persist it, and raise an alert if it crosses the
    threshold. Shares `site_service.evaluate_site` with the monitoring engine.
    """
    site = _resolve_site(db, site_id)
    image_bytes = await file.read() if file is not None else None

    prediction = site_service.evaluate_site(
        db,
        site,
        image_bytes=image_bytes,
        image_filename=file.filename if file is not None else None,
        source="manual",
    )
    return PredictionOut.model_validate(prediction)


@router.get("/risk/current", response_model=PredictionOut)
def current_risk(
    db: Session = Depends(get_db),
    site_id: Optional[str] = Query(None),
):
    """Latest stored prediction for the site (an empty placeholder if none yet)."""
    q = db.query(Prediction)
    if site_id:
        q = q.filter(Prediction.site_id == site_id)
    latest = q.order_by(Prediction.timestamp.desc()).first()

    if latest is None:
        site = site_service.get_site(db, site_id) if site_id else site_service.default_site(db)
        return PredictionOut(
            id=0, timestamp=datetime.utcnow(),
            site_id=site.site_id if site else (site_id or "site-a"),
            site_name=site.name if site else "No site",
            source="manual", image_filename=None,
            image_risk=0, sensor_risk=0, weather_risk=0, final_risk=0, risk_level="Safe",
            confidence=0, rainfall_mm=None, humidity_pct=None, temperature_c=None,
            ground_vibration=None, soil_moisture=None, tilt_deg=None,
        )
    return PredictionOut.model_validate(latest)


@router.get("/history", response_model=list[PredictionOut])
def prediction_history(
    db: Session = Depends(get_db),
    limit: int = 100,
    risk_level: Optional[str] = None,
    site_id: Optional[str] = None,
    source: Optional[str] = Query(None, description="'manual' or 'monitor'"),
):
    q = db.query(Prediction).order_by(Prediction.timestamp.desc())
    if risk_level:
        q = q.filter(Prediction.risk_level == risk_level)
    if site_id:
        q = q.filter(Prediction.site_id == site_id)
    if source:
        q = q.filter(Prediction.source == source)
    return [PredictionOut.model_validate(p) for p in q.limit(limit).all()]


@router.get("/alerts", response_model=list[AlertOut])
def list_alerts(
    db: Session = Depends(get_db),
    limit: int = 50,
    site_id: Optional[str] = None,
):
    q = db.query(Alert).order_by(Alert.timestamp.desc())
    if site_id:
        q = q.filter(Alert.site_id == site_id)
    return [AlertOut.model_validate(a) for a in q.limit(limit).all()]


@router.post("/alerts/{alert_id}/acknowledge", response_model=AlertOut)
def acknowledge_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.acknowledged = 1
    db.commit()
    db.refresh(alert)
    return AlertOut.model_validate(alert)
