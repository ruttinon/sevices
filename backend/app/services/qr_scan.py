from urllib.parse import parse_qs, urlparse

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..config import FRONTEND_URL
from ..models import Loop, Meter, Panel, Project


def build_qr_payload(entity_type: str, entity_id: int, project_id: int) -> str:
    """Generate a scannable web URL that opens the customer portal."""
    base = FRONTEND_URL.rstrip('/')
    # Use HashRouter format as the app uses HashRouter
    if entity_type == 'project':
        return f"{base}/#/customer/portal/{project_id}"
    elif entity_type == 'panel':
        return f"{base}/#/customer/panel/{entity_id}?project={project_id}"
    else:
        # loop and meter -> portal with query params
        return f"{base}/#/customer/portal/{project_id}?type={entity_type}&id={entity_id}"


def _project_result(project: Project) -> dict:
    return {
        "entity_type": "project",
        "entity_id": project.id,
        "title": project.name,
        "subtitle": project.location,
        "project_id": project.id,
        "project_name": project.name,
        "detail_path": f"/customer/project/{project.id}",
    }


def _panel_result(panel: Panel) -> dict:
    return {
        "entity_type": "panel",
        "entity_id": panel.id,
        "title": panel.panel_name,
        "subtitle": panel.panel_code,
        "project_id": panel.project_id,
        "project_name": panel.project.name if panel.project else None,
        "panel_id": panel.id,
        "detail_path": f"/customer/panel/{panel.id}",
    }


def _loop_result(loop: Loop) -> dict:
    return {
        "entity_type": "loop",
        "entity_id": loop.id,
        "title": loop.loop_name,
        "subtitle": loop.loop_code,
        "project_id": loop.panel.project_id,
        "project_name": loop.panel.project.name if loop.panel and loop.panel.project else None,
        "panel_id": loop.panel_id,
        "loop_id": loop.id,
        "detail_path": f"/customer/portal/{loop.panel.project_id}?type=loop&id={loop.id}",
    }


def _meter_result(meter: Meter) -> dict:
    return {
        "entity_type": "meter",
        "entity_id": meter.id,
        "title": meter.meter_name,
        "subtitle": meter.serial_number or meter.meter_code,
        "project_id": meter.loop.panel.project_id,
        "project_name": meter.loop.panel.project.name if meter.loop and meter.loop.panel and meter.loop.panel.project else None,
        "panel_id": meter.loop.panel_id,
        "loop_id": meter.loop_id,
        "meter_id": meter.id,
        "detail_path": f"/customer/portal/{meter.loop.panel.project_id}?type=meter&id={meter.id}",
    }


def _parse_structured_qr(code: str) -> tuple[str, int, int | None] | None:
    try:
        parsed = urlparse(code)
    except ValueError:
        return None

    # Support old format: sevices://scan?projectId=1&entityType=meter&entityId=5
    if parsed.scheme.lower() == "sevices" and parsed.netloc.lower() == "scan":
        params = parse_qs(parsed.query)
        entity_type = str(params.get("entityType", [None])[0] or "").strip().lower()
        entity_id_raw = params.get("entityId", [None])[0]
        project_id_raw = params.get("projectId", [None])[0]
        if entity_type not in {"project", "panel", "loop", "meter"}:
            return None
        try:
            entity_id = int(entity_id_raw)
        except (TypeError, ValueError):
            return None
        try:
            project_id = int(project_id_raw) if project_id_raw is not None else None
        except (TypeError, ValueError):
            project_id = None
        return entity_type, entity_id, project_id

    # Support new format: http://host/#/customer/portal/{projectId}?type=meter&id=5
    # or http://host/customer/portal/{projectId}?type=meter&id=5
    if parsed.scheme in ("http", "https"):
        import re
        
        # Check path AND fragment for the pattern, as HashRouter uses fragment
        source = parsed.path + (f"#{parsed.fragment}" if parsed.fragment else "")
        
        # Extract query params from both query and fragment
        params = parse_qs(parsed.query)
        if parsed.fragment and "?" in parsed.fragment:
            frag_query = parsed.fragment.split("?", 1)[1]
            params.update(parse_qs(frag_query))

        # /customer/portal/1 or /customer/portal/1?type=meter&id=5
        portal_match = re.search(r'/customer/portal/(\d+)', source)
        if portal_match:
            project_id = int(portal_match.group(1))
            entity_type = str(params.get("type", ["project"])[0]).strip().lower()
            entity_id_raw = params.get("id", [None])[0]
            if entity_type == "project" or entity_id_raw is None:
                return "project", project_id, project_id
            try:
                return entity_type, int(entity_id_raw), project_id
            except (TypeError, ValueError):
                return "project", project_id, project_id

        # /customer/panel/5?project=1
        panel_match = re.search(r'/customer/panel/(\d+)', source)
        if panel_match:
            entity_id = int(panel_match.group(1))
            project_id_raw = params.get("project", [None])[0]
            project_id = int(project_id_raw) if project_id_raw else None
            return "panel", entity_id, project_id

    return None


def _resolve_structured_qr(db: Session, code: str):
    parsed = _parse_structured_qr(code)
    if parsed is None:
        return None

    entity_type, entity_id, encoded_project_id = parsed
    if entity_type == "project":
        project = db.get(Project, entity_id)
        if project and (encoded_project_id is None or project.id == encoded_project_id):
            return _project_result(project)
        return None

    if entity_type == "panel":
        panel = db.get(Panel, entity_id)
        if panel and (encoded_project_id is None or panel.project_id == encoded_project_id):
            return _panel_result(panel)
        return None

    if entity_type == "loop":
        loop = db.get(Loop, entity_id)
        if loop and (encoded_project_id is None or loop.panel.project_id == encoded_project_id):
            return _loop_result(loop)
        return None

    meter = db.get(Meter, entity_id)
    if meter and (encoded_project_id is None or meter.loop.panel.project_id == encoded_project_id):
        return _meter_result(meter)
    return None


def resolve_qr_identifier(db: Session, raw_code: str, project_id: int | None = None):
    code = raw_code.strip()
    lower_code = code.lower()

    structured_result = _resolve_structured_qr(db, code)
    if structured_result is not None:
        return structured_result

    if lower_code.startswith("project:"):
        try:
            project_id = int(code.split(":", 1)[1])
        except ValueError:
            return None
        project = db.get(Project, project_id)
        if project:
            return _project_result(project)

    if lower_code.startswith("panel:"):
        panel_code = code.split(":", 1)[1]
        panel_query = db.query(Panel).filter(Panel.panel_code.ilike(panel_code))
        if project_id is not None:
            panel_query = panel_query.filter(Panel.project_id == project_id)
        panel = panel_query.first()
        if panel:
            return _panel_result(panel)

    if lower_code.startswith("loop:"):
        loop_code = code.split(":", 1)[1]
        loop_query = db.query(Loop).join(Panel).filter(Loop.loop_code.ilike(loop_code))
        if project_id is not None:
            loop_query = loop_query.filter(Panel.project_id == project_id)
        loop = loop_query.first()
        if loop:
            return _loop_result(loop)

    meter_query = db.query(Meter).join(Loop).join(Panel).filter(Meter.meter_code.ilike(code))
    if project_id is not None:
        meter_query = meter_query.filter(Panel.project_id == project_id)
    meter = meter_query.first()
    if meter:
        return _meter_result(meter)

    panel_query = db.query(Panel).filter(
        or_(Panel.panel_code.ilike(code), Panel.serial_number.ilike(code), Panel.panel_name.ilike(code))
    )
    if project_id is not None:
        panel_query = panel_query.filter(Panel.project_id == project_id)
    panel = panel_query.first()
    if panel:
        return _panel_result(panel)

    loop_query = (
        db.query(Loop)
        .join(Panel)
        .filter(
            or_(
                Loop.loop_code.ilike(code),
                Loop.loop_name.ilike(code),
                Loop.converter_ip.ilike(code),
                Loop.mac_address.ilike(code),
            )
        )
    )
    if project_id is not None:
        loop_query = loop_query.filter(Panel.project_id == project_id)
    loop = loop_query.first()
    if loop:
        return _loop_result(loop)

    meter_query = (
        db.query(Meter)
        .join(Loop)
        .join(Panel)
        .filter(
            or_(
                Meter.serial_number.ilike(code),
                Meter.meter_code.ilike(code),
                Meter.meter_name.ilike(code),
                Meter.device_address.ilike(code),
            )
        )
    )
    if project_id is not None:
        meter_query = meter_query.filter(Panel.project_id == project_id)
    meter = meter_query.first()
    if meter:
        return _meter_result(meter)

    return None
