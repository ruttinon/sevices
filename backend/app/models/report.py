from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    service_id = Column(Integer, ForeignKey("service_jobs.id"), nullable=True, index=True)
    file_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    report_date = Column(DateTime, nullable=True)  # For date-based filename tracking

    service_job = relationship("ServiceJob", back_populates="reports")
    project = relationship("Project")
