from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


def generate_qr_code(prefix: str = "ASSET") -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"{prefix}-{timestamp}-{uuid4().hex[:6].upper()}"


def build_public_file_path(base_dir: Path, file_path: Path) -> str:
    relative_path = file_path.resolve().relative_to(base_dir.resolve())
    return f"/uploads/{relative_path.as_posix()}"
