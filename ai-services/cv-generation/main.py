"""FastAPI entry point for the SBOUP CV Generation service.

Routes:
- POST /api/cv/generate    — internal; called by Node.js ml.service.js
- GET  /health             — Kubernetes liveness/readiness probe

Note on `local` storage: when STORAGE_BACKEND=local we mount
LOCAL_STORAGE_DIR at /static so the URL returned by storage_service is
directly downloadable from the mobile client (no auth, dev-only).
"""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

import config
from models.request_models import (
    ErrorResponse,
    GenerateCVData,
    GenerateCVRequest,
    GenerateCVResponse,
    HealthResponse,
)
from services.ai_model_manager import ai_models, lifespan
from services.cv_generator import CVGenerationError, generate_cv

logging.basicConfig(level=getattr(logging, config.LOG_LEVEL, logging.INFO))
logger = logging.getLogger(__name__)


def _rate_key(request: Request) -> str:
    """Per-user limiter when we have a userId in the body, else per-IP."""
    user_id = getattr(request.state, "rate_user_id", None)
    return user_id or get_remote_address(request)


limiter = Limiter(key_func=_rate_key)

app = FastAPI(lifespan=lifespan, title="SBOUP CV Generation")
app.state.limiter = limiter
# SlowAPIMiddleware reads `app.state.limiter` and enforces the @limiter.limit
# decorators per request — without it, decorators are inert.
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content=ErrorResponse(
            error="RATE_LIMITED",
            message="Too many CV generations from this user. Try again shortly.",
        ).model_dump(),
    )


@app.exception_handler(RequestValidationError)
async def _validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=ErrorResponse(
            error="INVALID_REQUEST",
            message=exc.errors()[0]["msg"] if exc.errors() else "invalid request",
        ).model_dump(),
    )


# Local file storage mount — only when explicitly using the local backend.
if config.STORAGE_BACKEND == "local":
    storage_root = Path(config.LOCAL_STORAGE_DIR)
    storage_root.mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(storage_root)), name="static")


def _check_internal_key(x_internal_api_key: str | None) -> None:
    """If INTERNAL_API_KEY is configured, require the header to match.
    Empty configured key = open (development default).
    """
    expected = config.INTERNAL_API_KEY
    if not expected:
        return
    if x_internal_api_key != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "UNAUTHORIZED", "message": "internal API key required"},
        )


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", models_loaded=ai_models.models_loaded)


@app.post("/api/cv/generate", response_model=GenerateCVResponse)
@limiter.limit(f"{config.RATE_LIMIT_PER_USER_PER_MINUTE}/minute")
async def generate_cv_endpoint(
    request: Request,
    body: GenerateCVRequest,
    x_internal_api_key: str | None = Header(default=None),
) -> GenerateCVResponse:
    _check_internal_key(x_internal_api_key)

    if not ai_models.models_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "MODELS_NOT_READY",
                "message": "AI models still warming up; retry in a few seconds.",
            },
        )

    # Stash userId for the rate limiter key function so retries from the
    # same user are throttled even if Node.js proxies them from one IP.
    request.state.rate_user_id = body.userId or body.profileId

    try:
        result = await generate_cv(body.model_dump())
    except CVGenerationError as exc:
        logger.warning(
            "cv generation failed: %s — %s",
            exc.code,
            exc.message,
            extra={
                "userId": body.userId,
                "profileId": body.profileId,
                "error_code": exc.code,
            },
        )
        raise HTTPException(
            status_code=exc.status,
            detail={"error": exc.code, "message": exc.message},
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("unhandled CV generation error")
        raise HTTPException(
            status_code=500,
            detail={"error": "INTERNAL_ERROR", "message": str(exc)},
        ) from exc

    return GenerateCVResponse(
        ok=True,
        data=GenerateCVData(
            cvId=result["cvId"],
            fileUrl=result["fileUrl"],
            fileFormat=result["fileFormat"],
            cvFieldTarget=result["cvFieldTarget"],
        ),
    )


@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException):
    """Force the structured error envelope for every HTTPException, so the
    Node.js ml.service.js never sees raw FastAPI default JSON.
    """
    detail = exc.detail
    if isinstance(detail, dict) and "error" in detail:
        body = detail
    else:
        body = {"error": "INTERNAL_ERROR", "message": str(detail)}
    return JSONResponse(status_code=exc.status_code, content=body)
