"""FastAPI entry point for the SBOUP Learning Engine service.

Routes:
- POST /api/learning/generate        — internal; called by Node.js ml.service.js
- POST /api/learning/skill-gaps      — pure analysis, no DB write
- POST /api/learning/dashboard-fit   — drives §6.2.4 worker dashboard
- POST /api/learning/progress        — upserts profileskills + audit
- GET  /health                       — Kubernetes liveness/readiness probe
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, Header, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

import config
from models.request_models import (
    AnalyseSkillGapsRequest,
    DashboardFitData,
    DashboardFitRequest,
    DashboardFitResponse,
    ErrorResponse,
    FittingCategory,
    GenerateLearningPathData,
    GenerateLearningPathRequest,
    GenerateLearningPathResponse,
    HealthResponse,
    ProgressData,
    ProgressResponse,
    ProgressUpdateRequest,
    SkillGapsData,
    SkillGapsResponse,
)
from services.ai_model_manager import ai_models, lifespan
from services.learning_path_generator import (
    LearningEngineError,
    analyse_skill_gaps,
    generate_learning_path,
)
from services.profile_service import fetch_profile_by_user
from services.progress_tracker import mark_resource_completed
from services.taxonomy_service import compute_category_fit

logging.basicConfig(level=getattr(logging, config.LOG_LEVEL, logging.INFO))
logger = logging.getLogger(__name__)


def _rate_key(request: Request) -> str:
    """Per-user limiter when we have a userId in the body, else per-IP."""
    user_id = getattr(request.state, "rate_user_id", None)
    return user_id or get_remote_address(request)


limiter = Limiter(key_func=_rate_key)

app = FastAPI(lifespan=lifespan, title="SBOUP Learning Engine")
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content=ErrorResponse(
            error="RATE_LIMITED",
            message="Too many learning path requests from this user. Try again shortly.",
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


def _check_internal_key(x_internal_api_key: str | None) -> None:
    expected = config.INTERNAL_API_KEY
    if not expected:
        return
    if x_internal_api_key != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "UNAUTHORIZED", "message": "internal API key required"},
        )


def _ensure_models_ready():
    if not ai_models.models_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "MODELS_NOT_READY",
                "message": "AI models still warming up; retry in a few seconds.",
            },
        )


def _raise_engine_error(exc: LearningEngineError) -> None:
    raise HTTPException(
        status_code=exc.status,
        detail={"error": exc.code, "message": exc.message},
    ) from exc


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        models_loaded=ai_models.models_loaded,
        semantic_model_loaded=ai_models.semantic_model is not None,
        summary_pipeline_loaded=ai_models.summary_pipeline is not None,
        ner_pipeline_loaded=ai_models.ner_pipeline is not None,
    )


@app.post("/api/learning/generate", response_model=GenerateLearningPathResponse)
@limiter.limit(f"{config.RATE_LIMIT_PER_USER_PER_MINUTE}/minute")
async def generate_endpoint(
    request: Request,
    body: GenerateLearningPathRequest,
    x_internal_api_key: str | None = Header(default=None),
) -> GenerateLearningPathResponse:
    _check_internal_key(x_internal_api_key)
    _ensure_models_ready()
    request.state.rate_user_id = body.userId

    try:
        result = await generate_learning_path(body.model_dump())
    except LearningEngineError as exc:
        logger.warning("learning path generation failed: %s — %s", exc.code, exc.message)
        _raise_engine_error(exc)
    except Exception as exc:  # noqa: BLE001
        logger.exception("unhandled learning path error")
        raise HTTPException(
            status_code=500,
            detail={"error": "INTERNAL_ERROR", "message": str(exc)},
        ) from exc

    data = GenerateLearningPathData(**result)
    # Backwards compatibility: existing Node.js controller reads
    # `response.data.resources` from axios — i.e. it expects `resources`
    # at the response root. Mirror it there for one release cycle.
    # TODO: drop top-level resources alias once server/controller is updated.
    return GenerateLearningPathResponse(
        ok=True,
        data=data,
        resources=result.get("resources", []),
    )


@app.post("/api/learning/skill-gaps", response_model=SkillGapsResponse)
@limiter.limit(f"{config.RATE_LIMIT_PER_USER_PER_MINUTE}/minute")
async def skill_gaps_endpoint(
    request: Request,
    body: AnalyseSkillGapsRequest,
    x_internal_api_key: str | None = Header(default=None),
) -> SkillGapsResponse:
    _check_internal_key(x_internal_api_key)
    _ensure_models_ready()
    request.state.rate_user_id = body.profileId

    try:
        result = await analyse_skill_gaps(body.model_dump())
    except LearningEngineError as exc:
        logger.warning("skill-gaps analysis failed: %s — %s", exc.code, exc.message)
        _raise_engine_error(exc)
    except Exception as exc:  # noqa: BLE001
        logger.exception("unhandled skill-gaps error")
        raise HTTPException(
            status_code=500,
            detail={"error": "INTERNAL_ERROR", "message": str(exc)},
        ) from exc

    return SkillGapsResponse(ok=True, data=SkillGapsData(**result))


@app.post("/api/learning/dashboard-fit", response_model=DashboardFitResponse)
@limiter.limit(f"{config.RATE_LIMIT_PER_USER_PER_MINUTE}/minute")
async def dashboard_fit_endpoint(
    request: Request,
    body: DashboardFitRequest,
    x_internal_api_key: str | None = Header(default=None),
) -> DashboardFitResponse:
    _check_internal_key(x_internal_api_key)
    _ensure_models_ready()
    request.state.rate_user_id = body.userId

    profile = await fetch_profile_by_user(body.userId)
    if profile is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "PROFILE_NOT_FOUND",
                "message": f"no profile found for user {body.userId}",
            },
        )

    try:
        fit, mode = await compute_category_fit(profile, body.userId)
    except Exception as exc:  # noqa: BLE001
        logger.exception("dashboard-fit failed")
        raise HTTPException(
            status_code=500,
            detail={"error": "INTERNAL_ERROR", "message": str(exc)},
        ) from exc

    return DashboardFitResponse(
        ok=True,
        data=DashboardFitData(
            consistencyMode=mode,
            fittingCategories=[
                FittingCategory(
                    category=c.category,
                    fitScore=c.fitScore,
                    matchingOpportunityCount=c.matchingOpportunityCount,
                    matchingSkillCount=c.matchingOpportunityCount,
                    missingSkills=c.missingSkills,
                    aliasHints=c.aliasHints,
                )
                for c in fit
            ],
        ),
    )


@app.post("/api/learning/progress", response_model=ProgressResponse)
@limiter.limit(f"{config.RATE_LIMIT_PER_USER_PER_MINUTE}/minute")
async def progress_endpoint(
    request: Request,
    body: ProgressUpdateRequest,
    x_internal_api_key: str | None = Header(default=None),
) -> ProgressResponse:
    _check_internal_key(x_internal_api_key)
    request.state.rate_user_id = body.userId

    try:
        summary = await mark_resource_completed(
            user_id=body.userId,
            learning_path_id=body.learningPathId,
            resource_url=body.resourceUrl,
            bridges_skill=body.bridgesSkill,
            is_completed=body.isCompleted,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("progress update failed")
        raise HTTPException(
            status_code=500,
            detail={"error": "INTERNAL_ERROR", "message": str(exc)},
        ) from exc

    return ProgressResponse(ok=True, data=ProgressData(**summary))


@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException):
    """Force the structured error envelope for every HTTPException."""
    detail = exc.detail
    if isinstance(detail, dict) and "error" in detail:
        body = detail
    else:
        body = {"error": "INTERNAL_ERROR", "message": str(detail)}
    return JSONResponse(status_code=exc.status_code, content=body)
