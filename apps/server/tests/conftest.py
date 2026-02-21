from __future__ import annotations

import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.models import Base

os.environ.setdefault("METROX_MASTER_WRAP_KEY", "test-wrap-key-for-unit-tests")


@pytest.fixture
def db_session() -> Session:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)
    session = session_local()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()
