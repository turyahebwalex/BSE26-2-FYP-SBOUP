"""Environment configuration loaded once at process start."""
import os

# python-dotenv is installed inside the Docker image (see requirements.txt) but
# not in any host venv, so the import must degrade gracefully when the module
# is imported on the host (tests, IDE language servers, ad-hoc scripts). In
# Docker compose the env vars come from the `environment:` block anyway, so a
# missing .env loader is a no-op there too.
try:
    from dotenv import load_dotenv  # pyright: ignore[reportMissingImports]

    load_dotenv()
except ImportError:
    pass


def _get(name: str, default: str = "") -> str:
    return os.getenv(name, default)


def _get_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


MONGODB_URI = _get("MONGODB_URI", "mongodb://localhost:27017/sboup_dev")
MONGODB_DB_NAME = _get("MONGODB_DB_NAME", "sboup_dev")
INTERNAL_API_KEY = _get("INTERNAL_API_KEY", "")

HF_MODEL_CACHE_DIR = _get("HF_MODEL_CACHE_DIR", "/app/model_cache")
HF_SEMANTIC_MODEL = _get("HF_SEMANTIC_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
HF_SKILL_NER_MODEL = _get("HF_SKILL_NER_MODEL", "jjzha/escoxlmr_skill_extraction")
HF_SUMMARY_MODEL = _get("HF_SUMMARY_MODEL", "google/flan-t5-small")
HF_SUMMARY_MAX_NEW_TOKENS = _get_int("HF_SUMMARY_MAX_NEW_TOKENS", 120)

STORAGE_BACKEND = _get("STORAGE_BACKEND", "local").lower()
LOCAL_STORAGE_DIR = _get("LOCAL_STORAGE_DIR", "/app/storage")
PUBLIC_BASE_URL = _get("PUBLIC_BASE_URL", "http://localhost:5003").rstrip("/")

AWS_REGION = _get("AWS_REGION", "us-east-1")
S3_BUCKET_NAME = _get("S3_BUCKET_NAME", "")

CV_PRESIGNED_URL_EXPIRY_SECONDS = _get_int("CV_PRESIGNED_URL_EXPIRY_SECONDS", 3600)
RATE_LIMIT_PER_USER_PER_MINUTE = _get_int("RATE_LIMIT_PER_USER_PER_MINUTE", 3)

PORT = _get_int("PORT", 5003)
LOG_LEVEL = _get("LOG_LEVEL", "INFO").upper()
