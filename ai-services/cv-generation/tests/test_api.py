"""Endpoint smoke tests using the FastAPI TestClient. AI model loading is
mocked so tests don't require the model weights.
"""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    # Mock model loading so we can exercise routes without HF weights.
    from services import ai_model_manager

    monkeypatch.setattr(ai_model_manager.AIModelManager, "load_models", lambda self: setattr(self, "_models_loaded", True))

    from main import app
    with TestClient(app) as c:
        yield c


def test_health_returns_models_loaded_true(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["models_loaded"] is True


def test_generate_rejects_missing_profile_id(client):
    resp = client.post(
        "/api/cv/generate",
        json={"templateType": "chronological"},
    )
    # Pydantic validation kicks in before the orchestrator.
    assert resp.status_code == 422
    body = resp.json()
    assert body["error"] == "INVALID_REQUEST"
