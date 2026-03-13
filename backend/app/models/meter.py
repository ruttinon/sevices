from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base


class Meter(Base):
    __tablename__ = "meters"

    id = Column(Integer, primary_key=True, index=True)
    loop_id = Column(Integer, ForeignKey("loops.id"), nullable=False, index=True)
    meter_code = Column(String, nullable=False, index=True)
    meter_name = Column(String, nullable=False)
    serial_number = Column(String, nullable=True, index=True)
    device_address = Column(String, nullable=True)
    model = Column(String, nullable=True)
    ct_ratio = Column(String, nullable=True)
    baud_rate = Column(String, nullable=True)
    status = Column(String, nullable=False, default="ยังไม่ทำ")  # ยังไม่ทำ, กำลังทำ, เสร็จสิ้น

    loop = relationship("Loop", back_populates="meters")
    service_jobs = relationship("ServiceJob", back_populates="meter")
