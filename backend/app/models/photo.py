from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base


class ServicePhoto(Base):
    __tablename__ = "service_photos"

    id = Column(Integer, primary_key=True, index=True)
    service_id = Column(Integer, ForeignKey("service_jobs.id"), nullable=False, index=True)
    file_path = Column(String, nullable=False)
    caption = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    service_job = relationship("ServiceJob", back_populates="photos")
