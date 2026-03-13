from datetime import datetime
from pathlib import Path
import json

from ..config import REPORT_DRAFTS_DIR, UPLOADS_DIR
from ..utils.project_files import project_upload_dir


def load_report_draft(service_job) -> dict:
    draft_path = _draft_path(service_job)
    payload = _default_draft(service_job)
    if not draft_path.exists():
        legacy_path = _legacy_draft_path(service_job.id)
        if not legacy_path.exists():
            return payload
        draft_path = legacy_path

    try:
        stored = json.loads(draft_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return payload

    payload.update(
        {
            "report_name": _string_value(stored.get("report_name")) or payload["report_name"],
            "inspection_product": _string_value(stored.get("inspection_product")) or payload["inspection_product"],
            "inspection_by": _string_value(stored.get("inspection_by")) or payload["inspection_by"],
            "approve_by": _string_value(stored.get("approve_by")) or payload["approve_by"],
            "overview_note": _string_value(stored.get("overview_note")) or payload["overview_note"],
            "updated_at": _string_value(stored.get("updated_at")) or payload["updated_at"],
        }
    )
    return payload


def save_report_draft(service_job, update_data: dict) -> dict:
    payload = load_report_draft(service_job)
    for key in ("report_name", "inspection_product", "inspection_by", "approve_by", "overview_note"):
        if key in update_data:
            payload[key] = _string_value(update_data.get(key))

    payload["updated_at"] = datetime.utcnow().isoformat(timespec="seconds")
    draft_path = _draft_path(service_job)
    draft_path.parent.mkdir(parents=True, exist_ok=True)
    draft_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    legacy_path = _legacy_draft_path(service_job.id)
    if legacy_path.exists() and legacy_path != draft_path:
        legacy_path.unlink(missing_ok=True)
    return payload


def _draft_path(service_job) -> Path:
    project_dir = project_upload_dir(UPLOADS_DIR, service_job.project, "documents", "report_drafts")
    return project_dir / f"service-{service_job.id:06d}.json"


def _legacy_draft_path(service_id: int) -> Path:
    return REPORT_DRAFTS_DIR / f"service-{service_id:06d}.json"


def _default_draft(service_job) -> dict:
    customer = service_job.project.customer if service_job.project else None
    meter = service_job.meter
    loop = meter.loop if meter else None
    panel = loop.panel if loop else None
    asset_name = (
        meter.meter_name
        if meter and meter.meter_name
        else panel.panel_name
        if panel and panel.panel_name
        else service_job.project.name
    )
    service_type = _string_value(service_job.service_type).upper() or "PM"
    inspection_product = f"{service_type} service report for {asset_name}".strip()

    return {
        "service_id": service_job.id,
        "report_name": "",
        "inspection_product": inspection_product,
        "inspection_by": _string_value(service_job.engineer_name),
        "approve_by": _string_value(customer.contact_name if customer else ""),
        "overview_note": _string_value(service_job.note),
        "updated_at": None,
    }


def _string_value(value) -> str:
    if value is None:
        return ""
    return str(value).strip()
