# syntax=docker/dockerfile:1.4
FROM python:3.11-slim

WORKDIR /app

# We don't render PDFs here, so no Cairo/Pango — just libffi for cffi-based deps.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# PIP_NO_CACHE_DIR is intentionally NOT set — we rely on the BuildKit
# cache mount below to persist pip's wheel cache across builds. With it
# disabled, a build that dies mid-download (campus / MikroTik links love
# to do this on the ~190MB torch CPU wheel) can resume from the partial
# wheel on the next attempt instead of restarting from byte 0.
ENV HF_MODEL_CACHE_DIR=/app/model_cache \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
# Two layers of resilience for unreliable networks:
#   1. BuildKit cache mount keeps partially-downloaded wheels across builds.
#   2. Shell-level retry loop — pip's --retries only retries the current
#      HTTP request, not the resolve as a whole, so a hard timeout still
#      fails the RUN. The for-loop reruns pip up to 5 times; each rerun
#      reuses cached wheels, so progress accumulates.
RUN --mount=type=cache,target=/root/.cache/pip \
    for i in 1 2 3 4 5; do \
      pip install --default-timeout=300 --retries 5 -r requirements.txt && break; \
      echo "pip install attempt $i failed, retrying in 10s..." >&2; \
      sleep 10; \
    done

# Models are NOT pre-downloaded into the image — that bloated the
# published image and made pulls painful on slow links. Instead, the
# runtime fetches them on first request into the persisted
# `learning_model_cache` Docker volume (see docker-compose.yml).
# One-time download per host, then reused across rebuilds.
#
# To preload manually (e.g. before going offline), run inside the
# container: `python scripts/preload_models.py`.

COPY . .

EXPOSE 5004

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5004"]
