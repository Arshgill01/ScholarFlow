import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

import models
from database import Base, configure_engine, reset_engine
from main import create_app

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("INIT_DB_ON_STARTUP", "false")


@pytest.fixture
def engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    configure_engine(engine)
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    reset_engine()
    engine.dispose()


@pytest.fixture
def client(engine):
    from fastapi.testclient import TestClient

    with TestClient(create_app()) as test_client:
        yield test_client
