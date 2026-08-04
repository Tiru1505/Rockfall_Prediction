"""
Startup bootstrap: lightweight schema migration + default site seeding.

`Base.metadata.create_all()` creates missing *tables* but never adds missing
*columns* to a table that already exists, so an existing `rockfall.db` from
before multi-site support would keep the old `predictions`/`alerts` shape and
every query touching `site_id` would fail. This module adds the missing columns
in place (SQLite `ALTER TABLE ... ADD COLUMN`) and backfills them from the old
`site_name` values, then seeds the default mining sites on first run.

It is idempotent: safe to run on every startup.
"""
import re
from datetime import datetime

from sqlalchemy import inspect, text

from app.core.database import engine, SessionLocal
from app.models.db_models import MiningSite, MineType, SiteStatus, Prediction, Alert


# column name -> SQL type + default, applied only if the column is absent
_ADDED_COLUMNS = {
    "predictions": {
        "site_id": "VARCHAR DEFAULT 'site-a'",
        "source": "VARCHAR DEFAULT 'manual'",
        "simulated": "INTEGER DEFAULT 0",
    },
    "alerts": {
        "site_id": "VARCHAR DEFAULT 'site-a'",
        "simulated": "INTEGER DEFAULT 0",
    },
}


DEFAULT_SITES = [
    {
        "site_id": "site-a",
        "name": "Bailadila Iron Ore — Bench 4",
        "location": "Dantewada, Chhattisgarh",
        "latitude": 18.6667,
        "longitude": 81.2167,
        "mine_type": MineType.open_pit,
        "rock_type": "Banded Hematite Quartzite",
        "bench_height_m": 15.0,
        "slope_angle_deg": 48.0,
        "hazard_factor": 1.0,
        "notes": "Primary monitored bench. Heaviest haul traffic on site.",
    },
    {
        "site_id": "site-b",
        "name": "Jharia Coalfield — North Highwall",
        "location": "Dhanbad, Jharkhand",
        "latitude": 23.7500,
        "longitude": 86.4167,
        "mine_type": MineType.strip,
        "rock_type": "Sandstone / Shale interbeds",
        "bench_height_m": 22.0,
        "slope_angle_deg": 55.0,
        "hazard_factor": 1.28,
        "notes": "Steep highwall in weak interbedded strata — historically the "
                 "most failure-prone face in the network.",
    },
    {
        "site_id": "site-c",
        "name": "Panna Granite Quarry — West Face",
        "location": "Panna, Madhya Pradesh",
        "latitude": 24.7180,
        "longitude": 80.1810,
        "mine_type": MineType.quarry,
        "rock_type": "Massive Granite",
        "bench_height_m": 9.0,
        "slope_angle_deg": 38.0,
        "hazard_factor": 0.72,
        "notes": "Competent massive rock, shallow benches. Low baseline hazard.",
    },
]


def slugify(value: str) -> str:
    """'North Highwall 2' -> 'north-highwall-2'. Used for generated site ids."""
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return slug or "site"


def migrate_schema() -> None:
    """Add any columns introduced after the DB file was first created."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table, columns in _ADDED_COLUMNS.items():
            if table not in existing_tables:
                continue  # create_all() will build it with the current schema
            present = {c["name"] for c in inspector.get_columns(table)}
            for column, ddl in columns.items():
                if column not in present:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))


def backfill_site_ids() -> None:
    """Derive site_id from the legacy free-text site_name on pre-migration rows."""
    db = SessionLocal()
    try:
        for model in (Prediction, Alert):
            rows = db.query(model).filter(
                (model.site_id.is_(None)) | (model.site_id == "")
            ).all()
            for row in rows:
                row.site_id = slugify(row.site_name or "site-a")
            if rows:
                db.commit()
    finally:
        db.close()


def seed_default_sites() -> None:
    """Create the starter site network the first time the app runs."""
    db = SessionLocal()
    try:
        if db.query(MiningSite).count() > 0:
            return
        for spec in DEFAULT_SITES:
            db.add(MiningSite(
                **spec,
                status=SiteStatus.active,
                monitoring_enabled=1,
                created_at=datetime.utcnow(),
            ))
        db.commit()
    finally:
        db.close()


def run() -> None:
    migrate_schema()
    backfill_site_ids()
    seed_default_sites()
