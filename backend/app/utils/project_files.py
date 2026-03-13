from pathlib import Path
import re
import unicodedata
from typing import Optional


WINDOWS_FORBIDDEN_CHARS = r'[<>:"/\\\\|?*]'


def slugify_path_fragment(value: Optional[str], fallback: str = "project") -> str:
    normalized = unicodedata.normalize("NFC", str(value or "")).strip()
    normalized = re.sub(WINDOWS_FORBIDDEN_CHARS, "-", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip(" .")
    if normalized and any(character.isalnum() for character in normalized):
        return normalized
    return fallback


def build_customer_folder_name(project_or_customer, customer_name: Optional[str] = None) -> str:
    if hasattr(project_or_customer, "customer") and getattr(project_or_customer, "customer", None) is not None:
        customer = project_or_customer.customer
        fallback = f"customer-{int(customer.id):04d}"
        return slugify_path_fragment(customer.name, fallback)

    if hasattr(project_or_customer, "id"):
        fallback = f"customer-{int(project_or_customer.id):04d}"
        derived_name = getattr(project_or_customer, "name", None) or customer_name
        return slugify_path_fragment(derived_name, fallback)

    return slugify_path_fragment(customer_name, "customer")


def build_project_folder_name(project_or_id, project_name: Optional[str] = None) -> str:
    if hasattr(project_or_id, "id"):
        project_id = int(project_or_id.id)
        project_name = getattr(project_or_id, "name", None) or project_name
    else:
        project_id = int(project_or_id)

    return slugify_path_fragment(project_name, f"project-{project_id:04d}")


def project_upload_dir(base_uploads_dir: Path, project_or_id, *parts: str, project_name: Optional[str] = None, customer_name: Optional[str] = None) -> Path:
    customer_folder = build_customer_folder_name(project_or_id, customer_name=customer_name)
    project_folder = build_project_folder_name(project_or_id, project_name=project_name)
    directory = base_uploads_dir / "projects" / customer_folder / project_folder
    for part in parts:
        directory /= str(part)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def project_documents_dir(base_documents_dir: Path, project_or_id, *parts: str, project_name: Optional[str] = None, customer_name: Optional[str] = None) -> Path:
    return project_upload_dir(
        base_documents_dir.parent,
        project_or_id,
        "documents",
        *parts,
        project_name=project_name,
        customer_name=customer_name,
    )


def ensure_project_upload_tree(base_uploads_dir: Path, project) -> None:
    for parts in (
        ("documents", "templates"),
        ("documents", "workbooks"),
        ("documents", "report_drafts"),
        ("documents", "asset_exports"),
        ("photos",),
        ("reports",),
    ):
        project_upload_dir(base_uploads_dir, project, *parts)
