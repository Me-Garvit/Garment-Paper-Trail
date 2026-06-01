import uuid
from pathlib import Path

import httpx
from fastapi import UploadFile

from config import settings

_STORAGE_BASE = f"{settings.supabase_url}/storage/v1"
_AUTH_HEADER = {"Authorization": f"Bearer {settings.supabase_service_role_key}"}


async def upload_document(file: UploadFile, folder: str = "documents") -> str:
    """Upload file to Supabase Storage, return the object path."""
    ext = Path(file.filename or "upload").suffix
    key = f"{folder}/{uuid.uuid4()}{ext}"
    await file.seek(0)
    content = await file.read()

    url = f"{_STORAGE_BASE}/object/{settings.storage_bucket}/{key}"
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            content=content,
            headers={**_AUTH_HEADER, "Content-Type": file.content_type or "application/octet-stream"},
        )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Storage upload failed [{resp.status_code}]: {resp.text}")
    return key


def generate_presigned_url(key: str) -> str:
    """Return a short-lived signed URL for a private Supabase Storage object."""
    url = f"{_STORAGE_BASE}/object/sign/{settings.storage_bucket}/{key}"
    resp = httpx.post(
        url,
        json={"expiresIn": settings.presigned_url_expiry},
        headers=_AUTH_HEADER,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Could not generate signed URL [{resp.status_code}]: {resp.text}")
    # signedURL is a relative path like /object/sign/bucket/key?token=...
    signed_path = resp.json().get("signedURL") or resp.json().get("signedUrl") or ""
    return f"{settings.supabase_url}/storage/v1{signed_path}"
