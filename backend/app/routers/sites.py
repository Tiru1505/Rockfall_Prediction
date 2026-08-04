"""Mining-site management: switch between sites, add new ones, per-site graphs."""
from collections import Counter, defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.bootstrap import slugify
from app.core.database import get_db
from app.core.timeutil import utc_iso
from app.core.deps import get_current_user, require_admin
from app.models.db_models import (
    MiningSite, MineType, SiteStatus, Prediction, Alert, User,
)
from app.schemas.schemas import SiteCreate, SiteUpdate, SiteOut, SiteSummaryOut
from app.services import sensor_service

router = APIRouter(prefix="/api/sites", tags=["Mining Sites"])

SPARKLINE_POINTS = 24


def _unique_site_id(db: Session, name: str) -> str:
    """Slugify the name, appending -2, -3, … until it's free."""
    base = slugify(name)
    candidate, n = base, 1
    while db.query(MiningSite).filter(MiningSite.site_id == candidate).first():
        n += 1
        candidate = f"{base}-{n}"
    return candidate


def _parse_mine_type(value: str | None) -> MineType:
    if not value:
        return MineType.open_pit
    for member in MineType:
        if member.value.lower() == value.lower() or member.name == value:
            return member
    raise HTTPException(
        status_code=422,
        detail=f"Unknown mine_type '{value}'. Expected one of: "
               + ", ".join(m.value for m in MineType),
    )


def _to_out(site: MiningSite) -> dict:
    return {
        "id": site.id,
        "site_id": site.site_id,
        "name": site.name,
        "location": site.location,
        "latitude": site.latitude,
        "longitude": site.longitude,
        "mine_type": site.mine_type.value if hasattr(site.mine_type, "value") else site.mine_type,
        "rock_type": site.rock_type,
        "bench_height_m": site.bench_height_m,
        "slope_angle_deg": site.slope_angle_deg,
        "hazard_factor": site.hazard_factor,
        "status": site.status.value if hasattr(site.status, "value") else site.status,
        "monitoring_enabled": site.monitoring_enabled,
        "notes": site.notes,
        "created_at": site.created_at,
    }


def _summary(db: Session, site: MiningSite) -> SiteSummaryOut:
    latest = (
        db.query(Prediction)
        .filter(Prediction.site_id == site.site_id)
        .order_by(Prediction.timestamp.desc())
        .first()
    )
    recent = (
        db.query(Prediction)
        .filter(Prediction.site_id == site.site_id)
        .order_by(Prediction.timestamp.desc())
        .limit(SPARKLINE_POINTS)
        .all()
    )
    recent.reverse()

    day_ago = datetime.utcnow() - timedelta(hours=24)
    last_24h = [
        p.final_risk for p in
        db.query(Prediction)
        .filter(Prediction.site_id == site.site_id, Prediction.timestamp >= day_ago)
        .all()
    ]

    return SiteSummaryOut(
        **_to_out(site),
        current_risk=latest.final_risk if latest else None,
        current_level=(
            (latest.risk_level.value if hasattr(latest.risk_level, "value") else latest.risk_level)
            if latest else None
        ),
        last_evaluated=latest.timestamp if latest else None,
        total_predictions=db.query(Prediction).filter(Prediction.site_id == site.site_id).count(),
        open_alerts=db.query(Alert).filter(
            Alert.site_id == site.site_id, Alert.acknowledged == 0
        ).count(),
        avg_risk_24h=round(sum(last_24h) / len(last_24h), 2) if last_24h else None,
        sparkline=[{"t": utc_iso(p.timestamp), "risk": p.final_risk} for p in recent],
    )


# ------------------------------------------------------------------ CRUD

@router.get("", response_model=list[SiteSummaryOut])
def list_sites(db: Session = Depends(get_db), include_archived: bool = False):
    """All sites with their current live state — powers the site switcher."""
    q = db.query(MiningSite)
    if not include_archived:
        q = q.filter(MiningSite.status != SiteStatus.archived)
    return [_summary(db, s) for s in q.order_by(MiningSite.id.asc()).all()]


@router.post("", response_model=SiteOut, status_code=201)
def create_site(
    payload: SiteCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Add a new mining site to the monitored network."""
    site = MiningSite(
        site_id=_unique_site_id(db, payload.name),
        name=payload.name.strip(),
        location=(payload.location or "").strip(),
        latitude=payload.latitude,
        longitude=payload.longitude,
        mine_type=_parse_mine_type(payload.mine_type),
        rock_type=payload.rock_type or "Unspecified",
        bench_height_m=payload.bench_height_m,
        slope_angle_deg=payload.slope_angle_deg,
        hazard_factor=payload.hazard_factor,
        monitoring_enabled=1 if payload.monitoring_enabled else 0,
        status=SiteStatus.active,
        notes=payload.notes,
        created_at=datetime.utcnow(),
    )
    db.add(site)
    db.commit()
    db.refresh(site)
    return SiteOut(**_to_out(site))


@router.get("/{site_id}", response_model=SiteSummaryOut)
def get_site(site_id: str, db: Session = Depends(get_db)):
    site = db.query(MiningSite).filter(MiningSite.site_id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return _summary(db, site)


@router.patch("/{site_id}", response_model=SiteOut)
def update_site(
    site_id: str,
    payload: SiteUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    site = db.query(MiningSite).filter(MiningSite.site_id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    data = payload.model_dump(exclude_unset=True)
    if "mine_type" in data:
        data["mine_type"] = _parse_mine_type(data["mine_type"])
    if "monitoring_enabled" in data:
        data["monitoring_enabled"] = 1 if data["monitoring_enabled"] else 0
    if "status" in data and data["status"] is not None:
        try:
            data["status"] = SiteStatus(data["status"])
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Unknown status '{data['status']}'")

    for key, value in data.items():
        setattr(site, key, value)

    db.commit()
    db.refresh(site)

    # Geometry changes alter the simulator baseline, so drop cached sensor state.
    if {"hazard_factor", "slope_angle_deg", "bench_height_m"} & set(data):
        sensor_service.reset_site_state(site.site_id)

    # Keep the denormalised name on historical rows in step with the site.
    if "name" in data:
        db.query(Prediction).filter(Prediction.site_id == site.site_id).update(
            {Prediction.site_name: site.name}
        )
        db.query(Alert).filter(Alert.site_id == site.site_id).update(
            {Alert.site_name: site.name}
        )
        db.commit()

    return SiteOut(**_to_out(site))


@router.delete("/{site_id}")
def delete_site(
    site_id: str,
    purge: bool = Query(False, description="Also delete this site's predictions and alerts"),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """
    Archive a site (default) or hard-delete it with its history (`purge=true`).
    Archiving is the default so a site's incident record isn't lost by accident.
    """
    site = db.query(MiningSite).filter(MiningSite.site_id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    if purge:
        db.query(Prediction).filter(Prediction.site_id == site_id).delete()
        db.query(Alert).filter(Alert.site_id == site_id).delete()
        db.delete(site)
        db.commit()
        sensor_service.reset_site_state(site_id)
        return {"status": "deleted", "site_id": site_id, "history_purged": True}

    site.status = SiteStatus.archived
    site.monitoring_enabled = 0
    db.commit()
    return {"status": "archived", "site_id": site_id, "history_purged": False}


# ------------------------------------------------------------------ charts

@router.get("/{site_id}/charts")
def site_charts(
    site_id: str,
    hours: int = Query(24, ge=1, le=8760),
    points: int = Query(120, ge=10, le=1000),
    db: Session = Depends(get_db),
):
    """
    Everything the per-site graph page draws, in one round trip:
    risk timeseries, signal breakdown, sensor channels, weather channels,
    level distribution, hourly alert counts and a current-driver radar.
    """
    site = db.query(MiningSite).filter(MiningSite.site_id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    cutoff = datetime.utcnow() - timedelta(hours=hours)
    rows = (
        db.query(Prediction)
        .filter(Prediction.site_id == site_id, Prediction.timestamp >= cutoff)
        .order_by(Prediction.timestamp.desc())
        .limit(points)
        .all()
    )
    rows.reverse()

    risk_series, sensor_series, weather_series = [], [], []
    for p in rows:
        ts = utc_iso(p.timestamp)
        risk_series.append({
            "t": ts,
            "final": p.final_risk,
            "image": p.image_risk,
            "sensor": p.sensor_risk,
            "weather": p.weather_risk,
        })
        sensor_series.append({
            "t": ts,
            "vibration": p.ground_vibration,
            "tilt": p.tilt_deg,
            "moisture": p.soil_moisture,
        })
        weather_series.append({
            "t": ts,
            "rainfall": p.rainfall_mm,
            "humidity": p.humidity_pct,
            "temperature": p.temperature_c,
        })

    dist = Counter(
        (p.risk_level.value if hasattr(p.risk_level, "value") else p.risk_level)
        for p in rows
    )

    alert_rows = (
        db.query(Alert)
        .filter(Alert.site_id == site_id, Alert.timestamp >= cutoff)
        .all()
    )
    per_hour = defaultdict(int)
    for a in alert_rows:
        per_hour[a.timestamp.strftime("%Y-%m-%d %H:00")] += 1

    latest = rows[-1] if rows else None
    radar = [
        {"axis": "Imagery", "value": round(latest.image_risk, 1) if latest else 0},
        {"axis": "Sensors", "value": round(latest.sensor_risk, 1) if latest else 0},
        {"axis": "Weather", "value": round(latest.weather_risk, 1) if latest else 0},
        {"axis": "Vibration", "value": round(min((latest.ground_vibration or 0) / 60 * 100, 100), 1) if latest else 0},
        {"axis": "Tilt", "value": round(min((latest.tilt_deg or 0) / 10 * 100, 100), 1) if latest else 0},
        {"axis": "Moisture", "value": round(min((latest.soil_moisture or 0) / 90 * 100, 100), 1) if latest else 0},
    ]

    finals = [p.final_risk for p in rows]
    return {
        "site": _to_out(site),
        "window_hours": hours,
        "point_count": len(rows),
        "risk_series": risk_series,
        "sensor_series": sensor_series,
        "weather_series": weather_series,
        "level_distribution": [{"level": k, "count": v} for k, v in dist.items()],
        "alerts_per_hour": [{"hour": h, "count": c} for h, c in sorted(per_hour.items())],
        "driver_radar": radar,
        "stats": {
            "avg_risk": round(sum(finals) / len(finals), 2) if finals else 0,
            "peak_risk": round(max(finals), 2) if finals else 0,
            "min_risk": round(min(finals), 2) if finals else 0,
            "alert_count": len(alert_rows),
        },
    }


@router.get("/{site_id}/compare")
def compare_sites(site_id: str, db: Session = Depends(get_db), hours: int = 24):
    """Average/peak risk per site over the window, for the comparison chart."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    out = []
    for site in db.query(MiningSite).filter(MiningSite.status != SiteStatus.archived).all():
        finals = [
            p.final_risk for p in
            db.query(Prediction)
            .filter(Prediction.site_id == site.site_id, Prediction.timestamp >= cutoff)
            .all()
        ]
        out.append({
            "site_id": site.site_id,
            "name": site.name,
            "avg_risk": round(sum(finals) / len(finals), 2) if finals else 0,
            "peak_risk": round(max(finals), 2) if finals else 0,
            "readings": len(finals),
            "is_selected": site.site_id == site_id,
        })
    return out
