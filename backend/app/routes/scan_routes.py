from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..config import OCR_DOCUMENTS_DIR
from ..database import get_db
from ..models import Loop, Meter, Panel, Project
from ..schemas import scan_schema
from ..services.ocr_scan import (
    extract_field_hints,
    extract_ocr_candidates,
    extract_text_from_image,
    match_equipment_from_text,
)
from ..services.file_upload import save_upload_file
from ..services.qr_scan import resolve_qr_identifier

router = APIRouter(prefix="/scan", tags=["scan"])


def _dedupe_scan_results(results: list[dict]) -> list[dict]:
    unique_results = []
    seen = set()
    for result in results:
        key = (result.get("entity_type"), result.get("entity_id"))
        if key in seen:
            continue
        seen.add(key)
        unique_results.append(result)
    return unique_results


def _pick_best_result(results: list[dict]) -> dict | None:
    for entity_type in ("panel", "loop", "meter", "project"):
        for result in results:
            if result.get("entity_type") == entity_type:
                return result
    return results[0] if results else None


@router.get("/qr/{qr_code}", response_model=scan_schema.ScanResult)
def scan_qr(qr_code: str, project_id: int | None = None, db: Session = Depends(get_db)):
    result = resolve_qr_identifier(db, qr_code, project_id=project_id)
    if result is None:
        fallback_results = match_equipment_from_text(db, qr_code, project_id=project_id)
        result = _pick_best_result(fallback_results)
    if result is None:
        raise HTTPException(status_code=404, detail="No asset found for this QR code")
    return result


@router.post("/ocr", response_model=list[scan_schema.ScanResult])
def scan_ocr(payload: scan_schema.OCRScanRequest, project_id: int | None = None, db: Session = Depends(get_db)):
    results = match_equipment_from_text(db, payload.text, project_id=project_id)
    if not results:
        raise HTTPException(status_code=404, detail="No equipment matched this OCR text")
    return results


@router.post("/ocr/extract", response_model=scan_schema.OCRExtractResponse)
def extract_ocr_image(
    file: UploadFile = File(...),
    hint_text: str = Form(""),
):
    image_path = save_upload_file(file, OCR_DOCUMENTS_DIR, prefix="OCR", keep_original_name=True)

    try:
        normalized_hint = " ".join(hint_text.split())
        extracted_texts = []
        for mode in ("fast", "robust"):
            try:
                ocr_text = extract_text_from_image(image_path, mode=mode)
            except RuntimeError:
                ocr_text = ""

            if not ocr_text or ocr_text in extracted_texts:
                continue
            extracted_texts.append(ocr_text)

        fallback_text = image_path.stem.replace("-", " ").replace("_", " ")
        extracted_text = " ".join(part for part in (normalized_hint, *extracted_texts) if part).strip()
        if not extracted_text:
            extracted_text = normalized_hint or fallback_text

        candidates = extract_ocr_candidates(extracted_text)
        field_hints = extract_field_hints(extracted_text, candidates)
        return {
            "extracted_text": extracted_text,
            "ocr_texts": extracted_texts,
            "barcode_values": [],
            "candidates": candidates,
            "field_hints": field_hints,
        }
    finally:
        image_path.unlink(missing_ok=True)


@router.post("/ocr/image", response_model=list[scan_schema.ScanResult])
def scan_ocr_image(
    file: UploadFile = File(...),
    hint_text: str = Form(""),
    project_id: int | None = Form(None),
    db: Session = Depends(get_db),
):
    image_path = save_upload_file(file, OCR_DOCUMENTS_DIR, prefix="OCR", keep_original_name=True)

    try:
        normalized_hint = " ".join(hint_text.split())
        extracted_texts = []
        for mode in ("fast", "robust"):
            try:
                ocr_text = extract_text_from_image(image_path, mode=mode)
            except RuntimeError:
                ocr_text = ""

            if not ocr_text or ocr_text in extracted_texts:
                continue

            extracted_texts.append(ocr_text)

        combined_text = " ".join(part for part in (normalized_hint, *extracted_texts) if part).strip()
        if combined_text:
            results = match_equipment_from_text(db, combined_text, project_id=project_id)
            if results:
                return results

        fallback_text = image_path.stem.replace("-", " ").replace("_", " ")
        results = match_equipment_from_text(db, normalized_hint or fallback_text, project_id=project_id)
        if not results and normalized_hint:
            results = match_equipment_from_text(db, fallback_text, project_id=project_id)
        if not results:
            raise HTTPException(status_code=404, detail="No equipment matched this OCR image")
        return results
    finally:
        image_path.unlink(missing_ok=True)


@router.get("/search", response_model=list[scan_schema.ScanResult])
def manual_search(q: str, project_id: int | None = None, db: Session = Depends(get_db)):
    query = q.strip()
    if not query:
        return []

    results = []
    exact_result = resolve_qr_identifier(db, query, project_id=project_id)
    if exact_result is not None:
        results.append(exact_result)

    results.extend(match_equipment_from_text(db, query, project_id=project_id))
    projects_query = db.query(Project).filter(or_(Project.name.ilike(f"%{query}%"), Project.location.ilike(f"%{query}%")))
    if project_id is not None:
        projects_query = projects_query.filter(Project.id == project_id)
    projects = projects_query.limit(5).all()

    if project_id is None:
        for project in projects:
            results.append(
                {
                    "entity_type": "project",
                    "entity_id": project.id,
                    "title": project.name,
                    "subtitle": project.location,
                    "project_id": project.id,
                    "project_name": project.name,
                    "detail_path": f"/customer/project/{project.id}",
                }
            )
    return _dedupe_scan_results(results)[:12]
