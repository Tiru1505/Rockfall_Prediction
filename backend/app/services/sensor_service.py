"""
Sensor simulation service.

No live IoT sensors are connected in this demo, so readings are simulated —
but they are seasoned with the real seismic-activity index derived from the
earthquake catalog, so ground-vibration spikes correlate with real recent
seismic events rather than being pure noise. Swap `simulate_reading()` for a
real MQTT/HTTP ingestion call to go to production.

State is kept **per site**: each mining site has its own independently drifting
sensor state, seeded deterministically from its slug and scaled by its geology
profile (slope angle, bench height, hazard factor). A steep highwall in weak
interbedded strata therefore reads hotter than a shallow massive-granite face,
instead of every site echoing one global feed.
"""
import random
from datetime import datetime, timezone

from app.services.earthquake_service import get_seismic_activity_index

# site_id -> drifting sensor state
_site_state: dict[str, dict] = {}


def _profile_baseline(profile: dict) -> dict:
    """
    Turn a site's geology/geometry into starting sensor values.

    Steeper slopes tilt and vibrate more; taller benches carry more stored
    energy; hazard_factor is the operator's manual multiplier for how broken
    up the rock mass is.
    """
    hazard = float(profile.get("hazard_factor") or 1.0)
    slope = float(profile.get("slope_angle_deg") or 45.0)
    bench = float(profile.get("bench_height_m") or 15.0)

    slope_ratio = slope / 45.0
    bench_ratio = bench / 15.0

    return {
        "ground_vibration": 15.0 * hazard * (0.7 + 0.3 * bench_ratio),
        "tilt_deg": 1.5 * hazard * slope_ratio,
        "soil_moisture": 30.0 * (0.85 + 0.3 * hazard),
        "accelerometer_g": 0.02 * hazard,
    }


def _state_for(site_id: str, profile: dict | None) -> dict:
    if site_id not in _site_state:
        # Deterministic per-site seed so a site's feed is reproducible across
        # restarts rather than jumping to a new random baseline each boot.
        rng = random.Random(f"strata::{site_id}")
        base = _profile_baseline(profile or {})
        _site_state[site_id] = {
            k: v * rng.uniform(0.9, 1.1) for k, v in base.items()
        }
        _site_state[site_id]["_rng"] = rng
    return _site_state[site_id]


def _drift(value: float, low: float, high: float, step: float, rng: random.Random) -> float:
    value += rng.uniform(-step, step)
    return max(low, min(high, value))


def reset_site_state(site_id: str) -> None:
    """Drop cached state so a site re-seeds from its (possibly edited) profile."""
    _site_state.pop(site_id, None)


def simulate_reading(site_id: str = "site-a", profile: dict | None = None) -> dict:
    seismic_idx = get_seismic_activity_index()  # 0-100, from real earthquake data
    seismic_boost = seismic_idx / 100.0 * 8.0    # up to +8 units of vibration

    state = _state_for(site_id, profile)
    rng: random.Random = state["_rng"]
    hazard = float((profile or {}).get("hazard_factor") or 1.0)

    state["ground_vibration"] = _drift(state["ground_vibration"], 0, 100, 4, rng) + seismic_boost * 0.05 * hazard
    state["tilt_deg"] = _drift(state["tilt_deg"], 0, 15, 0.3, rng)
    state["soil_moisture"] = _drift(state["soil_moisture"], 5, 100, 3, rng)
    state["accelerometer_g"] = _drift(state["accelerometer_g"], 0, 2, 0.05, rng)

    ground_vibration = round(state["ground_vibration"], 2)
    tilt_deg = round(state["tilt_deg"], 2)
    soil_moisture = round(state["soil_moisture"], 2)
    accelerometer_g = round(state["accelerometer_g"], 3)

    sensor_risk = compute_sensor_risk(ground_vibration, tilt_deg, soil_moisture, seismic_idx)

    return {
        "timestamp": datetime.now(timezone.utc),
        "site_id": site_id,
        "ground_vibration": ground_vibration,
        "tilt_deg": tilt_deg,
        "soil_moisture": soil_moisture,
        "accelerometer_g": accelerometer_g,
        "seismic_activity": seismic_idx,
        "sensor_risk": sensor_risk,
    }


def compute_sensor_risk(vibration: float, tilt: float, soil_moisture: float, seismic_idx: float) -> float:
    vib_score = min(vibration / 60.0, 1.0) * 100
    tilt_score = min(tilt / 10.0, 1.0) * 100
    moisture_score = min(soil_moisture / 90.0, 1.0) * 100

    risk = 0.40 * vib_score + 0.25 * tilt_score + 0.20 * moisture_score + 0.15 * seismic_idx
    return round(min(max(risk, 0), 100), 2)
