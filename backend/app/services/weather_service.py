"""
Weather service.

Loads the real, user-supplied JFK hourly weather dataset and derives:
  - the latest reading
  - a rolling trend (for charts)
  - a 0-100 "weather risk index" based on rainfall, humidity and wind,
    which are the strongest environmental triggers for rockfalls/landslides.

NOTE: This dataset is airport weather (JFK), used here as a stand-in feed.
In production you would point this at a weather station near the actual
slope/mine site (e.g. via a weather API), the loader/risk logic is unchanged.

MULTI-SITE NOTE: only one weather station's data was supplied, so per-site
feeds are produced by giving each site a deterministic *offset window* into the
same real record (see `_site_offset`). Every number a site displays is a real
observed reading — but two sites are reading different hours of one station,
not two stations. Point `_site_window()` at a per-site API call to make this
genuinely independent.
"""
from functools import lru_cache
import zlib

import numpy as np
import pandas as pd

from app.core.config import settings


NUMERIC_COLS = {
    "HOURLYDRYBULBTEMPF": "temperature_f",
    "HOURLYRelativeHumidity": "humidity_pct",
    "HOURLYPrecip": "rainfall_mm",
    "HOURLYWindSpeed": "wind_speed",
    "HOURLYStationPressure": "pressure",
}


@lru_cache(maxsize=1)
def _load_weather_df() -> pd.DataFrame:
    df = pd.read_csv(settings.WEATHER_CSV, low_memory=False)
    keep = ["DATE"] + list(NUMERIC_COLS.keys())
    keep = [c for c in keep if c in df.columns]
    df = df[keep].copy()

    for col in NUMERIC_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(
                df[col].astype(str).str.replace("T", "0.001", regex=False).str.replace("s", "", regex=False),
                errors="coerce",
            )

    df = df.rename(columns=NUMERIC_COLS)
    if "temperature_f" in df.columns:
        df["temperature_c"] = (df["temperature_f"] - 32) * 5.0 / 9.0
    df["timestamp"] = pd.to_datetime(df["DATE"], errors="coerce")
    df = df.dropna(subset=["timestamp"]).sort_values("timestamp")

    # Fill sparse hourly gaps with forward-fill for smoother trends
    for col in NUMERIC_COLS.values():
        if col in df.columns:
            df[col] = df[col].ffill()

    return df.reset_index(drop=True)


def compute_weather_risk(rainfall_mm: float, humidity_pct: float, wind_speed: float) -> float:
    """
    Simple, explainable weighted risk index (0-100).
    Heavy rainfall is the dominant rockfall/landslide trigger, followed by
    high humidity (saturated slopes) and high wind (dislodging loose debris).
    """
    rainfall_mm = 0.0 if pd.isna(rainfall_mm) else rainfall_mm
    humidity_pct = 50.0 if pd.isna(humidity_pct) else humidity_pct
    wind_speed = 0.0 if pd.isna(wind_speed) else wind_speed

    rain_score = min(rainfall_mm / 25.0, 1.0) * 100        # 25mm+ in the window => saturated
    humidity_score = min(max(humidity_pct - 40, 0) / 60.0, 1.0) * 100
    wind_score = min(wind_speed / 40.0, 1.0) * 100

    risk = 0.55 * rain_score + 0.30 * humidity_score + 0.15 * wind_score
    return round(float(np.clip(risk, 0, 100)), 2)


def _site_offset(site_id: str | None, span: int) -> int:
    """
    Deterministic per-site offset (in rows) back from the end of the record.
    crc32 keeps it stable across processes, unlike Python's salted hash().
    """
    if not site_id:
        return 0
    return int(zlib.crc32(site_id.encode()) % max(span, 1))


def _site_window(site_id: str | None) -> pd.DataFrame:
    """The slice of the weather record this site is reading."""
    df = _load_weather_df()
    if not site_id:
        return df
    # Keep at least 500 rows of history behind every site's window.
    span = max(len(df) - 500, 1)
    offset = _site_offset(site_id, min(span, 2000))
    return df.iloc[: len(df) - offset] if offset else df


def get_latest_reading(site_id: str | None = None) -> dict:
    df = _site_window(site_id)
    row = df.iloc[-1]
    return {
        "timestamp": str(row["timestamp"]),
        "temperature_c": None if pd.isna(row.get("temperature_c")) else float(row["temperature_c"]),
        "humidity_pct": None if pd.isna(row.get("humidity_pct")) else float(row["humidity_pct"]),
        "rainfall_mm": None if pd.isna(row.get("rainfall_mm")) else float(row["rainfall_mm"]),
        "wind_speed": None if pd.isna(row.get("wind_speed")) else float(row["wind_speed"]),
        "pressure": None if pd.isna(row.get("pressure")) else float(row["pressure"]),
    }


def get_weather_summary(trend_points: int = 48, site_id: str | None = None) -> dict:
    df = _site_window(site_id)
    tail = df.tail(trend_points)

    trend = []
    for _, row in tail.iterrows():
        trend.append({
            "timestamp": str(row["timestamp"]),
            "temperature_c": None if pd.isna(row.get("temperature_c")) else round(float(row["temperature_c"]), 1),
            "humidity_pct": None if pd.isna(row.get("humidity_pct")) else round(float(row["humidity_pct"]), 1),
            "rainfall_mm": None if pd.isna(row.get("rainfall_mm")) else round(float(row["rainfall_mm"]), 2),
            "wind_speed": None if pd.isna(row.get("wind_speed")) else round(float(row["wind_speed"]), 1),
            "pressure": None if pd.isna(row.get("pressure")) else round(float(row["pressure"]), 1),
        })

    latest = get_latest_reading(site_id)
    risk = compute_weather_risk(
        latest.get("rainfall_mm") or 0,
        latest.get("humidity_pct") or 50,
        latest.get("wind_speed") or 0,
    )
    return {"latest": latest, "weather_risk": risk, "trend": trend}
