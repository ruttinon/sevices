from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Meter, Project, ServiceJob
from ..schemas import service_schema
from ..services.report_generator import generate_service_reports
from ..utils.validators import validate_service_status, validate_service_type

router = APIRouter(tags=["service"])


@router.get("/service", response_model=list[service_schema.ServiceJobResponse])
def read_service_jobs(
    project_id: int | None = None,
    meter_id: int | None = None,
    status: str | None = None,
    service_type: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(ServiceJob)
    if project_id is not None:
        query = query.filter(ServiceJob.project_id == project_id)
    if meter_id is not None:
        query = query.filter(ServiceJob.meter_id == meter_id)
    if status:
        query = query.filter(ServiceJob.status == status)
    if service_type:
        query = query.filter(ServiceJob.service_type == service_type)
    return query.order_by(ServiceJob.service_date.desc()).all()


@router.get("/todos/{service_date}", response_model=list[service_schema.ServiceJobResponse])
def read_todos_by_date(service_date: date, db: Session = Depends(get_db)):
    """Retrieve service jobs for a specific date (YYYY-MM-DD)."""
    # Use cast or filter to match date part only if needed, or simple between
    start_dt = datetime.combine(service_date, datetime.min.time())
    end_dt = datetime.combine(service_date, datetime.max.time())
    return (
        db.query(ServiceJob)
        .filter(ServiceJob.service_date >= start_dt, ServiceJob.service_date <= end_dt)
        .order_by(ServiceJob.service_date.asc())
        .all()
    )


@router.get("/notes/recent/", response_model=list[service_schema.ServiceJobResponse])
def read_recent_notes(limit: int = Query(5, gt=0, le=50), db: Session = Depends(get_db)):
    """Retrieve recent service jobs that have notes."""
    return (
        db.query(ServiceJob)
        .filter(ServiceJob.note != None, ServiceJob.note != "")
        .order_by(ServiceJob.service_date.desc())
        .limit(limit)
        .all()
    )


@router.post("/service", response_model=service_schema.ServiceJobResponse)
def create_service_job(job: service_schema.ServiceJobCreate, db: Session = Depends(get_db)):
    if db.get(Project, job.project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if job.meter_id is not None and db.get(Meter, job.meter_id) is None:
        raise HTTPException(status_code=404, detail="Meter not found")

    try:
        validate_service_type(job.service_type)
        validate_service_status(job.status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db_job = ServiceJob(**job.model_dump())
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return db_job


@router.get("/service/{service_id}", response_model=service_schema.ServiceJobResponse)
def read_service_job(service_id: int, db: Session = Depends(get_db)):
    job = db.get(ServiceJob, service_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Service job not found")
    return job


@router.patch("/service/{service_id}", response_model=service_schema.ServiceJobResponse)
def update_service_job(
    service_id: int,
    job_update: service_schema.ServiceJobUpdate,
    db: Session = Depends(get_db),
):
    job = db.get(ServiceJob, service_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Service job not found")

    update_data = job_update.model_dump(exclude_unset=True)
    if "project_id" in update_data and db.get(Project, update_data["project_id"]) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if "meter_id" in update_data and update_data["meter_id"] is not None and db.get(Meter, update_data["meter_id"]) is None:
        raise HTTPException(status_code=404, detail="Meter not found")
    if "service_type" in update_data:
        try:
            validate_service_type(update_data["service_type"])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if "status" in update_data:
        try:
            validate_service_status(update_data["status"])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    for field, value in update_data.items():
        setattr(job, field, value)

    db.commit()
    db.refresh(job)
    return job


@router.post("/service/{service_id}/complete", response_model=service_schema.ServiceJobResponse)
def complete_service_job(service_id: int, db: Session = Depends(get_db)):
    job = db.get(ServiceJob, service_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Service job not found")

    job.status = "Completed"
    db.commit()
    db.refresh(job)
    generate_service_reports(db, job)
    db.refresh(job)
    return job
