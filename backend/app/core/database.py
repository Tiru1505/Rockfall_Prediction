from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

if settings.using_sqlite:
    # SQLite: the monitoring engine runs its tick in a worker thread, so the
    # connection has to be usable outside the thread that created it.
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    # Postgres: hosted instances drop idle connections (Render closes them
    # fairly aggressively). pool_pre_ping discards dead ones instead of raising
    # "server closed the connection unexpectedly" on the next request, and
    # recycling keeps connections from ageing out mid-use.
    engine = create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
