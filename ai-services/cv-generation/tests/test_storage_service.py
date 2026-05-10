"""Storage backend tests. S3 path uses moto; local path uses tmp_path."""
import os

import pytest

from services import storage_service
from services.storage_service import StorageError


def test_local_backend_writes_and_returns_url(monkeypatch, tmp_path):
    monkeypatch.setattr(storage_service.config, "STORAGE_BACKEND", "local")
    monkeypatch.setattr(storage_service.config, "LOCAL_STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr(storage_service.config, "PUBLIC_BASE_URL", "http://test")

    url = storage_service.upload_pdf("abc123", b"%PDF-1.4 hello")
    assert url == "http://test/static/cvs/abc123.pdf"
    assert (tmp_path / "cvs" / "abc123.pdf").read_bytes().startswith(b"%PDF")


def test_empty_bytes_raises(monkeypatch, tmp_path):
    monkeypatch.setattr(storage_service.config, "STORAGE_BACKEND", "local")
    monkeypatch.setattr(storage_service.config, "LOCAL_STORAGE_DIR", str(tmp_path))
    with pytest.raises(StorageError):
        storage_service.upload_pdf("abc", b"")


def test_s3_backend_uploads_and_presigns(monkeypatch):
    pytest.importorskip("moto")
    from moto import mock_aws
    import boto3

    monkeypatch.setattr(storage_service.config, "STORAGE_BACKEND", "s3")
    monkeypatch.setattr(storage_service.config, "S3_BUCKET_NAME", "test-bucket")
    monkeypatch.setattr(storage_service.config, "AWS_REGION", "us-east-1")
    os.environ["AWS_ACCESS_KEY_ID"] = "test"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "test"

    with mock_aws():
        boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="test-bucket")
        url = storage_service.upload_pdf("xyz", b"%PDF-1.4 body")
    assert "test-bucket" in url
    assert "xyz.pdf" in url
