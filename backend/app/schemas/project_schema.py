from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from .customer_schema import CustomerResponse


class ProjectBase(BaseModel):
    customer_id: int
    name: str
    location: str
    description: Optional[str] = None
    template_file_path: Optional[str] = None
    project_workbook_file_path: Optional[str] = None

class ProjectCreate(ProjectBase):
    template_file_path: Optional[str] = None
    project_workbook_file_path: Optional[str] = None


class ProjectUpdate(BaseModel):
    customer_id: Optional[int] = None
    name: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    template_file_path: Optional[str] = None
    project_workbook_file_path: Optional[str] = None


class ProjectResponse(ProjectBase):
    id: int
    created_at: datetime
    customer: CustomerResponse

    class Config:
        from_attributes = True
