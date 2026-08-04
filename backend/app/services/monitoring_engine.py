"""
Live monitoring engine.

A background asyncio task that wakes on a fixed interval and evaluates every
site with monitoring enabled, persisting a prediction and raising alerts —
so the system keeps watching whether or not anyone has the dashboard open.
Before this existed, risk was only ever computed when a user clicked a button.

Each tick also refreshes an in-memory snapshot per site (current score, level,
recent sparkline, live sensor values) so the UI can poll a single cheap
endpoint instead of re-querying the whole history on every refresh.

The tick runs `evaluate_site` in a worker thread: it's synchronous SQLAlchemy +
pandas work, and running it inline would block the event loop for every other
request while sites are being evaluated.
"""
import asyncio
import logging
from datetime import datetime

from app.core.database import SessionLocal
from app.core.timeutil import utc_iso
from app.models.db_models import MiningSite, Prediction, SiteStatus
from app.services import site_service

logger = logging.getLogger("strata.monitor")

DEFAULT_INTERVAL = 20  # seconds
MIN_INTERVAL = 5
MAX_INTERVAL = 3600
SPARKLINE_POINTS = 30


class MonitoringEngine:
    def __init__(self) -> None:
        self.interval: int = DEFAULT_INTERVAL
        self.running: bool = False
        self.last_tick: datetime | None = None
        self.tick_count: int = 0
        self.last_error: str | None = None
        self._task: asyncio.Task | None = None
        self._snapshots: dict[str, dict] = {}

    # ------------------------------------------------------------- lifecycle

    async def start(self) -> None:
        if self.running:
            return
        self.running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("Monitoring engine started (interval=%ss)", self.interval)

    async def stop(self) -> None:
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Monitoring engine stopped")

    def set_interval(self, seconds: int) -> int:
        self.interval = max(MIN_INTERVAL, min(MAX_INTERVAL, int(seconds)))
        return self.interval

    async def _loop(self) -> None:
        while self.running:
            try:
                await asyncio.to_thread(self.tick)
                self.last_error = None
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # keep the loop alive across bad ticks
                self.last_error = str(exc)
                logger.exception("Monitoring tick failed")
            await asyncio.sleep(self.interval)

    # ------------------------------------------------------------------ tick

    def tick(self) -> None:
        """Evaluate every monitored site once and refresh its snapshot."""
        db = SessionLocal()
        try:
            sites = (
                db.query(MiningSite)
                .filter(
                    MiningSite.monitoring_enabled == 1,
                    MiningSite.status == SiteStatus.active,
                )
                .all()
            )
            for site in sites:
                prediction = site_service.evaluate_site(db, site, source="monitor")
                self._snapshots[site.site_id] = self._build_snapshot(db, site, prediction)

            # Drop cached snapshots for sites that were deleted, archived or had
            # monitoring switched off since the last tick — otherwise
            # `sites_tracked` keeps counting them and stale readings linger.
            live_ids = {s.site_id for s in sites}
            for stale in set(self._snapshots) - live_ids:
                del self._snapshots[stale]

            self.last_tick = datetime.utcnow()
            self.tick_count += 1
        finally:
            db.close()

    def _build_snapshot(self, db, site: MiningSite, prediction: Prediction) -> dict:
        recent = (
            db.query(Prediction)
            .filter(Prediction.site_id == site.site_id)
            .order_by(Prediction.timestamp.desc())
            .limit(SPARKLINE_POINTS)
            .all()
        )
        recent.reverse()

        return {
            "site_id": site.site_id,
            "site_name": site.name,
            "location": site.location,
            "timestamp": utc_iso(prediction.timestamp),
            "final_risk": prediction.final_risk,
            "risk_level": (
                prediction.risk_level.value
                if hasattr(prediction.risk_level, "value")
                else prediction.risk_level
            ),
            "image_risk": prediction.image_risk,
            "sensor_risk": prediction.sensor_risk,
            "weather_risk": prediction.weather_risk,
            "confidence": prediction.confidence,
            "ground_vibration": prediction.ground_vibration,
            "tilt_deg": prediction.tilt_deg,
            "soil_moisture": prediction.soil_moisture,
            "rainfall_mm": prediction.rainfall_mm,
            "temperature_c": prediction.temperature_c,
            "humidity_pct": prediction.humidity_pct,
            "sparkline": [
                {"t": utc_iso(p.timestamp), "risk": p.final_risk} for p in recent
            ],
        }

    # ------------------------------------------------------------- accessors

    def snapshot(self, site_id: str) -> dict | None:
        return self._snapshots.get(site_id)

    def all_snapshots(self) -> list[dict]:
        return list(self._snapshots.values())

    def status(self) -> dict:
        return {
            "running": self.running,
            "interval_seconds": self.interval,
            # ISO with an explicit UTC offset — this dict is embedded raw in
            # /monitor/live responses, so it can't rely on schema serialization.
            "last_tick": utc_iso(self.last_tick),
            "tick_count": self.tick_count,
            "sites_tracked": len(self._snapshots),
            "last_error": self.last_error,
        }


engine = MonitoringEngine()
