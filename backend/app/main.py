import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core import bootstrap
from app.core.config import settings, DEV_SECRET_KEY
from app.core.database import Base, engine as db_engine
from app.models import db_models  # noqa: F401 (ensures models are registered)
from app.routers import (
    auth, weather, earthquakes, sensors, predictions, analytics, admin,
    sites, monitor,
)
from app.services.monitoring_engine import engine as monitoring

logger = logging.getLogger("strata.startup")

Base.metadata.create_all(bind=db_engine)
bootstrap.run()  # add post-hoc columns, backfill site ids, seed default sites


def _check_production_config() -> None:
    """
    Fail loudly on deployment mistakes that are silent but serious.

    A default signing key means anyone can mint a valid admin token, and SQLite
    on a platform with an ephemeral filesystem (Render's free tier) silently
    discards every account, site and reading on each deploy or spin-down.
    """
    if not settings.is_production:
        return

    if settings.SECRET_KEY == DEV_SECRET_KEY:
        raise RuntimeError(
            "ROCKFALL_SECRET_KEY is still the development default. Set it to a "
            "long random value before running in production — otherwise anyone "
            "can forge a valid admin JWT."
        )

    if settings.using_sqlite:
        logger.warning(
            "Running in production on SQLite. On a platform with an ephemeral "
            "filesystem (e.g. Render's free tier) all users, sites and readings "
            "are lost on every deploy and spin-down. Set DATABASE_URL to a "
            "Postgres instance to persist data."
        )


_check_production_config()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.MONITORING_AUTOSTART:
        monitoring.set_interval(settings.MONITORING_INTERVAL_SECONDS)
        await monitoring.start()
    yield
    await monitoring.stop()


app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "Backend for the AI-Based Rockfall Prediction and Early Warning System. "
        "Weather and earthquake data are real (user-supplied datasets); "
        "sensors are simulated per-site (seasoned with real seismic data); "
        "image prediction is a placeholder heuristic pending a trained CNN. "
        "A background monitoring engine evaluates every active site on an "
        "interval and a statistical insight engine explains the result."
    ),
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(sites.router)
app.include_router(monitor.router)
app.include_router(weather.router)
app.include_router(earthquakes.router)
app.include_router(sensors.router)
app.include_router(predictions.router)
app.include_router(analytics.router)
app.include_router(admin.router)


@app.get("/api/health", tags=["Health"])
def health_check():
    return {
        "status": "ok",
        "service": settings.APP_NAME,
        "monitoring": monitoring.status(),
    }
