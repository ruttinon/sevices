from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base


class Panel(Base):
    __tablename__ = "panels"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    panel_code = Column(String, nullable=False, index=True)
    panel_name = Column(String, nullable=False)
    serial_number = Column(String, nullable=True, index=True)
    location_note = Column(String, nullable=True)

    project = relationship("Project", back_populates="panels")
    loops = relationship("Loop", back_populates="panel", cascade="all, delete-orphan")
