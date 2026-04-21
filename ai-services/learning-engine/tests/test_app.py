"""Smoke tests for the learning-engine service."""
import pytest
from app.main import app, get_resources_for_skill


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


def test_health(client):
    res = client.get('/api/health')
    assert res.status_code == 200
    assert res.get_json()['service'] == 'learning-engine'


def test_known_skill_returns_curated_resources():
    resources = get_resources_for_skill('JavaScript')
    assert len(resources) > 0
    assert all('url' in r and 'provider' in r for r in resources)


def test_unknown_skill_falls_back_to_default_search():
    resources = get_resources_for_skill('Basket Weaving')
    assert len(resources) > 0
    assert any('Basket Weaving' in r['url'] for r in resources)


def test_generate_with_target_skill(client):
    res = client.post('/api/learning/generate', json={'targetSkill': 'JavaScript'})
    assert res.status_code == 200
    body = res.get_json()
    assert body['targetSkill'] == 'JavaScript'
    assert isinstance(body['resources'], list)
