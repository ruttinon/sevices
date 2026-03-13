from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base


class Loop(Base):
    __tablename__ = "loops"

    id = Column(Integer, primary_key=True, index=True)
    panel_id = Column(Integer, ForeignKey("panels.id"), nullable=False, index=True)
    loop_code = Column(String, nullable=False, index=True)
    loop_name = Column(String, nullable=False)
    converter_name = Column(String, nullable=True)
    converter_ip = Column(String, nullable=True)
    mac_address = Column(String, nullable=True)

    panel = relationship("Panel", back_populates="loops")
    meters = relationship("Meter", back_populates="loop", cascade="all, delete-orphan")
