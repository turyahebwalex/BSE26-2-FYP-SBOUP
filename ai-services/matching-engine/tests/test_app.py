"""Smoke tests for the matching-engine service."""
import pytest
from app.main import app


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


def test_health(client):
    res = client.get('/api/health')
    assert res.status_code == 200
    body = res.get_json()
    assert body['status'] == 'ok'
    assert body['service'] == 'matching-engine'


def test_score_requires_ids(client):
    res = client.post('/api/match/score', json={})
    assert res.status_code == 500


def test_trigger_opportunity_match_accepts_id(client):
    res = client.post('/api/match/opportunity', json={'opportunityId': '507f1f77bcf86cd799439011'})
    assert res.status_code == 200
    assert res.get_json()['status'] == 'matching_triggered'
