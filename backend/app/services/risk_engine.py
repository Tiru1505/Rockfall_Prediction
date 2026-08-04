from app.core.config import settings


def risk_level_from_score(score: float) -> str:
    if score < 20:
        return "Safe"
    if score < 40:
        return "Low"
    if score < 60:
        return "Medium"
    if score < 80:
        return "High"
    return "Critical"


def fuse_risk(image_risk: float, sensor_risk: float, weather_risk: float) -> dict:
    final = (
        settings.WEIGHT_IMAGE * image_risk
        + settings.WEIGHT_SENSOR * sensor_risk
        + settings.WEIGHT_WEATHER * weather_risk
    )
    final = round(min(max(final, 0), 100), 2)
    return {
        "image_risk": round(image_risk, 2),
        "sensor_risk": round(sensor_risk, 2),
        "weather_risk": round(weather_risk, 2),
        "final_risk": final,
        "risk_level": risk_level_from_score(final),
    }
