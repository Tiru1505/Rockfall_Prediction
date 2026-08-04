from collections import Counter
from datetime import datetime, timedelta
from typing import Optional
import io
import csv

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.db_models import Prediction, Alert
from app.schemas.schemas import AnalyticsSummary

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("/summary", response_model=AnalyticsSummary)
def analytics_summary(db: Session = Depends(get_db), site_id: Optional[str] = Query(None)):
    """Aggregate stats — network-wide, or scoped to one site with `site_id`."""
    pred_q = db.query(Prediction)
    alert_q = db.query(Alert)
    if site_id:
        pred_q = pred_q.filter(Prediction.site_id == site_id)
        alert_q = alert_q.filter(Alert.site_id == site_id)

    predictions = pred_q.all()
    alerts = alert_q.all()

    total = len(predictions)
    dist = Counter(
        p.risk_level.value if hasattr(p.risk_level, "value") else p.risk_level
        for p in predictions
    )
    avg_risk = round(sum(p.final_risk for p in predictions) / total, 2) if total else 0.0

    cutoff = datetime.utcnow() - timedelta(days=30)
    daily = Counter()
    for p in predictions:
        if p.timestamp >= cutoff:
            daily[p.timestamp.strftime("%Y-%m-%d")] += 1
    daily_series = [{"date": d, "count": c} for d, c in sorted(daily.items())]

    return AnalyticsSummary(
        total_predictions=total,
        total_alerts=len(alerts),
        risk_distribution=dict(dist),
        avg_final_risk=avg_risk,
        predictions_last_30_days=daily_series,
    )


@router.get("/export/history.csv")
def export_history_csv(db: Session = Depends(get_db), site_id: Optional[str] = Query(None)):
    q = db.query(Prediction)
    if site_id:
        q = q.filter(Prediction.site_id == site_id)
    predictions = q.order_by(Prediction.timestamp.desc()).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id", "timestamp", "site_id", "site_name", "source", "image_filename",
        "image_risk", "sensor_risk",
        "weather_risk", "final_risk", "risk_level", "confidence", "rainfall_mm",
        "humidity_pct", "temperature_c", "ground_vibration", "soil_moisture", "tilt_deg",
    ])
    for p in predictions:
        writer.writerow([
            p.id, p.timestamp, p.site_id, p.site_name, p.source, p.image_filename,
            p.image_risk, p.sensor_risk,
            p.weather_risk, p.final_risk,
            p.risk_level.value if hasattr(p.risk_level, "value") else p.risk_level,
            p.confidence, p.rainfall_mm, p.humidity_pct, p.temperature_c,
            p.ground_vibration, p.soil_moisture, p.tilt_deg,
        ])
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=prediction_history.csv"},
    )
