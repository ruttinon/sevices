from pathlib import Path
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base
from app.models import Customer, Loop, Meter, Panel, Project
from app.services.ocr_scan import extract_field_hints, match_equipment_from_text


def seed_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    session = TestingSessionLocal()
    customer = Customer(name="Test Customer")
    session.add(customer)
    session.flush()

    project = Project(customer_id=customer.id, name="Test Project", location="Bangkok")
    session.add(project)
    session.flush()

    panel = Panel(
        project_id=project.id,
        panel_code="9DP",
        panel_name="ESI",
        serial_number="PANEL-9DP-001",
        location_note="Retail Management System / 192.168.0.1",
    )
    session.add(panel)
    session.flush()

    loop = Loop(
        panel_id=panel.id,
        loop_code="Loop1",
        loop_name="Loop1",
        converter_name="Retail Management System",
        converter_ip="192.168.0.1",
        mac_address="00:26:45:00:FD:95",
    )
    session.add(loop)
    session.flush()

    meter = Meter(
        loop_id=loop.id,
        meter_code="901",
        meter_name="901",
        serial_number="1177340118",
        device_address="1",
        model="CEM-C5",
        status="Active",
    )
    session.add(meter)
    session.commit()
    return session


def add_duplicate_project_meter(session):
    customer = Customer(name="Second Customer")
    session.add(customer)
    session.flush()

    project = Project(customer_id=customer.id, name="Second Project", location="Rayong")
    session.add(project)
    session.flush()

    panel = Panel(
        project_id=project.id,
        panel_code="ALT-9DP",
        panel_name="ALT ESI",
        serial_number="PANEL-9DP-002",
        location_note="Warehouse",
    )
    session.add(panel)
    session.flush()

    loop = Loop(
        panel_id=panel.id,
        loop_code="LoopX",
        loop_name="LoopX",
        converter_name="Warehouse RMS",
        converter_ip="10.0.0.8",
        mac_address="00:26:45:00:FD:99",
    )
    session.add(loop)
    session.flush()

    meter = Meter(
        loop_id=loop.id,
        meter_code="901",
        meter_name="901-X",
        serial_number="1177340118",
        device_address="8",
        model="CEM-C6",
        status="Active",
    )
    session.add(meter)
    session.commit()
    return project.id


def test_extract_field_hints_does_not_treat_ip_segments_as_serial():
    hints = extract_field_hints("Device Address 192.168.0.1")
    assert hints["device_address"] == "192.168.0.1"
    assert hints["serial_number"] is None


def test_match_equipment_prefers_exact_panel_serial():
    session = seed_session()
    try:
        results = match_equipment_from_text(session, "Panel Name ESI Serial PANEL-9DP-001")
        assert [result["entity_type"] for result in results] == ["panel"]
        assert results[0]["subtitle"] == "9DP"
    finally:
        session.close()


def test_match_equipment_prefers_exact_loop_ip():
    session = seed_session()
    try:
        results = match_equipment_from_text(session, "192.168.0.1")
        assert [result["entity_type"] for result in results] == ["loop"]
        assert results[0]["subtitle"] == "192.168.0.1"
    finally:
        session.close()


def test_match_equipment_prefers_exact_meter_code():
    session = seed_session()
    try:
        results = match_equipment_from_text(session, "meter 901")
        assert [result["entity_type"] for result in results] == ["meter"]
        assert results[0]["title"] == "901"
    finally:
        session.close()


def test_match_equipment_can_limit_results_to_single_project():
    session = seed_session()
    try:
        selected_project_id = add_duplicate_project_meter(session)
        results = match_equipment_from_text(session, "1177340118", project_id=selected_project_id)

        assert results
        assert all(result["project_id"] == selected_project_id for result in results)
        assert results[0]["project_name"] == "Second Project"
    finally:
        session.close()
