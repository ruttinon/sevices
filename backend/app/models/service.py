from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base


class ServiceJob(Base):
    __tablename__ = "service_jobs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    meter_id = Column(Integer, ForeignKey("meters.id"), nullable=True, index=True)
    engineer_id = Column(Integer, nullable=True)
    engineer_name = Column(String, nullable=True)
    service_type = Column(String, nullable=False, default="PM")
    service_date = Column(DateTime, nullable=False, default=datetime.utcnow)
    status = Column(String, nullable=False, default="Pending")
    note = Column(String, nullable=True)
    checklist_items = Column(JSON, nullable=True)
    report_draft = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    project = relationship("Project", back_populates="service_jobs")
    meter = relationship("Meter", back_populates="service_jobs")
    photos = relationship("ServicePhoto", back_populates="service_job", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="service_job", cascade="all, delete-orphan")
