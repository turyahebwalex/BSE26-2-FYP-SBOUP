# syntax=docker/dockerfile:1.4
FROM python:3.11-slim

WORKDIR /app

# ReportLab needs a few system fonts/libs. spaCy was in the original spec
# but we don't actually use it — keep the install lean.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libcairo2 \
    libffi-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# PIP_NO_CACHE_DIR is intentionally NOT set — we rely on the BuildKit
# cache mount below to persist pip's wheel cache across builds. With it
# disabled, a build that dies mid-download (campus / MikroTik links love
# to do this on the ~190MB torch CPU wheel) can resume from the partial
# wheel on the next attempt instead of restarting from byte 0.
ENV HF_MODEL_CACHE_DIR=/app/model_cache \
    LOCAL_STORAGE_DIR=/app/storage \
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

# Best-effort pre-download. Docker build sandboxes often can't resolve
# huggingface.co even when the runtime container's host networking can,
# so the script never fails the build. If models aren't cached here,
# they're fetched on first runtime request to the persisted
# `cv_model_cache` volume — one-time cost, then offline forever.
#
# Set FAIL_FAST=1 (build arg) in environments with reliable build-time
# network to make missing required models break the build instead.
ARG FAIL_FAST=0
ENV FAIL_FAST=${FAIL_FAST}
COPY scripts/preload_models.py scripts/preload_models.py
RUN python scripts/preload_models.py

# Note: TRANSFORMERS_OFFLINE / HF_HUB_OFFLINE are NOT set at image level.
# When the cache is fully populated, set them to 1 in your .env or
# docker-compose `environment:` block to lock the runtime offline.

COPY . .

RUN mkdir -p /app/storage/cvs

EXPOSE 5003

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5003"]
