from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field

from app.core.timeutil import UtcDateTime


# ---------- Auth ----------
class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    role: Optional[str] = "operator"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Weather ----------
class WeatherPoint(BaseModel):
    timestamp: str
    temperature_c: Optional[float]
    humidity_pct: Optional[float]
    rainfall_mm: Optional[float]
    wind_speed: Optional[float]
    pressure: Optional[float]


class WeatherSummary(BaseModel):
    latest: WeatherPoint
    weather_risk: float
    trend: List[WeatherPoint]


# ---------- Sensors ----------
class SensorReading(BaseModel):
    timestamp: UtcDateTime
    ground_vibration: float
    tilt_deg: float
    soil_moisture: float
    accelerometer_g: float
    seismic_activity: float
    sensor_risk: float


# ---------- Earthquakes ----------
class EarthquakeEvent(BaseModel):
    time: str
    magnitude: Optional[float]
    depth: Optional[float]
    place: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]


# ---------- Prediction / Risk ----------
class RiskBreakdown(BaseModel):
    image_risk: float
    sensor_risk: float
    weather_risk: float
    final_risk: float
    risk_level: str
    confidence: float


class ImagePredictionOut(BaseModel):
    image_filename: str
    image_risk: float
    confidence: float
    predicted_class: str
    gradcam_note: str


class PredictionOut(BaseModel):
    id: int
    timestamp: UtcDateTime
    site_id: Optional[str] = None
    site_name: str
    source: Optional[str] = "manual"
    simulated: Optional[int] = 0
    image_filename: Optional[str]
    image_risk: float
    sensor_risk: float
    weather_risk: float
    final_risk: float
    risk_level: str
    confidence: float
    rainfall_mm: Optional[float]
    humidity_pct: Optional[float]
    temperature_c: Optional[float]
    ground_vibration: Optional[float]
    soil_moisture: Optional[float]
    tilt_deg: Optional[float]

    class Config:
        from_attributes = True


class AlertOut(BaseModel):
    id: int
    timestamp: UtcDateTime
    site_id: Optional[str] = None
    site_name: str
    risk_level: str
    final_risk: float
    message: str
    acknowledged: int
    simulated: Optional[int] = 0

    class Config:
        from_attributes = True


class AnalyticsSummary(BaseModel):
    total_predictions: int
    total_alerts: int
    risk_distribution: dict
    avg_final_risk: float
    predictions_last_30_days: List[dict]


# ---------- Mining sites ----------
class SiteCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    location: Optional[str] = ""
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    mine_type: Optional[str] = "Open-Pit"
    rock_type: Optional[str] = "Granite"
    bench_height_m: Optional[float] = Field(default=15.0, gt=0, le=200)
    slope_angle_deg: Optional[float] = Field(default=45.0, ge=0, le=90)
    hazard_factor: Optional[float] = Field(default=1.0, ge=0.1, le=3.0)
    monitoring_enabled: Optional[bool] = True
    notes: Optional[str] = None


class SiteUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    location: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    mine_type: Optional[str] = None
    rock_type: Optional[str] = None
    bench_height_m: Optional[float] = Field(default=None, gt=0, le=200)
    slope_angle_deg: Optional[float] = Field(default=None, ge=0, le=90)
    hazard_factor: Optional[float] = Field(default=None, ge=0.1, le=3.0)
    monitoring_enabled: Optional[bool] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class SiteOut(BaseModel):
    id: int
    site_id: str
    name: str
    location: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    mine_type: str
    rock_type: Optional[str]
    bench_height_m: Optional[float]
    slope_angle_deg: Optional[float]
    hazard_factor: Optional[float]
    status: str
    monitoring_enabled: int
    notes: Optional[str]
    created_at: UtcDateTime

    class Config:
        from_attributes = True


class SiteSummaryOut(SiteOut):
    """A site plus its current live state, for the switcher and site cards."""
    current_risk: Optional[float] = None
    current_level: Optional[str] = None
    last_evaluated: Optional[UtcDateTime] = None
    total_predictions: int = 0
    open_alerts: int = 0
    avg_risk_24h: Optional[float] = None
    sparkline: List[dict] = []


# ---------- Live monitoring ----------
class MonitorStatus(BaseModel):
    running: bool
    interval_seconds: int
    last_tick: Optional[UtcDateTime]
    tick_count: int
    sites_tracked: int
    last_error: Optional[str]


class MonitorControl(BaseModel):
    action: str  # "start" | "stop" | "tick"
    interval_seconds: Optional[int] = Field(default=None, ge=5, le=3600)


# ---------- Drill mode ----------
class DrillStart(BaseModel):
    """Force a site's risk to a target so the alert path can be demonstrated."""
    site_id: str
    target_risk: float = Field(default=88.0, ge=5, le=99)
    mode: str = Field(default="ramp", pattern="^(ramp|instant)$")
    # Evaluations the ramp is spread over. Each step is one monitoring cycle,
    # so 4 steps at a 60s interval takes ~4 minutes.
    steps: int = Field(default=4, ge=1, le=60)
