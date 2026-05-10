"""Persists generated PDFs and returns a URL the mobile client can hit.

Two backends:
- `local`: writes to LOCAL_STORAGE_DIR and returns
  `{PUBLIC_BASE_URL}/static/cvs/{cvId}.pdf`. The FastAPI app mounts
  this directory as static — no auth, but development-only.
- `s3`: uploads to S3 and returns a pre-signed URL with a TTL of
  CV_PRESIGNED_URL_EXPIRY_SECONDS (default 1 hour).

Set Content-Type and Content-Disposition headers so Android opens the
file as a PDF download instead of an in-app webview text view (this is
what causes the "Could not open download link" error).
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import config

logger = logging.getLogger(__name__)


class StorageError(Exception):
    """Raised on upload or URL-generation failure."""


def _content_disposition(cv_id: str) -> str:
    return f'attachment; filename="cv-{cv_id}.pdf"'


def _store_local(cv_id: str, pdf_bytes: bytes) -> str:
    base = Path(config.LOCAL_STORAGE_DIR) / "cvs"
    base.mkdir(parents=True, exist_ok=True)
    path = base / f"{cv_id}.pdf"
    try:
        path.write_bytes(pdf_bytes)
    except OSError as exc:
        raise StorageError(f"local write failed: {exc}") from exc
    return f"{config.PUBLIC_BASE_URL}/static/cvs/{cv_id}.pdf"


def _store_s3(cv_id: str, pdf_bytes: bytes) -> str:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError

    bucket = config.S3_BUCKET_NAME
    if not bucket:
        raise StorageError("S3_BUCKET_NAME not configured")
    key = f"cvs/{cv_id}.pdf"
    s3 = boto3.client("s3", region_name=config.AWS_REGION)
    try:
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=pdf_bytes,
            ContentType="application/pdf",
            ContentDisposition=_content_disposition(cv_id),
        )
    except (BotoCoreError, ClientError) as exc:
        raise StorageError(f"S3 upload failed: {exc}") from exc

    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=config.CV_PRESIGNED_URL_EXPIRY_SECONDS,
        )
    except (BotoCoreError, ClientError) as exc:
        raise StorageError(f"presign failed: {exc}") from exc

    return url


def upload_pdf(cv_id: str, pdf_bytes: bytes) -> str:
    """Uploads the PDF and returns a downloadable URL.

    Raises StorageError on any failure — caller maps to HTTP 502.
    """
    if not pdf_bytes:
        raise StorageError("empty PDF byte stream")

    backend = config.STORAGE_BACKEND
    if backend == "local":
        return _store_local(cv_id, pdf_bytes)
    if backend == "s3":
        return _store_s3(cv_id, pdf_bytes)
    raise StorageError(f"unsupported STORAGE_BACKEND: {backend}")
