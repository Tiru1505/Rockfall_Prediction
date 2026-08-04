"""
Site helpers + the single shared evaluation path.

Both the manual "Run evaluation" button and the background monitoring engine
call `evaluate_site()`, so a manually-triggered reading and an auto-triggered
one are computed identically and differ only in their `source` field.
"""
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.db_models import MiningSite, Prediction, Alert, RiskLevel
from app.services import weather_service, sensor_service, image_predictor
from app.services.risk_engine import fuse_risk


def site_profile(site: MiningSite) -> dict:
    """The geology/geometry knobs the sensor simulator reads."""
    return {
        "hazard_factor": site.hazard_factor,
        "slope_angle_deg": site.slope_angle_deg,
        "bench_height_m": site.bench_height_m,
        "rock_type": site.rock_type,
    }


def get_site(db: Session, site_id: str) -> MiningSite | None:
    return db.query(MiningSite).filter(MiningSite.site_id == site_id).first()


def default_site(db: Session) -> MiningSite | None:
    """First active site, used when a request doesn't name one."""
    return (
        db.query(MiningSite)
        .order_by(MiningSite.status.asc(), MiningSite.id.asc())
        .first()
    )


def evaluate_site(
    db: Session,
    site: MiningSite,
    image_bytes: bytes | None = None,
    image_filename: str | None = None,
    source: str = "manual",
) -> Prediction:
    """
    Fuse image + sensor + weather risk for one site, persist the prediction,
    and raise an alert if it crosses the threshold. Returns the stored row.
    """
    if image_bytes is not None:
        img_result = image_predictor.predict(image_bytes, image_filename or "upload")
        image_risk = img_result["image_risk"]
        confidence = img_result["confidence"]
    else:
        image_risk = 30.0  # neutral default when no image supplied
        confidence = 0.5
        image_filename = None

    sensor_reading = sensor_service.simulate_reading(site.site_id, site_profile(site))
    weather = weather_service.get_weather_summary(trend_points=1, site_id=site.site_id)

    fused = fuse_risk(
        image_risk=image_risk,
        sensor_risk=sensor_reading["sensor_risk"],
        weather_risk=weather["weather_risk"],
    )

    prediction = Prediction(
        timestamp=datetime.utcnow(),
        site_id=site.site_id,
        site_name=site.name,
        source=source,
        image_filename=image_filename,
        image_risk=fused["image_risk"],
        sensor_risk=fused["sensor_risk"],
        weather_risk=fused["weather_risk"],
        final_risk=fused["final_risk"],
        risk_level=RiskLevel(fused["risk_level"]),
        confidence=confidence,
        rainfall_mm=weather["latest"].get("rainfall_mm"),
        humidity_pct=weather["latest"].get("humidity_pct"),
        temperature_c=weather["latest"].get("temperature_c"),
        ground_vibration=sensor_reading["ground_vibration"],
        soil_moisture=sensor_reading["soil_moisture"],
        tilt_deg=sensor_reading["tilt_deg"],
    )
    db.add(prediction)
    db.commit()
    db.refresh(prediction)

    if fused["final_risk"] >= settings.ALERT_THRESHOLD:
        db.add(Alert(
            timestamp=datetime.utcnow(),
            prediction_id=prediction.id,
            site_id=site.site_id,
            site_name=site.name,
            risk_level=RiskLevel(fused["risk_level"]),
            final_risk=fused["final_risk"],
            message=(
                f"High rockfall risk detected at {site.name}: "
                f"{fused['final_risk']}% ({fused['risk_level']})."
            ),
        ))
        db.commit()

    return prediction
