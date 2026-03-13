from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    name = Column(String, nullable=False, index=True)
    location = Column(String, nullable=False)
    description = Column(String, nullable=True)
    template_file_path = Column(String, nullable=True)
    project_workbook_file_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    customer = relationship("Customer", back_populates="projects")
    panels = relationship("Panel", back_populates="project", cascade="all, delete-orphan")
    service_jobs = relationship("ServiceJob", back_populates="project", cascade="all, delete-orphan")
