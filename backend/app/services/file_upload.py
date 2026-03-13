from pathlib import Path
import re

from fastapi import UploadFile

from ..config import UPLOADS_DIR
from ..utils.helpers import build_public_file_path, generate_qr_code


def save_upload_file(upload: UploadFile, target_dir: Path, prefix: str = "FILE", keep_original_name: bool = False) -> Path:
    target_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(upload.filename or "").suffix or ".bin"
    destination = target_dir / _build_file_name(upload.filename, suffix.lower(), prefix, keep_original_name)

    with destination.open("wb") as buffer:
        buffer.write(upload.file.read())

    return destination


def save_upload(upload: UploadFile, target_dir: Path, prefix: str = "FILE", keep_original_name: bool = False) -> str:
    destination = save_upload_file(upload, target_dir, prefix=prefix, keep_original_name=keep_original_name)
    return build_public_file_path(UPLOADS_DIR, destination)


def _build_file_name(original_name: str | None, suffix: str, prefix: str, keep_original_name: bool) -> str:
    if not keep_original_name or not original_name:
        return f"{generate_qr_code(prefix)}{suffix}"

    stem = re.sub(r'[<>:"/\\\\|?*]+', "-", Path(original_name).stem).strip().strip(".")
    stem = stem or generate_qr_code(prefix)
    return f"{stem}-{generate_qr_code(prefix)}{suffix}"
