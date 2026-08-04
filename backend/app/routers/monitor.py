"""Live monitoring: engine control, live snapshots, and AI risk insights."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.timeutil import utc_iso
from app.core.deps import get_current_user, require_admin
from app.models.db_models import MiningSite, Prediction, Alert, SiteStatus, User
from app.schemas.schemas import MonitorStatus, MonitorControl
from app.services import ai_insights, site_service
from app.services.monitoring_engine import engine

router = APIRouter(prefix="/api/monitor", tags=["Live Monitoring"])

INSIGHT_WINDOW = 40


@router.get("/status", response_model=MonitorStatus)
def monitor_status():
    """Is the background engine running, how often does it tick, when last?"""
    return MonitorStatus(**engine.status())


@router.post("/control", response_model=MonitorStatus)
async def monitor_control(
    payload: MonitorControl,
    _admin: User = Depends(require_admin),
):
    """Start/stop the engine or force an immediate tick (admin only)."""
    action = payload.action.lower()

    if payload.interval_seconds is not None:
        engine.set_interval(payload.interval_seconds)

    if action == "start":
        await engine.start()
    elif action == "stop":
        await engine.stop()
    elif action == "tick":
        engine.tick()
    elif action != "configure":
        raise HTTPException(
            status_code=422,
            detail="action must be one of: start, stop, tick, configure",
        )

    return MonitorStatus(**engine.status())


@router.get("/live")
def live_all(db: Session = Depends(get_db)):
    """
    Live state for every active site — the monitoring wall.

    Falls back to the newest stored prediction for any site the engine hasn't
    ticked yet (fresh boot, or a site added since the last tick), so the wall
    is never blank while waiting for the first cycle.
    """
    out = []
    sites = db.query(MiningSite).filter(MiningSite.status == SiteStatus.active).all()

    for site in sites:
        snap = engine.snapshot(site.site_id)
        if snap is None:
            snap = _snapshot_from_db(db, site)
        if snap is not None:
            snap["monitoring_enabled"] = bool(site.monitoring_enabled)
            out.append(snap)

    return {
        "engine": engine.status(),
        "sites": sorted(out, key=lambda s: s.get("final_risk") or 0, reverse=True),
        "server_time": utc_iso(datetime.utcnow()),
    }


@router.get("/live/{site_id}")
def live_site(site_id: str, db: Session = Depends(get_db)):
    """Live state for one site, plus its most recent alerts."""
    site = site_service.get_site(db, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    snap = engine.snapshot(site_id) or _snapshot_from_db(db, site)
    alerts = (
        db.query(Alert)
        .filter(Alert.site_id == site_id)
        .order_by(Alert.timestamp.desc())
        .limit(8)
        .all()
    )

    return {
        "engine": engine.status(),
        "site": {
            "site_id": site.site_id,
            "name": site.name,
            "location": site.location,
            "mine_type": site.mine_type.value if hasattr(site.mine_type, "value") else site.mine_type,
            "rock_type": site.rock_type,
            "monitoring_enabled": bool(site.monitoring_enabled),
        },
        "live": snap,
        "alerts": [
            {
                "id": a.id,
                "timestamp": utc_iso(a.timestamp),
                "risk_level": a.risk_level.value if hasattr(a.risk_level, "value") else a.risk_level,
                "final_risk": a.final_risk,
                "message": a.message,
                "acknowledged": a.acknowledged,
            }
            for a in alerts
        ],
        "server_time": utc_iso(datetime.utcnow()),
    }


@router.get("/insights/{site_id}")
def site_insights(
    site_id: str,
    window: int = Query(INSIGHT_WINDOW, ge=5, le=200),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """
    AI risk analysis for a site: ranked drivers, trend, forecast band,
    anomaly flags, stability and recommended actions.
    See `services/ai_insights.py` for exactly what is and isn't inferred.
    """
    site = site_service.get_site(db, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    history = (
        db.query(Prediction)
        .filter(Prediction.site_id == site_id)
        .order_by(Prediction.timestamp.desc())
        .limit(window)
        .all()
    )
    history.reverse()  # ai_insights expects oldest-first

    result = ai_insights.analyse(site.name, history)
    result["site_id"] = site_id
    result["site_name"] = site.name
    return result


@router.get("/insights")
def network_insights(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    """Network-wide roll-up: which site needs attention first, and why."""
    day_ago = datetime.utcnow() - timedelta(hours=24)
    sites = db.query(MiningSite).filter(MiningSite.status == SiteStatus.active).all()

    rows = []
    for site in sites:
        history = (
            db.query(Prediction)
            .filter(Prediction.site_id == site.site_id)
            .order_by(Prediction.timestamp.desc())
            .limit(INSIGHT_WINDOW)
            .all()
        )
        history.reverse()
        if not history:
            continue

        analysis = ai_insights.analyse(site.name, history)
        latest = history[-1]
        rows.append({
            "site_id": site.site_id,
            "site_name": site.name,
            "final_risk": latest.final_risk,
            "risk_level": (
                latest.risk_level.value if hasattr(latest.risk_level, "value")
                else latest.risk_level
            ),
            "trend": analysis["trend"],
            "top_driver": analysis["drivers"][0] if analysis["drivers"] else None,
            "anomaly_count": len(analysis["anomalies"]),
            "eta_to_threshold": analysis["eta_to_threshold"],
            "alerts_24h": db.query(Alert).filter(
                Alert.site_id == site.site_id, Alert.timestamp >= day_ago
            ).count(),
        })

    rows.sort(key=lambda r: r["final_risk"], reverse=True)
    highest = rows[0] if rows else None

    if highest is None:
        headline = "No readings yet across the network — start the monitoring engine to build a baseline."
    elif highest["risk_level"] in ("Critical", "High"):
        headline = (
            f"{highest['site_name']} needs attention first at {highest['final_risk']:.1f}% "
            f"({highest['risk_level']}), driven by "
            f"{highest['top_driver']['label'].lower() if highest['top_driver'] else 'multiple signals'}."
        )
    else:
        rising = [r for r in rows if r["trend"]["direction"].startswith("rising")]
        if rising:
            headline = (
                f"Network is within tolerance; highest is {highest['site_name']} at "
                f"{highest['final_risk']:.1f}%. {len(rising)} site(s) trending upward."
            )
        else:
            headline = (
                f"All {len(rows)} monitored site(s) are within tolerance — "
                f"highest is {highest['site_name']} at {highest['final_risk']:.1f}%."
            )

    return {
        "headline": headline,
        "sites": rows,
        "monitored_sites": len(sites),
        "generated_at": utc_iso(datetime.utcnow()),
    }


# ------------------------------------------------------------------ helpers

def _snapshot_from_db(db: Session, site: MiningSite) -> dict | None:
    """Rebuild a live snapshot from stored rows when the engine has none cached."""
    latest = (
        db.query(Prediction)
        .filter(Prediction.site_id == site.site_id)
        .order_by(Prediction.timestamp.desc())
        .first()
    )
    if latest is None:
        return {
            "site_id": site.site_id,
            "site_name": site.name,
            "location": site.location,
            "timestamp": None,
            "final_risk": None,
            "risk_level": None,
            "image_risk": None, "sensor_risk": None, "weather_risk": None,
            "confidence": None, "ground_vibration": None, "tilt_deg": None,
            "soil_moisture": None, "rainfall_mm": None, "temperature_c": None,
            "humidity_pct": None,
            "sparkline": [],
            "awaiting_first_reading": True,
        }

    recent = (
        db.query(Prediction)
        .filter(Prediction.site_id == site.site_id)
        .order_by(Prediction.timestamp.desc())
        .limit(30)
        .all()
    )
    recent.reverse()

    return {
        "site_id": site.site_id,
        "site_name": site.name,
        "location": site.location,
        "timestamp": utc_iso(latest.timestamp),
        "final_risk": latest.final_risk,
        "risk_level": (
            latest.risk_level.value if hasattr(latest.risk_level, "value")
            else latest.risk_level
        ),
        "image_risk": latest.image_risk,
        "sensor_risk": latest.sensor_risk,
        "weather_risk": latest.weather_risk,
        "confidence": latest.confidence,
        "ground_vibration": latest.ground_vibration,
        "tilt_deg": latest.tilt_deg,
        "soil_moisture": latest.soil_moisture,
        "rainfall_mm": latest.rainfall_mm,
        "temperature_c": latest.temperature_c,
        "humidity_pct": latest.humidity_pct,
        "sparkline": [{"t": utc_iso(p.timestamp), "risk": p.final_risk} for p in recent],
        "awaiting_first_reading": False,
    }
