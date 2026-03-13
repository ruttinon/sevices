from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class ReportResponse(BaseModel):
    id: int
    service_id: Optional[int] = None
    project_id: Optional[int] = None
    file_path: str
    created_at: datetime
    report_date: Optional[datetime] = None  # For date-based filename tracking

    class Config:
        from_attributes = True


class ServicePhotoResponse(BaseModel):
    id: int
    service_id: int
    file_path: str
    caption: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PhotoWithTitle(BaseModel):
    """Photo with editable title for report items"""
    file_path: str
    title: str = ""  # Editable photo title
    caption: Optional[str] = None  # Optional additional caption


class ReportDraftBase(BaseModel):
    report_name: Optional[str] = None
    inspection_product: Optional[str] = None
    inspection_by: Optional[str] = None
    approve_by: Optional[str] = None
    overview_note: Optional[str] = None


class ReportDraftUpdate(ReportDraftBase):
    pass


class ReportDraftResponse(ReportDraftBase):
    service_id: int
    updated_at: Optional[str] = None


class ChecklistTopic(BaseModel):
    """Customizable checklist topic for different job types"""
    id: str  # Unique identifier like "pm1_0" or "custom_1"
    section: str  # Section name like "1. ตรวจสอบทั่วไป"
    label: str  # The check item text
    order: int  # Order within section


class ChecklistTemplate(BaseModel):
    """Template for a job type (PM, MA, IM, EM, etc.)"""
    job_type: str  # 'PM', 'MA', 'IM', 'EM', 'CM', etc.
    name: str  # Display name
    topics: List[ChecklistTopic]
    is_custom: bool = False  # Whether this is a user-created template


class MeterChecklistItem(BaseModel):
    label: str
    status: str  # 'Pass', 'Fail', 'N/A'
    remark: Optional[str] = None
    # When status is 'Fail', remark is mandatory
    required_remark: bool = Field(default=False, description="True when status is 'Fail'")


class MeterReportData(BaseModel):
    meter_code: str
    meter_name: Optional[str] = None
    online_status: bool
    accuracy_status: str  # 'Pass', 'Not Accurate'
    energy_reading: Optional[float] = None
    comment: Optional[str] = None
    checklist: List[MeterChecklistItem]
    photos: List[PhotoWithTitle]  # Now supports editable titles


class GenerateLoopReportRequest(BaseModel):
    project_id: int
    loop_names: List[str]
    report_type: str  # 'MA', 'PM', 'IM', 'EM', 'CM', or custom
    inspection_date: datetime
    meter_data: List[MeterReportData]
    # Optional custom template configuration
    custom_template: Optional[ChecklistTemplate] = None
    # For append mode - load previous data
    append_mode: bool = True  # Default to append mode
    previous_report_date: Optional[datetime] = None  # Reference to previous report for continuity
