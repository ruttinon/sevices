from datetime import datetime
from pydantic import BaseModel
from typing import Optional, List

from .report_schema import ReportResponse, ServicePhotoResponse

class ChecklistItem(BaseModel):
    label: str
    status: str = "pass"
    note: Optional[str] = None


class ServiceJobBase(BaseModel):
    project_id: int
    meter_id: Optional[int] = None
    engineer_id: Optional[int] = None
    engineer_name: Optional[str] = None
    service_type: str = "PM"
    service_date: datetime
    status: str = "Pending"
    note: Optional[str] = None
    checklist_items: List[ChecklistItem] = []

class ServiceJobCreate(ServiceJobBase):
    pass


class ServiceJobUpdate(BaseModel):
    meter_id: Optional[int] = None
    engineer_id: Optional[int] = None
    engineer_name: Optional[str] = None
    service_type: Optional[str] = None
    service_date: Optional[datetime] = None
    status: Optional[str] = None
    note: Optional[str] = None
    checklist_items: Optional[List[ChecklistItem]] = None


class ServiceJobResponse(ServiceJobBase):
    id: int
    created_at: datetime
    photos: List[ServicePhotoResponse] = []
    reports: List[ReportResponse] = []

    class Config:
        from_attributes = True
