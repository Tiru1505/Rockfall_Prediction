"""
Central configuration for the Rockfall Prediction backend.
Values can be overridden with environment variables of the same name.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

DEV_SECRET_KEY = "dev-secret-key-change-in-production"


def _normalise_db_url(url: str) -> str:
    """
    Render (and Heroku) hand out `postgres://…` URLs, which SQLAlchemy 2.x
    refuses to parse — it only registers the `postgresql://` dialect. Rewriting
    it here means the platform's DATABASE_URL can be used verbatim.
    """
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def _cors_origins() -> list[str]:
    """
    Comma-separated allowlist, e.g.
      ROCKFALL_CORS_ORIGINS=https://strata.vercel.app,https://www.example.com
    Defaults to "*" for local development. Note that this API authenticates with
    a Bearer token rather than cookies, so credentialed CORS is not required.
    """
    raw = os.getenv("ROCKFALL_CORS_ORIGINS", "").strip()
    if not raw:
        return ["*"]
    return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]


class Settings:
    APP_NAME: str = "AI Rockfall Prediction & Early Warning System"
    API_V1_PREFIX: str = "/api"

    ENVIRONMENT: str = os.getenv("ROCKFALL_ENV", "development")

    # JWT
    SECRET_KEY: str = os.getenv("ROCKFALL_SECRET_KEY", DEV_SECRET_KEY)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12  # 12 hours

    # Database. SQLite by default for local use; set ROCKFALL_DATABASE_URL (or
    # DATABASE_URL, which is what Render injects) to a Postgres URL in production.
    DATABASE_URL: str = _normalise_db_url(
        os.getenv("ROCKFALL_DATABASE_URL")
        or os.getenv("DATABASE_URL")
        or f"sqlite:///{BASE_DIR}/rockfall.db"
    )

    # Data files (real datasets supplied by the user)
    WEATHER_CSV: Path = DATA_DIR / "weather.csv"
    EARTHQUAKE_CSV: Path = DATA_DIR / "earthquakes.csv"
    LANDSLIDE_CSV: Path = DATA_DIR / "landslide_catalog.csv"

    # Risk fusion weights (image, sensor/vibration, weather) - must sum to 1.0
    WEIGHT_IMAGE: float = 0.40
    WEIGHT_SENSOR: float = 0.35
    WEIGHT_WEATHER: float = 0.25

    # Alert threshold (risk % above which an alert is raised)
    ALERT_THRESHOLD: float = 80.0

    # Live monitoring engine: auto-evaluate every active site on this interval.
    # Set ROCKFALL_MONITORING_AUTOSTART=0 to require a manual start instead.
    MONITORING_AUTOSTART: bool = os.getenv("ROCKFALL_MONITORING_AUTOSTART", "1") == "1"
    MONITORING_INTERVAL_SECONDS: int = int(os.getenv("ROCKFALL_MONITORING_INTERVAL", "20"))

    CORS_ORIGINS: list = _cors_origins()

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() in ("production", "prod")

    @property
    def using_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


settings = Settings()
