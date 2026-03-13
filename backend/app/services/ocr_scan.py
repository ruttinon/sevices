import os
import re
import shutil
from pathlib import Path

try:
    import cv2
    import numpy as np
    HAS_OPENCV = True
except ImportError:
    HAS_OPENCV = False

from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from sqlalchemy.orm import Session, joinedload

from ..models import Loop, Meter, Panel, Project


WINDOWS_TESSERACT_CANDIDATES = [
    Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe"),
    Path(r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"),
    Path.home() / "AppData" / "Local" / "Programs" / "Tesseract-OCR" / "tesseract.exe",
]
ENTITY_PRIORITY = {"meter": 0, "loop": 1, "panel": 2}
OCR_AMBIGUOUS_MAP = {
    "0": ("o",),
    "1": ("i", "l"),
    "2": ("z",),
    "5": ("s",),
    "8": ("b",),
    "9": ("g", "q", "s"),
    "b": ("8",),
    "g": ("9",),
    "i": ("1", "l"),
    "l": ("1", "i"),
    "o": ("0",),
    "q": ("9",),
    "s": ("5", "9"),
    "z": ("2",),
}
OCR_ALLOWED_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.:/-_()[] "
OCR_FAST_CONFIGS = (
    f"--oem 3 --psm 6 -c tessedit_char_whitelist={OCR_ALLOWED_CHARS}",
    # Reduced to single config for speed
)
OCR_CONFIGS = (
    f"--oem 3 --psm 6 -c tessedit_char_whitelist={OCR_ALLOWED_CHARS}",
    f"--oem 3 --psm 11 -c tessedit_char_whitelist={OCR_ALLOWED_CHARS}",
    f"--oem 3 --psm 7 -c tessedit_char_whitelist={OCR_ALLOWED_CHARS}",
    f"--oem 3 --psm 8 -c tessedit_char_whitelist={OCR_ALLOWED_CHARS}",
    f"--oem 3 --psm 12 -c tessedit_char_whitelist={OCR_ALLOWED_CHARS}",
    f"--oem 3 --psm 13 -c tessedit_char_whitelist={OCR_ALLOWED_CHARS}",
    # Added PSM 7 and 13 without whitelist to handle unexpected characters
    "--oem 3 --psm 7",
    "--oem 3 --psm 8",
    "--oem 3 --psm 12",
    "--oem 3 --psm 13",
)
IP_PATTERN = re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b")
MAC_PATTERN = re.compile(r"\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b")
SERIAL_PATTERNS = (
    re.compile(r"(?:serial(?:\s*(?:no|number))?|s\/n|sn)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._/-]{2,})", re.IGNORECASE),
)
MODEL_PATTERNS = (
    re.compile(r"(?:model|type)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._/-]{1,})", re.IGNORECASE),
)
REFERENCE_PATTERNS = (
    re.compile(r"(?:ref(?:erence)?(?:\s*(?:no|number))?|job(?:\s*(?:no|number))?)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._/-]{2,})", re.IGNORECASE),
)
METER_CODE_PATTERNS = (
    re.compile(r"(?:meter|device|equipment)\s*(?:code|id|tag)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._/-]{2,})", re.IGNORECASE),
)
MANUFACTURER_PATTERNS = (
    re.compile(r"(?:manufacturer|brand|make)\s*[:#-]?\s*([A-Za-z][A-Za-z0-9 .&/-]{1,})", re.IGNORECASE),
)
DEVICE_ADDRESS_PATTERNS = (
    re.compile(r"(?:device\s*address|address|addr|ip)\s*[:#-]?\s*(\d{1,3}(?:\.\d{1,3}){3}|[A-Za-z0-9][A-Za-z0-9._/-]{0,})", re.IGNORECASE),
)
OCR_STOP_TOKENS = {
    "addr",
    "address",
    "amp",
    "brand",
    "code",
    "date",
    "device",
    "equipment",
    "hz",
    "ip",
    "job",
    "kw",
    "kwh",
    "meter",
    "model",
    "name",
    "no",
    "number",
    "panel",
    "pf",
    "phase",
    "ref",
    "serial",
    "sn",
    "tag",
    "type",
    "unit",
    "vac",
    "volt",
}
IDENTIFIER_FIELD_WEIGHTS = {
    "meter_serial": 170,
    "panel_serial": 170,
    "loop_ip": 165,
    "loop_mac": 165,
    "panel_code": 160,
    "loop_code": 160,
    "meter_code": 155,
    "meter_device_address": 145,
}


def _collapse_whitespace(text: str) -> str:
    return " ".join(str(text or "").split())


def _compact_token(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(text or "").lower())


def _build_search_terms(text: str) -> list[str]:
    collapsed = _collapse_whitespace(text)
    if not collapsed:
        return []

    raw_terms = [collapsed]
    raw_terms.extend(line.strip() for line in str(text).splitlines() if line.strip())
    raw_terms.extend(re.findall(r"[A-Za-z0-9:._/-]+", collapsed))
    raw_terms.extend(_extract_candidate_tokens(collapsed))

    digits_only = re.sub(r"\D", "", collapsed)
    if len(digits_only) >= 6:
        raw_terms.append(digits_only)

    compact_full = _compact_token(collapsed)
    if len(compact_full) >= 4:
        raw_terms.append(compact_full)

    for token in list(raw_terms):
        raw_terms.extend(_expand_ocr_variants(token))

    terms = []
    seen = set()
    for term in raw_terms:
        normalized_term = _collapse_whitespace(term).strip()
        compact_term = _compact_token(normalized_term)
        if not normalized_term:
            continue
        if len(compact_term) < 3 and not any(symbol in normalized_term for symbol in ".:-_/"):
            continue
        key = normalized_term.lower()
        if key in seen:
            continue
        seen.add(key)
        terms.append(normalized_term)
    return terms[:24]


def _extract_candidate_tokens(text: str) -> list[str]:
    candidates = []
    candidates.extend(re.findall(r"\b\d{1,3}(?:\.\d{1,3}){3}\b", text))
    candidates.extend(re.findall(r"\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b", text))
    candidates.extend(re.findall(r"\b\d{6,}\b", text))
    scrubbed_text = MAC_PATTERN.sub(" ", IP_PATTERN.sub(" ", text))
    candidates.extend(re.findall(r"\b[A-Za-z0-9]{2,}(?:[-_/][A-Za-z0-9]{1,})*\b", scrubbed_text))
    return candidates


def _sanitize_candidate(candidate: str) -> str:
    cleaned = str(candidate or "").strip().strip(".,:;|")
    cleaned = re.sub(r"^[^A-Za-z0-9]+|[^A-Za-z0-9]+$", "", cleaned)
    return cleaned


def _extract_pattern_values(text: str, patterns: tuple[re.Pattern[str], ...]) -> list[str]:
    values = []
    for pattern in patterns:
        for match in pattern.finditer(text):
            value = _sanitize_candidate(match.group(1))
            if value:
                values.append(value)
    return values


def _score_candidate(candidate: str) -> int:
    compact = _compact_token(candidate)
    if not compact or compact in OCR_STOP_TOKENS:
        return -100

    if IP_PATTERN.fullmatch(candidate) or MAC_PATTERN.fullmatch(candidate):
        return -25

    score = 0
    has_alpha = bool(re.search(r"[A-Za-z]", candidate))
    has_digit = bool(re.search(r"\d", candidate))

    if has_alpha and has_digit:
        score += 11
    elif has_digit:
        score += 8
    else:
        score -= 8

    if len(compact) >= 6:
        score += 3
    if re.search(r"[-_/]", candidate):
        score += 3
    if candidate.upper() == candidate and has_alpha:
        score += 1
    if len(compact) > 24:
        score -= 6

    return score


def _pick_first_value(values: list[str] | None) -> str | None:
    if not values:
        return None
    return next((value for value in values if value), None)


def _normalize_identifier(text: str) -> str:
    return _collapse_whitespace(text).strip().lower()


def _looks_like_serial_candidate(candidate: str) -> bool:
    normalized = _sanitize_candidate(candidate)
    compact = _compact_token(normalized)
    if not normalized or len(compact) < 4:
        return False
    if compact in OCR_STOP_TOKENS:
        return False
    if IP_PATTERN.fullmatch(normalized) or MAC_PATTERN.fullmatch(normalized):
        return False

    has_alpha = bool(re.search(r"[A-Za-z]", normalized))
    has_digit = bool(re.search(r"\d", normalized))

    # All digits (including separators like - / . _)
    if not has_alpha and has_digit:
        return len(compact) >= 5

    # Mixed alphanumeric
    return has_alpha and has_digit


def _looks_like_reference_candidate(candidate: str) -> bool:
    normalized = _sanitize_candidate(candidate)
    if not normalized or IP_PATTERN.fullmatch(normalized) or MAC_PATTERN.fullmatch(normalized):
        return False
    return bool(re.fullmatch(r"\d{6,20}", normalized))


def _identifier_field_match_score(field_value: str | None, terms: list[str], weight: int) -> int:
    normalized_field = _normalize_identifier(field_value or "")
    compact_field = _compact_token(normalized_field)
    if not normalized_field or not compact_field:
        return 0

    best_score = 0
    for term in terms:
        normalized_term = _normalize_identifier(term)
        compact_term = _compact_token(normalized_term)
        if not normalized_term or not compact_term:
            continue

        if normalized_term == normalized_field:
            best_score = max(best_score, weight)
            continue

        if len(compact_term) >= 3 and compact_term == compact_field:
            best_score = max(best_score, weight - 2)

    return best_score


def extract_ocr_candidates(text: str) -> list[str]:
    normalized = _collapse_whitespace(text)
    if not normalized:
        return []

    raw_candidates = []
    raw_candidates.extend(_extract_pattern_values(normalized, SERIAL_PATTERNS))
    raw_candidates.extend(_extract_pattern_values(normalized, MODEL_PATTERNS))
    raw_candidates.extend(_extract_pattern_values(normalized, REFERENCE_PATTERNS))
    raw_candidates.extend(_extract_candidate_tokens(normalized))

    scored_candidates = []
    seen = set()
    for index, raw_candidate in enumerate(raw_candidates):
        candidate = _sanitize_candidate(raw_candidate)
        compact = _compact_token(candidate)
        if not candidate or compact in seen:
            continue
        seen.add(compact)
        score = _score_candidate(candidate)
        if score <= 0:
            continue
        scored_candidates.append((score, index, candidate))

    scored_candidates.sort(key=lambda item: (-item[0], item[1], item[2]))
    return [candidate for _, _, candidate in scored_candidates[:8]]


def extract_field_hints(text: str, candidates: list[str] | None = None) -> dict:
    normalized = _collapse_whitespace(text)
    extracted_candidates = candidates or extract_ocr_candidates(normalized)

    serial_number = _pick_first_value(_extract_pattern_values(normalized, SERIAL_PATTERNS))
    model = _pick_first_value(_extract_pattern_values(normalized, MODEL_PATTERNS))
    reference_number = _pick_first_value(_extract_pattern_values(normalized, REFERENCE_PATTERNS))
    meter_code = _pick_first_value(_extract_pattern_values(normalized, METER_CODE_PATTERNS))
    manufacturer = _pick_first_value(_extract_pattern_values(normalized, MANUFACTURER_PATTERNS))
    device_address = _pick_first_value(_extract_pattern_values(normalized, DEVICE_ADDRESS_PATTERNS))

    if not device_address:
        device_address = _pick_first_value(IP_PATTERN.findall(normalized))

    if not serial_number:
        serial_number = next((candidate for candidate in extracted_candidates if _looks_like_serial_candidate(candidate)), None)

    if not reference_number:
        reference_number = next((candidate for candidate in extracted_candidates if _looks_like_reference_candidate(candidate)), None)

    return {
        "manufacturer": manufacturer,
        "meter_name": None,
        "model": model,
        "serial_number": serial_number,
        "reference_number": reference_number,
        "meter_code": meter_code,
        "device_address": device_address,
    }


def _expand_ocr_variants(term: str) -> list[str]:
    compact = _compact_token(term)
    if not compact or len(compact) > 12:
        return []

    variants = []
    seen = set()
    for index, character in enumerate(compact):
        replacements = OCR_AMBIGUOUS_MAP.get(character, ())
        for replacement in replacements:
            variant = compact[:index] + replacement + compact[index + 1 :]
            if variant != compact and variant not in seen:
                seen.add(variant)
                variants.append(variant)
    return variants


def _score_fields(fields: list[str], terms: list[str]) -> int:
    score = 0
    matched_terms = 0

    normalized_fields = []
    compact_fields = []
    for field in fields:
        normalized_field = _collapse_whitespace(field).lower()
        normalized_fields.append(normalized_field)
        compact_fields.append(_compact_token(normalized_field))

    for term in terms:
        normalized_term = _collapse_whitespace(term).lower()
        compact_term = _compact_token(normalized_term)
        best_term_score = 0

        for normalized_field, compact_field in zip(normalized_fields, compact_fields):
            if not normalized_field:
                continue

            if normalized_term == normalized_field:
                best_term_score = max(best_term_score, 12)
            elif len(normalized_term) >= 3 and normalized_term in normalized_field:
                best_term_score = max(best_term_score, min(9, 4 + len(normalized_term) // 3))

            if len(compact_term) >= 4 and compact_field:
                if compact_term == compact_field:
                    best_term_score = max(best_term_score, 13)
                elif compact_term in compact_field:
                    best_term_score = max(best_term_score, min(10, 5 + len(compact_term) // 4))

        if best_term_score:
            matched_terms += 1
            score += best_term_score

    if matched_terms >= 2:
        score += matched_terms * 2
    return score


def _weighted_score(primary_fields: list[str], terms: list[str], secondary_fields: list[str] | None = None) -> int:
    primary_score = _score_fields(primary_fields, terms)
    secondary_score = _score_fields(secondary_fields or [], terms)
    return (primary_score * 3) + secondary_score


def _meter_result(meter: Meter) -> dict:
    return {
        "entity_type": "meter",
        "entity_id": meter.id,
        "title": meter.meter_name,
        "subtitle": meter.serial_number or meter.meter_code,
        "project_id": meter.loop.panel.project_id,
        "project_name": meter.loop.panel.project.name if meter.loop and meter.loop.panel and meter.loop.panel.project else None,
        "panel_id": meter.loop.panel_id,
        "loop_id": meter.loop_id,
        "meter_id": meter.id,
        "detail_path": f"/engineer/assets/meter/{meter.id}",
    }


def _loop_result(loop: Loop) -> dict:
    return {
        "entity_type": "loop",
        "entity_id": loop.id,
        "title": loop.loop_name,
        "subtitle": loop.converter_ip or loop.loop_code,
        "project_id": loop.panel.project_id,
        "project_name": loop.panel.project.name if loop.panel and loop.panel.project else None,
        "panel_id": loop.panel_id,
        "loop_id": loop.id,
        "detail_path": f"/engineer/assets/loop/{loop.id}",
    }


def _panel_result(panel: Panel) -> dict:
    return {
        "entity_type": "panel",
        "entity_id": panel.id,
        "title": panel.panel_name,
        "subtitle": panel.panel_code,
        "project_id": panel.project_id,
        "project_name": panel.project.name if panel.project else None,
        "panel_id": panel.id,
        "detail_path": f"/engineer/assets/panel/{panel.id}",
    }


def _project_result(project: Project) -> dict:
    return {
        "entity_type": "project",
        "entity_id": project.id,
        "title": project.name,
        "subtitle": project.location,
        "project_id": project.id,
        "project_name": project.name,
        "detail_path": f"/customer/project/{project.id}",
    }


def match_equipment_from_text(db: Session, text: str, project_id: int | None = None):
    terms = _build_search_terms(text)
    if not terms:
        return []

    scored_results = []
    exact_results = []

    meters_query = db.query(Meter).options(joinedload(Meter.loop).joinedload(Loop.panel).joinedload(Panel.project))
    if project_id is not None:
        meters_query = meters_query.join(Loop).join(Panel).filter(Panel.project_id == project_id)
    meters = meters_query.all()
    for meter in meters:
        exact_score = max(
            _identifier_field_match_score(meter.serial_number, terms, IDENTIFIER_FIELD_WEIGHTS["meter_serial"]),
            _identifier_field_match_score(meter.meter_code, terms, IDENTIFIER_FIELD_WEIGHTS["meter_code"]),
            _identifier_field_match_score(meter.device_address, terms, IDENTIFIER_FIELD_WEIGHTS["meter_device_address"]),
        )
        if exact_score:
            exact_results.append((exact_score, _meter_result(meter)))

        score = _weighted_score(
            [
                meter.serial_number,
                meter.meter_code,
                meter.meter_name,
                meter.device_address,
                meter.model,
                meter.status,
            ],
            terms,
            [
                meter.loop.loop_code if meter.loop else "",
                meter.loop.loop_name if meter.loop else "",
                meter.loop.converter_ip if meter.loop else "",
                meter.loop.mac_address if meter.loop else "",
                meter.loop.panel.panel_code if meter.loop and meter.loop.panel else "",
                meter.loop.panel.panel_name if meter.loop and meter.loop.panel else "",
                meter.loop.panel.location_note if meter.loop and meter.loop.panel else "",
            ],
        )
        if score:
            scored_results.append((score, _meter_result(meter)))

    loops_query = db.query(Loop).options(joinedload(Loop.panel).joinedload(Panel.project))
    if project_id is not None:
        loops_query = loops_query.join(Panel).filter(Panel.project_id == project_id)
    loops = loops_query.all()
    for loop in loops:
        exact_score = max(
            _identifier_field_match_score(loop.loop_code, terms, IDENTIFIER_FIELD_WEIGHTS["loop_code"]),
            _identifier_field_match_score(loop.converter_ip, terms, IDENTIFIER_FIELD_WEIGHTS["loop_ip"]),
            _identifier_field_match_score(loop.mac_address, terms, IDENTIFIER_FIELD_WEIGHTS["loop_mac"]),
        )
        if exact_score:
            exact_results.append((exact_score, _loop_result(loop)))

        score = _weighted_score(
            [
                loop.loop_code,
                loop.loop_name,
                loop.converter_name,
                loop.converter_ip,
                loop.mac_address,
            ],
            terms,
            [
                loop.panel.panel_code if loop.panel else "",
                loop.panel.panel_name if loop.panel else "",
                loop.panel.location_note if loop.panel else "",
            ],
        )
        if score:
            scored_results.append((score, _loop_result(loop)))

    panels_query = db.query(Panel).options(joinedload(Panel.project))
    if project_id is not None:
        panels_query = panels_query.filter(Panel.project_id == project_id)
    panels = panels_query.all()
    for panel in panels:
        exact_score = max(
            _identifier_field_match_score(panel.serial_number, terms, IDENTIFIER_FIELD_WEIGHTS["panel_serial"]),
            _identifier_field_match_score(panel.panel_code, terms, IDENTIFIER_FIELD_WEIGHTS["panel_code"]),
        )
        if exact_score:
            exact_results.append((exact_score, _panel_result(panel)))

        score = _weighted_score(
            [
                panel.serial_number,
                panel.panel_code,
                panel.panel_name,
                panel.location_note,
            ],
            terms,
        )
        if score:
            scored_results.append((score, _panel_result(panel)))

    if exact_results:
        exact_results.sort(
            key=lambda item: (
                -item[0],
                ENTITY_PRIORITY.get(item[1]["entity_type"], 99),
                str(item[1]["title"]).lower(),
            )
        )
        return [result for _, result in exact_results[:8]]

    scored_results.sort(
        key=lambda item: (
            -item[0],
            ENTITY_PRIORITY.get(item[1]["entity_type"], 99),
            str(item[1]["title"]).lower(),
        )
    )
    return [result for _, result in scored_results[:8]]


def _resolve_tesseract_cmd() -> str | None:
    custom_tesseract_cmd = os.getenv("TESSERACT_CMD")
    if custom_tesseract_cmd and Path(custom_tesseract_cmd).exists():
        return custom_tesseract_cmd

    discovered = shutil.which("tesseract")
    if discovered:
        return discovered

    for candidate in WINDOWS_TESSERACT_CANDIDATES:
        if candidate.exists():
            return str(candidate)

    return None


def _deskew_image(cv_image: "np.ndarray") -> "np.ndarray":
    """Detects and corrects skew in the image."""
    if not HAS_OPENCV:
        return cv_image
    coords = np.column_stack(np.where(cv_image > 0))
    if len(coords) == 0:
        return cv_image
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle
    (h, w) = cv_image.shape[:2]
    center = (w // 2, h // 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(cv_image, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def _apply_opencv_variants(pil_image: Image.Image) -> list[Image.Image]:
    """Generates more robust image variants using OpenCV."""
    if not HAS_OPENCV:
        return []

    # Convert PIL to CV2 (grayscale)
    cv_img = np.array(pil_image.convert("L"))
    variants = []

    # 1. CLAHE to recover faint text on uneven lighting
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8)).apply(cv_img)
    variants.append(Image.fromarray(clahe))

    # 2. Bilateral denoise keeps edges sharper than gaussian blur
    bilateral = cv2.bilateralFilter(clahe, 7, 60, 60)
    variants.append(Image.fromarray(bilateral))

    # 3. Gaussian Blur + Adaptive Threshold (Gaussian)
    blurred = cv2.GaussianBlur(cv_img, (5, 5), 0)
    thresh_gauss = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )
    variants.append(Image.fromarray(thresh_gauss))

    # 4. Mean threshold sometimes keeps thin characters better than gaussian
    thresh_mean = cv2.adaptiveThreshold(
        bilateral, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 31, 12
    )
    variants.append(Image.fromarray(thresh_mean))

    # 5. Otsu's Binarization
    _, thresh_otsu = cv2.threshold(cv_img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(Image.fromarray(thresh_otsu))

    # 6. Morphological Opening (remove noise)
    kernel = np.ones((2, 2), np.uint8)
    opening = cv2.morphologyEx(thresh_otsu, cv2.MORPH_OPEN, kernel)
    variants.append(Image.fromarray(opening))

    # 7. Morphological closing helps reconnect broken glyphs
    closing = cv2.morphologyEx(thresh_gauss, cv2.MORPH_CLOSE, kernel)
    variants.append(Image.fromarray(closing))

    # 8. Morphological Dilation (thicken thin fonts)
    dilation = cv2.dilate(thresh_otsu, kernel, iterations=1)
    variants.append(Image.fromarray(dilation))

    # 9. Sharpened high-contrast grayscale before OCR
    sharpen_kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    sharpened = cv2.filter2D(clahe, -1, sharpen_kernel)
    variants.append(Image.fromarray(sharpened))

    # 10. Upscaled threshold variant helps small labels
    upscaled = cv2.resize(thresh_mean, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
    variants.append(Image.fromarray(upscaled))

    # 11. Deskewed version of Otsu
    deskewed = _deskew_image(thresh_otsu)
    variants.append(Image.fromarray(deskewed))

    return variants


def _prepare_base_image(image: Image.Image) -> Image.Image:
    transposed = ImageOps.exif_transpose(image)
    grayscale = ImageOps.grayscale(transposed)
    # Reduce scaling to improve speed: use 2x instead of 4x, cap at 1200 instead of 2200
    width = min(max(grayscale.width * 2, 1200), 1200)
    height = int(grayscale.height * (width / max(grayscale.width, 1)))
    return grayscale.resize((width, height))


def _build_fast_image_variants(image: Image.Image) -> list[Image.Image]:
    resized = _prepare_base_image(image)
    equalized = ImageOps.equalize(resized)
    contrasted = ImageEnhance.Contrast(ImageOps.autocontrast(equalized)).enhance(1.6)
    return [contrasted]  # Reduced to single variant for speed


def _build_robust_image_variants(image: Image.Image) -> list[Image.Image]:
    resized = _prepare_base_image(image)
    equalized = ImageOps.equalize(resized)
    contrasted = ImageEnhance.Contrast(ImageOps.autocontrast(equalized)).enhance(1.8)
    # Extra sharpening pass to recover blurry/out-of-focus text
    sharpened = contrasted.filter(ImageFilter.UnsharpMask(radius=2, percent=180, threshold=2))
    sharpened2 = sharpened.filter(ImageFilter.UnsharpMask(radius=1, percent=120, threshold=1))
    denoised = sharpened.filter(ImageFilter.MedianFilter(size=3))
    threshold_soft = denoised.point(lambda pixel: 255 if pixel > 130 else 0)
    threshold_mid = denoised.point(lambda pixel: 255 if pixel > 155 else 0)
    threshold_hard = denoised.point(lambda pixel: 255 if pixel > 180 else 0)
    inverted = ImageOps.invert(denoised)
    # High-contrast variant specifically for numeric serials on white labels
    bright = ImageEnhance.Brightness(contrasted).enhance(1.2)
    bright_sharp = bright.filter(ImageFilter.UnsharpMask(radius=1, percent=200, threshold=1))
    # Added: More aggressive contrast for thin fonts
    high_contrast = ImageEnhance.Contrast(resized).enhance(2.5)

    variants = [contrasted, sharpened2, denoised, threshold_soft, threshold_mid, threshold_hard, inverted, bright_sharp, high_contrast]

    # Add advanced OpenCV variants
    opencv_variants = _apply_opencv_variants(resized)
    variants.extend(opencv_variants)

    return variants


def _extract_text_with_tesseract(pytesseract, image: Image.Image, mode: str = "robust") -> str:
    extracted_chunks = []
    seen_chunks = set()

    variants = _build_fast_image_variants(image) if mode == "fast" else _build_robust_image_variants(image)
    configs = OCR_FAST_CONFIGS if mode == "fast" else OCR_CONFIGS

    for variant in variants:
        for config in configs:
            text = _collapse_whitespace(
                pytesseract.image_to_string(variant, lang="eng", config=config)
            )
            if text and text.lower() not in seen_chunks:
                seen_chunks.add(text.lower())
                extracted_chunks.append(text)

    return "\n".join(extracted_chunks)


def extract_text_from_image(file_path: Path, mode: str = "robust") -> str:
    try:
        import pytesseract
    except ImportError as exc:
        raise RuntimeError("OCR library is not installed") from exc

    tesseract_cmd = _resolve_tesseract_cmd()
    if not tesseract_cmd:
        raise RuntimeError("Tesseract OCR is not installed or not configured")

    pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    try:
        with Image.open(file_path) as image:
            extracted = _extract_text_with_tesseract(pytesseract, image, mode=mode)
    except Exception as exc:
        raise RuntimeError("OCR engine is unavailable on this machine") from exc

    return _collapse_whitespace(extracted)
