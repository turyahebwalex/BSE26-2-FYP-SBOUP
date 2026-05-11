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


def _get_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


MONGODB_URI = _get("MONGODB_URI", "mongodb://localhost:27017/sboup_dev")
MONGODB_DB_NAME = _get("MONGODB_DB_NAME", "sboup_dev")
INTERNAL_API_KEY = _get("INTERNAL_API_KEY", "")

# AI models
HF_MODEL_CACHE_DIR = _get("HF_MODEL_CACHE_DIR", "/app/model_cache")
HF_SEMANTIC_MODEL = _get("HF_SEMANTIC_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
HF_SUMMARY_MODEL = _get("HF_SUMMARY_MODEL", "google/flan-t5-small")
HF_SUMMARY_MAX_NEW_TOKENS = _get_int("HF_SUMMARY_MAX_NEW_TOKENS", 80)
HF_SKILL_NER_MODEL = _get("HF_SKILL_NER_MODEL", "jjzha/jobbert_skill_extraction")

# Cosine threshold above which a profile skill is treated as a semantic
# match for a required skill. See services/skill_gap_analyser.py docstring
# for empirical justification of the default.
SEMANTIC_MATCH_THRESHOLD = _get_float("SEMANTIC_MATCH_THRESHOLD", 0.75)

# Resource providers
YOUTUBE_API_KEY = _get("YOUTUBE_API_KEY", "")
COURSERA_BASE_URL = _get("COURSERA_BASE_URL", "https://api.coursera.org/api").rstrip("/")
EDX_BASE_URL = _get("EDX_BASE_URL", "https://courses.edx.org/api").rstrip("/")
PROVIDER_HTTP_TIMEOUT_SECONDS = _get_int("PROVIDER_HTTP_TIMEOUT_SECONDS", 8)

# Matching engine — source of truth for missingSkills on opportunity-driven requests.
MATCHING_SERVICE_URL = _get("MATCHING_SERVICE_URL", "http://localhost:5001").rstrip("/")
MATCHING_SERVICE_TIMEOUT_SECONDS = _get_int("MATCHING_SERVICE_TIMEOUT_SECONDS", 5)

PORT = _get_int("PORT", 5004)
LOG_LEVEL = _get("LOG_LEVEL", "INFO").upper()
RATE_LIMIT_PER_USER_PER_MINUTE = _get_int("RATE_LIMIT_PER_USER_PER_MINUTE", 10)
