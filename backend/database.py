import os
from typing import Generator, Optional

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

Base = declarative_base()
SessionLocal = sessionmaker(autocommit=False, autoflush=False)

_engine: Optional[Engine] = None


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is not set")
    return database_url


def get_engine() -> Engine:
    global _engine

    if _engine is None:
        database_url = get_database_url()
        connect_args = {}

        if database_url.startswith("sqlite"):
            connect_args["check_same_thread"] = False

        _engine = create_engine(database_url, connect_args=connect_args)
        SessionLocal.configure(bind=_engine)

    return _engine


def configure_engine(engine: Engine) -> None:
    global _engine
    _engine = engine
    SessionLocal.configure(bind=engine)


def reset_engine() -> None:
    global _engine
    _engine = None
    SessionLocal.configure(bind=None)


def get_db() -> Generator:
    get_engine()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
