from pathlib import Path
import os


BASE_DIR = Path(__file__).resolve().parents[2]
DATABASE_DIR = BASE_DIR / "database"
DATABASE_DIR.mkdir(exist_ok=True)

DEFAULT_DATABASE_PATH = DATABASE_DIR / "ems_platform.db"

DATABASE_PATH = Path(os.getenv("DATABASE_PATH", DEFAULT_DATABASE_PATH))
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{DATABASE_PATH.resolve().as_posix()}",
)

UPLOADS_DIR = BASE_DIR / "uploads"
PROJECT_UPLOADS_DIR = UPLOADS_DIR / "projects"
SYSTEM_UPLOADS_DIR = UPLOADS_DIR / "_system"
PHOTOS_DIR = UPLOADS_DIR / "photos"
REPORTS_DIR = UPLOADS_DIR / "reports"
DOCUMENTS_DIR = UPLOADS_DIR / "documents"
PROJECT_DOCUMENTS_DIR = DOCUMENTS_DIR / "projects"
SYSTEM_DOCUMENTS_DIR = SYSTEM_UPLOADS_DIR / "documents"
OCR_DOCUMENTS_DIR = SYSTEM_UPLOADS_DIR / "ocr"
TEMPLATES_DIR = DOCUMENTS_DIR / "templates"
WORKBOOKS_DIR = DOCUMENTS_DIR / "workbooks"
ASSET_EXPORTS_DIR = DOCUMENTS_DIR / "asset_exports"
REPORT_DRAFTS_DIR = DOCUMENTS_DIR / "report_drafts"
PROJECTS_DIR = BASE_DIR / "project"
DEFAULT_REPORT_TEMPLATE_PATH = BASE_DIR / "backend" / "teamp" / "Templat-Report.xlsx"
PROJECT_WORKBOOK_CANDIDATES = [
    PROJECTS_DIR / "Oakwood" / "Maintenance Agreement Format - Oakwood.xlsx",
]
DEFAULT_PROJECT_WORKBOOK_PATH = next(
    (path for path in PROJECT_WORKBOOK_CANDIDATES if path.exists()),
    PROJECT_WORKBOOK_CANDIDATES[0],
)

for directory in (
    UPLOADS_DIR,
    PROJECT_UPLOADS_DIR,
    SYSTEM_UPLOADS_DIR,
    SYSTEM_DOCUMENTS_DIR,
    OCR_DOCUMENTS_DIR,
):
    directory.mkdir(parents=True, exist_ok=True)

API_TITLE = "Energy Service Management System API"
API_DESCRIPTION = "API for managing electrical meter maintenance and service operations"
API_VERSION = "1.0.0"

DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://ruttinon.github.io",
]

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", ",".join(DEFAULT_CORS_ORIGINS)).split(",")
    if origin.strip()
]

STATIC_UPLOADS_PATH = "/uploads"

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:5173")
