from pydantic import BaseModel
from typing import Optional, List


class MeterBase(BaseModel):
    meter_code: str
    meter_name: str
    serial_number: Optional[str] = None
    device_address: Optional[str] = None
    model: Optional[str] = None
    ct_ratio: Optional[str] = None
    baud_rate: Optional[str] = None
    status: str = "Active"


class MeterCreate(MeterBase):
    loop_id: int


class MeterUpdate(BaseModel):
    loop_id: Optional[int] = None
    meter_code: Optional[str] = None
    meter_name: Optional[str] = None
    serial_number: Optional[str] = None
    device_address: Optional[str] = None
    model: Optional[str] = None
    ct_ratio: Optional[str] = None
    baud_rate: Optional[str] = None
    status: Optional[str] = None


class MeterResponse(MeterBase):
    id: int
    loop_id: int

    class Config:
        from_attributes = True


class LoopBase(BaseModel):
    loop_code: str
    loop_name: str
    converter_name: Optional[str] = None
    converter_ip: Optional[str] = None
    mac_address: Optional[str] = None


class LoopCreate(LoopBase):
    panel_id: int


class LoopUpdate(BaseModel):
    panel_id: Optional[int] = None
    loop_code: Optional[str] = None
    loop_name: Optional[str] = None
    converter_name: Optional[str] = None
    converter_ip: Optional[str] = None
    mac_address: Optional[str] = None


class LoopResponse(LoopBase):
    id: int
    panel_id: int
    meters: List[MeterResponse] = []

    class Config:
        from_attributes = True


class PanelBase(BaseModel):
    panel_code: str
    panel_name: str
    serial_number: Optional[str] = None
    location_note: Optional[str] = None


class PanelCreate(PanelBase):
    project_id: int


class PanelUpdate(BaseModel):
    project_id: Optional[int] = None
    panel_code: Optional[str] = None
    panel_name: Optional[str] = None
    serial_number: Optional[str] = None
    location_note: Optional[str] = None


class PanelResponse(PanelBase):
    id: int
    project_id: int
    loops: list[LoopResponse] = []

    class Config:
        from_attributes = True


class AssetImportResult(BaseModel):
    panels_created: int
    panels_updated: int = 0
    loops_created: int
    loops_updated: int = 0
    meters_created: int
    meters_updated: int = 0


class AssetExportResult(BaseModel):
    file_name: str
    file_path: str
    saved_to: str
    template_source: str
    exported_at: str
