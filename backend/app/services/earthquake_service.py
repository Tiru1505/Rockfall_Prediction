"""
Earthquake / seismic service.

Loads the real global earthquake catalog (2020-2026) and exposes recent
events plus a "seismic risk" contribution used to season the simulated
ground-vibration sensor reading — real seismic activity nudges the
simulated vibration sensor so the demo behaves plausibly.
"""
from functools import lru_cache
import pandas as pd
import numpy as np

from app.core.config import settings


@lru_cache(maxsize=1)
def _load_quake_df() -> pd.DataFrame:
    df = pd.read_csv(settings.EARTHQUAKE_CSV, low_memory=False)
    df["time"] = pd.to_datetime(df["time"], errors="coerce", utc=True)
    df = df.dropna(subset=["time"]).sort_values("time")
    return df.reset_index(drop=True)


def get_recent_events(limit: int = 20) -> list:
    df = _load_quake_df()
    tail = df.tail(limit).iloc[::-1]  # most recent first
    events = []
    for _, row in tail.iterrows():
        events.append({
            "time": str(row["time"]),
            "magnitude": None if pd.isna(row.get("mag")) else float(row["mag"]),
            "depth": None if pd.isna(row.get("depth")) else float(row["depth"]),
            "place": row.get("place"),
            "latitude": None if pd.isna(row.get("latitude")) else float(row["latitude"]),
            "longitude": None if pd.isna(row.get("longitude")) else float(row["longitude"]),
        })
    return events


def get_seismic_activity_index() -> float:
    """
    A rolling 0-100 index derived from the magnitude of the most recent
    events in the catalog, used purely to add realistic variance to the
    simulated ground-vibration sensor.
    """
    df = _load_quake_df()
    recent = df.tail(50)
    if recent.empty:
        return 10.0
    avg_mag = float(recent["mag"].mean())
    # Typical catalog here is M5+; map ~5.0-7.0 onto a 0-100 baseline index
    idx = np.clip((avg_mag - 5.0) / 2.0, 0, 1) * 100
    return round(float(idx), 2)
