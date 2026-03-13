from pydantic import BaseModel
from typing import Optional, List

class OCRScanRequest(BaseModel):
    text: str


class ScanResult(BaseModel):
    entity_type: str
    entity_id: int
    title: str
    subtitle: Optional[str] = None
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    panel_id: Optional[int] = None
    loop_id: Optional[int] = None
    meter_id: Optional[int] = None
    detail_path: Optional[str] = None


class OCRFieldHints(BaseModel):
    manufacturer: Optional[str] = None
    meter_name: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    reference_number: Optional[str] = None
    meter_code: Optional[str] = None
    device_address: Optional[str] = None


class OCRExtractResponse(BaseModel):
    extracted_text: str
    ocr_texts: List[str] = []
    barcode_values: List[str] = []
    candidates: List[str] = []
    field_hints: OCRFieldHints
