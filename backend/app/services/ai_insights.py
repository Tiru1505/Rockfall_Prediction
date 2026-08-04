"""
Live risk-analysis engine ("Monitoring AI").

WHAT THIS IS: a deterministic statistical analyser, not a large language model.
Everything it returns is computed from the site's own recent prediction series:

  * driver decomposition   - each signal's weighted share of the final score
  * trend                  - ordinary least-squares slope over the window
  * forecast               - linear extrapolation with a volatility-derived band
  * anomalies              - modified z-scores (MAD-based, outlier-robust)
  * stability              - rolling volatility of the fused score
  * narrative / actions    - templated from the above, so every sentence is
                             traceable to a number on screen

WHAT THIS IS NOT: it does not "understand" geology and it cannot see anything
outside the numbers. Swapping in a trained sequence model (or an LLM for the
narrative) means replacing `analyse()` — the return shape is what the frontend
renders, so nothing else needs to change.
"""
from datetime import datetime
from statistics import median

from app.core.config import settings
from app.core.timeutil import utc_iso


WINDOW = 40  # max recent predictions considered


# ---------------------------------------------------------------- statistics

def _ols_slope(values: list[float]) -> float:
    """Least-squares slope of `values` against their index (risk % per step)."""
    n = len(values)
    if n < 2:
        return 0.0
    mean_x = (n - 1) / 2.0
    mean_y = sum(values) / n
    num = sum((i - mean_x) * (v - mean_y) for i, v in enumerate(values))
    den = sum((i - mean_x) ** 2 for i in range(n))
    return num / den if den else 0.0


def _stdev(values: list[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    mean = sum(values) / n
    return (sum((v - mean) ** 2 for v in values) / (n - 1)) ** 0.5


def _modified_z(values: list[float]) -> float:
    """
    Modified z-score of the latest point (Iglewicz-Hoaglin), which uses the
    median and MAD instead of mean/stdev so a single large spike doesn't
    inflate the scale and hide itself. |score| > 3.5 is the usual outlier cut.
    """
    if len(values) < 5:
        return 0.0
    med = median(values)
    mad = median([abs(v - med) for v in values])
    latest = values[-1]
    if mad == 0:
        # Degenerate spread: fall back to stdev so a flat-then-jump series is
        # still flagged rather than silently returning 0.
        sd = _stdev(values)
        return 0.0 if sd == 0 else (latest - med) / sd
    return 0.6745 * (latest - med) / mad


# ---------------------------------------------------------------- components

def _drivers(latest) -> list[dict]:
    """Rank each signal by its weighted contribution to the fused score."""
    weighted = [
        {
            "key": "image",
            "label": "Slope Imagery",
            "raw": round(latest.image_risk or 0.0, 2),
            "weight": settings.WEIGHT_IMAGE,
            "contribution": (latest.image_risk or 0.0) * settings.WEIGHT_IMAGE,
        },
        {
            "key": "sensor",
            "label": "Geotechnical Sensors",
            "raw": round(latest.sensor_risk or 0.0, 2),
            "weight": settings.WEIGHT_SENSOR,
            "contribution": (latest.sensor_risk or 0.0) * settings.WEIGHT_SENSOR,
        },
        {
            "key": "weather",
            "label": "Weather",
            "raw": round(latest.weather_risk or 0.0, 2),
            "weight": settings.WEIGHT_WEATHER,
            "contribution": (latest.weather_risk or 0.0) * settings.WEIGHT_WEATHER,
        },
    ]
    total = sum(d["contribution"] for d in weighted) or 1.0
    for d in weighted:
        d["contribution"] = round(d["contribution"], 2)
        d["share_pct"] = round(d["contribution"] / total * 100, 1)
    return sorted(weighted, key=lambda d: d["contribution"], reverse=True)


def _trend(series: list[float]) -> dict:
    slope = _ols_slope(series)
    if slope > 0.8:
        direction, label = "rising_fast", "Escalating"
    elif slope > 0.15:
        direction, label = "rising", "Rising"
    elif slope < -0.8:
        direction, label = "falling_fast", "Improving quickly"
    elif slope < -0.15:
        direction, label = "falling", "Easing"
    else:
        direction, label = "stable", "Stable"

    change = round(series[-1] - series[0], 2) if len(series) >= 2 else 0.0
    return {
        "direction": direction,
        "label": label,
        "slope_per_reading": round(slope, 3),
        "change_over_window": change,
        "window_size": len(series),
    }


def _forecast(series: list[float], steps: int = 6) -> list[dict]:
    """
    Project the fitted line forward. The band widens with sqrt(step) — the
    usual random-walk error growth — scaled by the window's own volatility, so
    a jittery site gets a visibly wider cone than a steady one.
    """
    if len(series) < 3:
        return []
    slope = _ols_slope(series)
    n = len(series)
    mean_y = sum(series) / n
    intercept = mean_y - slope * (n - 1) / 2.0
    vol = max(_stdev(series[-12:]), 1.5)

    out = []
    for step in range(1, steps + 1):
        point = intercept + slope * (n - 1 + step)
        spread = vol * (step ** 0.5)
        out.append({
            "step": step,
            "projected": round(min(max(point, 0), 100), 2),
            "lower": round(min(max(point - spread, 0), 100), 2),
            "upper": round(min(max(point + spread, 0), 100), 2),
        })
    return out


def _anomalies(history: list) -> list[dict]:
    """Flag sensor channels whose newest reading is a statistical outlier."""
    channels = [
        ("ground_vibration", "Ground vibration", "Hz"),
        ("tilt_deg", "Slope tilt", "°"),
        ("soil_moisture", "Soil moisture", "%"),
        ("rainfall_mm", "Rainfall", "mm"),
        ("final_risk", "Fused risk score", "%"),
    ]
    found = []
    for attr, label, unit in channels:
        values = [getattr(p, attr) for p in history if getattr(p, attr) is not None]
        if len(values) < 6:
            continue
        score = _modified_z(values)
        if abs(score) >= 3.5:
            found.append({
                "channel": attr,
                "label": label,
                "unit": unit,
                "value": round(values[-1], 2),
                "baseline": round(median(values), 2),
                "z_score": round(score, 2),
                "direction": "above" if score > 0 else "below",
                "severity": "high" if abs(score) >= 6 else "moderate",
            })
    return found


def _stability(series: list[float]) -> dict:
    vol = _stdev(series[-15:]) if len(series) >= 3 else 0.0
    if vol < 3:
        label, key = "Steady", "steady"
    elif vol < 8:
        label, key = "Fluctuating", "fluctuating"
    else:
        label, key = "Erratic", "erratic"
    return {"volatility": round(vol, 2), "label": label, "key": key}


def _time_to_threshold(series: list[float], threshold: float) -> float | None:
    """Readings until the fitted line crosses the alert threshold (None if never)."""
    if len(series) < 3:
        return None
    slope = _ols_slope(series)
    current = series[-1]
    if current >= threshold or slope <= 0.05:
        return None
    steps = (threshold - current) / slope
    return round(steps, 1) if steps <= 200 else None


# ------------------------------------------------------------------ narrative

def _narrative(site_name, latest, drivers, trend, stability, anomalies, eta) -> str:
    top = drivers[0]
    level = latest.risk_level.value if hasattr(latest.risk_level, "value") else latest.risk_level

    parts = [
        f"{site_name} is at {latest.final_risk:.1f}% fused risk ({level}). "
        f"{top['label']} is the dominant driver at {top['share_pct']:.0f}% of the "
        f"score (raw {top['raw']:.1f}%)."
    ]

    if trend["direction"] in ("rising", "rising_fast"):
        parts.append(
            f"Risk has climbed {trend['change_over_window']:+.1f} points over the "
            f"last {trend['window_size']} readings ({trend['slope_per_reading']:+.2f}/reading)."
        )
    elif trend["direction"] in ("falling", "falling_fast"):
        parts.append(
            f"Risk has eased {abs(trend['change_over_window']):.1f} points over the "
            f"last {trend['window_size']} readings."
        )
    else:
        parts.append(f"The score has held flat across the last {trend['window_size']} readings.")

    parts.append(f"Signal is {stability['label'].lower()} (σ={stability['volatility']}).")

    if eta is not None:
        parts.append(
            f"On the current slope it would reach the {settings.ALERT_THRESHOLD:.0f}% "
            f"alert threshold in about {eta:.0f} more readings."
        )

    if anomalies:
        names = ", ".join(a["label"].lower() for a in anomalies)
        parts.append(f"Outlier readings detected on: {names}.")

    return " ".join(parts)


def _recommendations(latest, drivers, trend, anomalies) -> list[dict]:
    level = latest.risk_level.value if hasattr(latest.risk_level, "value") else latest.risk_level
    recs: list[dict] = []

    if level in ("Critical", "High"):
        recs.append({
            "priority": "critical" if level == "Critical" else "high",
            "action": "Clear personnel and equipment from the runout zone below this face.",
        })
        recs.append({
            "priority": "high",
            "action": "Notify the geotechnical engineer on duty and log a face inspection.",
        })
    elif level == "Medium":
        recs.append({
            "priority": "medium",
            "action": "Increase visual inspection frequency on this bench for the next shift.",
        })
    else:
        recs.append({
            "priority": "low",
            "action": "No action required — continue routine monitoring.",
        })

    top = drivers[0]
    if top["key"] == "weather" and top["raw"] > 50:
        recs.append({
            "priority": "medium",
            "action": "Weather-led risk: verify surface drainage and berm capacity before "
                      "the next rainfall band arrives.",
        })
    elif top["key"] == "sensor" and top["raw"] > 50:
        recs.append({
            "priority": "medium",
            "action": "Sensor-led risk: cross-check displacement against survey prisms and "
                      "confirm instrument calibration.",
        })
    elif top["key"] == "image" and top["raw"] > 50:
        recs.append({
            "priority": "medium",
            "action": "Imagery-led risk: re-fly the face and compare against the last "
                      "baseline scan for new tension cracks.",
        })

    if trend["direction"] == "rising_fast":
        recs.append({
            "priority": "high",
            "action": f"Risk is escalating at {trend['slope_per_reading']:+.2f}%/reading — "
                      "shorten the monitoring interval and brief the incoming shift.",
        })

    for a in anomalies:
        if a["severity"] == "high":
            recs.append({
                "priority": "high",
                "action": f"{a['label']} is {a['direction']} its baseline "
                          f"({a['value']}{a['unit']} vs {a['baseline']}{a['unit']}) — "
                          "verify the instrument before acting on the reading.",
            })

    return recs


# ------------------------------------------------------------------ entrypoint

def analyse(site_name: str, history: list) -> dict:
    """
    `history` is a list of Prediction rows in **chronological order** (oldest
    first). Returns the full insight bundle rendered by the Live Monitor page.
    """
    history = history[-WINDOW:]
    if not history:
        return {
            "available": False,
            "narrative": "No readings recorded for this site yet. Start monitoring "
                         "or run an evaluation to begin building a baseline.",
            "drivers": [], "trend": None, "forecast": [], "anomalies": [],
            "stability": None, "recommendations": [], "readings_analysed": 0,
            "eta_to_threshold": None, "generated_at": utc_iso(datetime.utcnow()),
        }

    latest = history[-1]
    series = [p.final_risk or 0.0 for p in history]

    drivers = _drivers(latest)
    trend = _trend(series)
    stability = _stability(series)
    anomalies = _anomalies(history)
    eta = _time_to_threshold(series, settings.ALERT_THRESHOLD)

    return {
        "available": True,
        "narrative": _narrative(site_name, latest, drivers, trend, stability, anomalies, eta),
        "drivers": drivers,
        "trend": trend,
        "forecast": _forecast(series),
        "anomalies": anomalies,
        "stability": stability,
        "recommendations": _recommendations(latest, drivers, trend, anomalies),
        "readings_analysed": len(history),
        "eta_to_threshold": eta,
        "generated_at": utc_iso(datetime.utcnow()),
    }
