from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Report, ServiceJob, ServicePhoto, Project, Meter, Loop, Panel
from ..schemas import report_schema
from ..services.file_upload import save_upload
from ..services.report_draft_store import load_report_draft, save_report_draft
from ..services.report_generator import (
    generate_service_reports, generate_loop_report, generate_live_asset_report,
    DEFAULT_CHECKLIST_TEMPLATES, get_checklist_template, _extract_existing_report_data
)
from ..utils.project_files import project_upload_dir
from ..config import UPLOADS_DIR
import os
from datetime import datetime
from pathlib import Path

router = APIRouter(tags=["reports", "uploads"])


@router.get("/reports/checklist-templates", response_model=dict[str, report_schema.ChecklistTemplate])
def get_checklist_templates(
    job_type: str | None = Query(None, description="Filter by job type (PM, MA, IM, EM, etc.)"),
):
    """Get available checklist templates for report generation."""
    from ..services.report_generator import DEFAULT_CHECKLIST_TEMPLATES

    if job_type:
        template = get_checklist_template(job_type)
        return {job_type.upper(): template}
    return DEFAULT_CHECKLIST_TEMPLATES


@router.post("/reports/checklist-templates/custom")
def create_custom_checklist_template(
    template: report_schema.ChecklistTemplate,
    db: Session = Depends(get_db),
):
    """Create a custom checklist template for a specific job type."""
    # In a full implementation, this would save to database
    # For now, return the template with a unique ID
    template.is_custom = True
    return template


@router.get("/reports/{report_id}/meta")
def get_report_metadata(report_id: int, db: Session = Depends(get_db)):
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    file_path = os.path.normpath(os.path.join(UPLOADS_DIR, report.file_path))

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Report file not found on disk")

    try:
        last_modified_timestamp = os.path.getmtime(file_path)
        last_modified_iso = datetime.fromtimestamp(last_modified_timestamp).isoformat()
        return {"last_modified": last_modified_iso}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not read file metadata: {str(e)}")


@router.get("/reports/by-date/{date_str}")
def get_report_by_date(
    date_str: str,  # Format: YYYYMMDD
    project_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Get report data by date for append mode (loads previous report data)."""
    try:
        target_date = datetime.strptime(date_str, "%Y%m%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYYMMDD")

    # Find reports for the date
    query = db.query(Report).filter(
        Report.report_date == target_date
    )
    if project_id:
        query = query.filter(Report.project_id == project_id)

    report = query.order_by(Report.created_at.desc()).first()
    if not report:
        return {"exists": False, "data": None}

    # Load the report file and extract data
    file_path = os.path.normpath(os.path.join(UPLOADS_DIR, report.file_path))
    if not os.path.exists(file_path):
        return {"exists": False, "data": None}

    try:
        from openpyxl import load_workbook
        wb = load_workbook(file_path)
        existing_data = _extract_existing_report_data(wb)
        wb.close()
        return {"exists": True, "data": existing_data, "file_path": report.file_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not load report: {str(e)}")


@router.get("/reports/preview/{entity_type}/{entity_id}")
def preview_asset_report(entity_type: str, entity_id: int, db: Session = Depends(get_db)):
    if entity_type == "meter":
        asset = db.get(Meter, entity_id)
    elif entity_type == "loop":
        asset = db.get(Loop, entity_id)
    elif entity_type == "panel":
        asset = db.get(Panel, entity_id)
    else:
        raise HTTPException(status_code=400, detail="Invalid entity type")

    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # This function will generate a temporary in-memory Excel file and return it
    try:
        content = generate_live_asset_report(db, entity_type, asset)
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=preview_{entity_type}_{entity_id}.xlsx"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reports/generate-by-loop", response_model=report_schema.ReportResponse)
def generate_report_by_loop(
    request_data: report_schema.GenerateLoopReportRequest,
    db: Session = Depends(get_db)
):
    project = db.get(Project, request_data.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # This will be the new function we create in report_generator.py
    report = generate_loop_report(db, project, request_data)

    return report


@router.get("/service/{service_id}/report-draft", response_model=report_schema.ReportDraftResponse)
def read_report_draft(service_id: int, db: Session = Depends(get_db)):
    service_job = db.get(ServiceJob, service_id)
    if service_job is None:
        raise HTTPException(status_code=404, detail="Service job not found")
    return load_report_draft(service_job)


@router.put("/service/{service_id}/report-draft", response_model=report_schema.ReportDraftResponse)
def update_report_draft(
    service_id: int,
    payload: report_schema.ReportDraftUpdate,
    db: Session = Depends(get_db),
):
    service_job = db.get(ServiceJob, service_id)
    if service_job is None:
        raise HTTPException(status_code=404, detail="Service job not found")
    return save_report_draft(service_job, payload.model_dump(exclude_unset=True))


@router.get("/reports", response_model=list[report_schema.ReportResponse])
def read_reports(
    project_id: int | None = None,
    service_id: int | None = None,
    report_date: datetime | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Report)
    if service_id is not None:
        query = query.filter(Report.service_id == service_id)
    elif project_id is not None:
        query = query.filter(Report.project_id == project_id)

    if report_date is not None:
        query = query.filter(Report.report_date == report_date)

    return query.order_by(Report.created_at.desc()).all()


@router.post("/reports/generate/{service_id}", response_model=list[report_schema.ReportResponse])
def generate_reports(service_id: int, db: Session = Depends(get_db)):
    service_job = db.get(ServiceJob, service_id)
    if service_job is None:
        raise HTTPException(status_code=404, detail="Service job not found")
    return generate_service_reports(db, service_job)


@router.post("/upload/photo", response_model=list[report_schema.ServicePhotoResponse])
def upload_photos(
    service_id: int = Form(...),
    files: list[UploadFile] = File(...),
    captions: list[str] = Form([]),
    titles: list[str] = Form([]),  # New: photo titles
    db: Session = Depends(get_db),
):
    service_job = db.get(ServiceJob, service_id)
    if service_job is None:
        raise HTTPException(status_code=404, detail="Service job not found")

    created_photos = []
    photos_dir = project_upload_dir(UPLOADS_DIR, service_job.project, "photos")
    for index, upload in enumerate(files):
        public_path = save_upload(upload, photos_dir, prefix="PHOTO", keep_original_name=True)
        caption = captions[index].strip() if index < len(captions) and captions[index] else None
        title = titles[index].strip() if index < len(titles) and titles[index] else None

        # Store title in caption if provided
        final_caption = title if title else caption

        photo = ServicePhoto(service_id=service_id, file_path=public_path, caption=final_caption)
        db.add(photo)
        created_photos.append(photo)

    db.commit()
    for photo in created_photos:
        db.refresh(photo)
    return created_photos
