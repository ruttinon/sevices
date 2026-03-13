from pathlib import Path
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base
from app.models import Customer, Loop, Meter, Panel, Project
from app.services.qr_scan import build_qr_payload, resolve_qr_identifier


def seed_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    session = TestingSessionLocal()
    customer = Customer(name="QR Customer")
    session.add(customer)
    session.flush()

    project = Project(customer_id=customer.id, name="QR Project", location="Bangkok")
    session.add(project)
    session.flush()

    panel = Panel(project_id=project.id, panel_code="P-01", panel_name="Main Panel")
    session.add(panel)
    session.flush()

    loop = Loop(panel_id=panel.id, loop_code="Loop-01", loop_name="Main Loop")
    session.add(loop)
    session.flush()

    meter = Meter(loop_id=loop.id, meter_code="M-01", meter_name="Meter 01", serial_number="SER-001")
    session.add(meter)
    session.commit()
    return session, project.id, panel.id, loop.id, meter.id


def test_resolve_structured_meter_qr_returns_exact_meter():
    session, project_id, _panel_id, _loop_id, meter_id = seed_session()
    try:
        payload = build_qr_payload("meter", meter_id, project_id)
        result = resolve_qr_identifier(session, payload)

        assert result is not None
        assert result["entity_type"] == "meter"
        assert result["meter_id"] == meter_id
        assert result["project_id"] == project_id
        assert result["project_name"] == "QR Project"
    finally:
        session.close()


def test_resolve_structured_project_qr_returns_project():
    session, project_id, _panel_id, _loop_id, _meter_id = seed_session()
    try:
        payload = build_qr_payload("project", project_id, project_id)
        result = resolve_qr_identifier(session, payload)

        assert result is not None
        assert result["entity_type"] == "project"
        assert result["project_id"] == project_id
        assert result["project_name"] == "QR Project"
    finally:
        session.close()
