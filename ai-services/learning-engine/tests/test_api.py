"""Endpoint smoke tests using the FastAPI TestClient.

AI model loading is mocked so tests don't need HF weights. The
orchestrator is mocked so we don't need Mongo or the matching-engine —
this file proves the wire envelope is correct, nothing more.
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    from services import ai_model_manager

    monkeypatch.setattr(
        ai_model_manager.AIModelManager,
        "load_models",
        lambda self: setattr(self, "_models_loaded", True),
    )

    from main import app

    with TestClient(app) as c:
        yield c


def test_health_returns_models_loaded(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "models_loaded" in body


def test_generate_validates_userid(client):
    resp = client.post(
        "/api/learning/generate",
        json={"targetSkill": "Python"},  # missing userId
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["error"] == "INVALID_REQUEST"


def test_generate_returns_envelope(client, monkeypatch):
    fake_result = {
        "consistencyMode": "standalone",
        "targetSkill": "Python",
        "missingSkills": ["Python"],
        "criticalGapCount": 1,
        "matchBreakdown": None,
        "aliasHints": [],
        "proficiencyShortfalls": [],
        "bioInferredSkills": [],
        "analysisSummary": "1 of 1 required skill(s) missing.",
        "pathwayRationale": "Pathway covering 1 missing skill: Python.",
        "resources": [
            {
                "title": "Python for Everybody",
                "url": "https://example/python",
                "provider": "Coursera",
                "cost": 0,
                "priceLabel": "Free",
                "estimatedDuration": "80h",
                "type": "course",
                "rating": 4.8,
                "difficultyLevel": "beginner",
                "relevanceScore": 0.85,
                "finalScore": 0.83,
                "bridgesSkill": "Python",
                "whyThisCourse": "Bridges the Python gap. Beginner-level course from Coursera.",
                "isCompleted": False,
            }
        ],
        "skillGapLogId": None,
    }
    import main as main_mod

    monkeypatch.setattr(
        main_mod,
        "generate_learning_path",
        AsyncMock(return_value=fake_result),
    )

    resp = client.post(
        "/api/learning/generate",
        json={"userId": "507f1f77bcf86cd799439012", "targetSkill": "Python"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["data"]["consistencyMode"] == "standalone"
    assert body["data"]["resources"][0]["bridgesSkill"] == "Python"
    # Backwards compat: top-level resources alias for the existing Node controller.
    assert body["resources"][0]["url"] == "https://example/python"


def test_skill_gaps_validates_inputs(client):
    resp = client.post("/api/learning/skill-gaps", json={"profileId": "p"})
    assert resp.status_code == 422


def test_progress_endpoint_returns_envelope(client, monkeypatch):
    from services import progress_tracker

    monkeypatch.setattr(
        progress_tracker,
        "mark_resource_completed",
        AsyncMock(
            return_value={"profileSkillsUpdated": 1, "learningProgressLogged": True}
        ),
    )
    # Patch through main's local import binding too.
    import main as main_mod

    monkeypatch.setattr(main_mod, "mark_resource_completed", progress_tracker.mark_resource_completed)

    resp = client.post(
        "/api/learning/progress",
        json={
            "userId": "507f1f77bcf86cd799439012",
            "resourceUrl": "https://x",
            "bridgesSkill": "Python",
            "isCompleted": True,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["profileSkillsUpdated"] == 1
