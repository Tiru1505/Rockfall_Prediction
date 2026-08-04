import enum
from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, DateTime, Enum, Text
from app.core.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    operator = "operator"
    guest = "guest"


class RiskLevel(str, enum.Enum):
    safe = "Safe"
    low = "Low"
    medium = "Medium"
    high = "High"
    critical = "Critical"


class MineType(str, enum.Enum):
    open_pit = "Open-Pit"
    underground = "Underground"
    quarry = "Quarry"
    strip = "Strip"


class SiteStatus(str, enum.Enum):
    active = "active"
    paused = "paused"
    archived = "archived"


class MiningSite(Base):
    """
    A monitored mining site. Each site carries a geology/geometry profile that
    seeds its own sensor simulation and biases its risk baseline, so different
    sites produce genuinely different signatures rather than the same feed
    relabelled.
    """
    __tablename__ = "mining_sites"

    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(String, unique=True, index=True, nullable=False)  # slug, e.g. "site-a"
    name = Column(String, nullable=False)
    location = Column(String, default="")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    mine_type = Column(Enum(MineType), default=MineType.open_pit)
    rock_type = Column(String, default="Granite")
    bench_height_m = Column(Float, default=15.0)
    slope_angle_deg = Column(Float, default=45.0)

    # Operator-tunable multiplier on this site's baseline hazard (0.5 = very
    # stable ground, 1.5 = heavily fractured/weathered). Feeds the simulator.
    hazard_factor = Column(Float, default=1.0)

    status = Column(Enum(SiteStatus), default=SiteStatus.active)
    monitoring_enabled = Column(Integer, default=1)  # 0/1 boolean
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.operator)
    created_at = Column(DateTime, default=datetime.utcnow)


class Prediction(Base):
    """A single fused risk prediction (image + sensor + weather)."""
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    site_id = Column(String, default="site-a", index=True)
    site_name = Column(String, default="Site-A")
    source = Column(String, default="manual")  # "manual" | "monitor"

    image_filename = Column(String, nullable=True)
    image_risk = Column(Float, default=0.0)          # 0-100
    sensor_risk = Column(Float, default=0.0)          # 0-100
    weather_risk = Column(Float, default=0.0)         # 0-100
    final_risk = Column(Float, default=0.0)           # 0-100
    risk_level = Column(Enum(RiskLevel), default=RiskLevel.safe)
    confidence = Column(Float, default=0.0)           # 0-1

    rainfall_mm = Column(Float, nullable=True)
    humidity_pct = Column(Float, nullable=True)
    temperature_c = Column(Float, nullable=True)
    ground_vibration = Column(Float, nullable=True)
    soil_moisture = Column(Float, nullable=True)
    tilt_deg = Column(Float, nullable=True)

    notes = Column(Text, nullable=True)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    prediction_id = Column(Integer, nullable=True)
    site_id = Column(String, default="site-a", index=True)
    site_name = Column(String, default="Site-A")
    risk_level = Column(Enum(RiskLevel), default=RiskLevel.high)
    final_risk = Column(Float, default=0.0)
    message = Column(String, default="")
    acknowledged = Column(Integer, default=0)  # 0/1 boolean
