"""Smoke tests for the fraud-detection service."""
import pytest
from app.main import app, compute_fraud_score, extract_features, preprocess_text


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


def test_health(client):
    res = client.get('/api/health')
    assert res.status_code == 200
    assert res.get_json()['service'] == 'fraud-detection'


def test_preprocess_strips_punctuation():
    assert preprocess_text('Hello, World!!!') == 'hello world'


def test_compute_fraud_score_flags_known_patterns():
    text = 'send money via wire transfer for processing fee guaranteed income'
    features = extract_features(preprocess_text(text), {'description': text})
    score = compute_fraud_score(features)
    assert score >= 60


def test_compute_fraud_score_clean_posting():
    text = 'We are hiring a junior carpenter with 1 year of experience in Kampala.'
    features = extract_features(preprocess_text(text), {'description': text})
    score = compute_fraud_score(features)
    assert score < 30
