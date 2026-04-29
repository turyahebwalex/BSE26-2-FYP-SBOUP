"""
Tests for the matching-engine service.

Covers:
  - Health endpoint (including ML availability flag)
  - API contract (correct fields in response)
  - ML helper functions (_cosine, _build_feature_row, _ml_predict)
  - Logical sanity (perfect match > zero match, remote > non-remote, etc.)
  - Fallback behaviour when ML models are unavailable
"""

import pytest
import numpy as np
from unittest.mock import patch, MagicMock

from app.main import app, _cosine, _build_feature_row, _ml_predict


# ── Flask test client ─────────────────────────────────────────────────────────
@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


# ─────────────────────────────────────────────────────────────────────────────
# 1. Health endpoint
# ─────────────────────────────────────────────────────────────────────────────
def test_health_ok(client):
    res = client.get('/api/health')
    assert res.status_code == 200
    body = res.get_json()
    assert body['status'] == 'ok'
    assert body['service'] == 'matching-engine'
    # New fields added after ML integration
    assert 'mlAvailable' in body
    assert 'features' in body
    assert isinstance(body['features'], int)


# ─────────────────────────────────────────────────────────────────────────────
# 2. API contract — /api/match/score
# ─────────────────────────────────────────────────────────────────────────────
def test_score_missing_body_returns_500(client):
    res = client.post('/api/match/score', json={})
    assert res.status_code == 500


def test_score_invalid_object_id_returns_500(client):
    res = client.post('/api/match/score', json={
        'profileId': 'not-an-objectid',
        'opportunityId': 'also-not-an-objectid',
    })
    assert res.status_code == 500


def test_trigger_opportunity_match_accepts_id(client):
    res = client.post(
        '/api/match/opportunity',
        json={'opportunityId': '507f1f77bcf86cd799439011'},
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body['status'] == 'matching_triggered'
    assert body['opportunityId'] == '507f1f77bcf86cd799439011'


# ─────────────────────────────────────────────────────────────────────────────
# 3. _cosine helper
# ─────────────────────────────────────────────────────────────────────────────
def test_cosine_identical_vectors():
    skills = {'Python': 1.0, 'React': 0.75}
    assert _cosine(skills, skills) == pytest.approx(1.0, abs=0.001)


def test_cosine_zero_overlap():
    worker = {'Python': 1.0}
    opp    = {'Carpentry': 1.0}
    assert _cosine(worker, opp) == pytest.approx(0.0, abs=0.001)


def test_cosine_partial_overlap():
    worker = {'Python': 1.0, 'React': 0.5}
    opp    = {'Python': 1.0, 'SQL': 1.0}
    score  = _cosine(worker, opp)
    assert 0.0 < score < 1.0


def test_cosine_empty_vectors():
    assert _cosine({}, {}) == 0.0


def test_cosine_one_empty():
    assert _cosine({'Python': 1.0}, {}) == 0.0


# ─────────────────────────────────────────────────────────────────────────────
# 4. _build_feature_row
# ─────────────────────────────────────────────────────────────────────────────
def _make_worker_ctx(**overrides):
    base = {
        'total_exp_months':     24,
        'n_skills':             4,
        'profile_completeness': 0.8,
        'n_past_applications':  10,
        'n_shortlisted':        3,
        'expected_rate_min':    400_000,
        'expected_rate_max':    1_200_000,
        'location':             'Kampala',
        'experiences':          [],
    }
    base.update(overrides)
    return base


def _make_opp(**overrides):
    import datetime
    base = {
        'category':         'formal',
        'location':         'Kampala',
        'isRemote':         False,
        'experienceLevel':  'mid',
        'compensationRange': {'min': 500_000, 'max': 1_000_000},
        'applicationCount': 20,
        'viewCount':        100,
        'deadline':         datetime.datetime.utcnow() + datetime.timedelta(days=30),
    }
    base.update(overrides)
    return base


def test_feature_row_perfect_overlap():
    skills = {'Python': 1.0, 'React': 0.75, 'SQL': 0.5}
    row = _build_feature_row(skills, skills, _make_worker_ctx(), _make_opp())
    assert row['skill_overlap_count'] == 3
    assert row['skill_gap_count']     == 0
    assert row['skill_overlap_ratio'] == pytest.approx(1.0, abs=0.001)
    assert row['cosine_similarity']   == pytest.approx(1.0, abs=0.01)


def test_feature_row_zero_overlap():
    worker_skills = {'Python': 1.0}
    opp_skills    = {'Carpentry': 1.0}
    row = _build_feature_row(worker_skills, opp_skills, _make_worker_ctx(), _make_opp())
    assert row['skill_overlap_count'] == 0
    assert row['skill_gap_count']     == 1
    assert row['cosine_similarity']   == pytest.approx(0.0, abs=0.001)


def test_feature_row_location_match():
    row = _build_feature_row(
        {}, {}, _make_worker_ctx(location='Kampala'), _make_opp(location='Kampala')
    )
    assert row['location_match'] == 1


def test_feature_row_location_mismatch():
    row = _build_feature_row(
        {}, {}, _make_worker_ctx(location='Gulu'), _make_opp(location='Kampala', isRemote=False)
    )
    assert row['location_match'] == 0


def test_feature_row_remote_overrides_location():
    """Remote opportunity should give location_match=1 regardless of city."""
    row = _build_feature_row(
        {}, {}, _make_worker_ctx(location='Gulu'), _make_opp(location='Kampala', isRemote=True)
    )
    assert row['location_match'] == 1


def test_feature_row_salary_fit():
    ctx = _make_worker_ctx(expected_rate_min=400_000, expected_rate_max=900_000)
    opp = _make_opp()  # comp range 500k-1M → overlaps
    row = _build_feature_row({}, {}, ctx, opp)
    assert row['salary_fit'] == 1


def test_feature_row_salary_no_fit():
    ctx = _make_worker_ctx(expected_rate_min=2_000_000, expected_rate_max=5_000_000)
    opp = _make_opp()  # comp range 500k-1M → no overlap
    row = _build_feature_row({}, {}, ctx, opp)
    assert row['salary_fit'] == 0


def test_feature_row_exp_fit_mid():
    ctx = _make_worker_ctx(total_exp_months=40)  # >= 36 → fits mid
    row = _build_feature_row({}, {}, ctx, _make_opp(experienceLevel='mid'))
    assert row['exp_fit'] == 1


def test_feature_row_exp_no_fit_senior():
    ctx = _make_worker_ctx(total_exp_months=20)  # < 72 → doesn't fit senior
    row = _build_feature_row({}, {}, ctx, _make_opp(experienceLevel='senior'))
    assert row['exp_fit'] == 0


def test_feature_row_category_one_hot():
    for cat in ['formal', 'contract', 'freelance', 'apprenticeship']:
        row = _build_feature_row({}, {}, _make_worker_ctx(), _make_opp(category=cat))
        assert row[f'opp_category_{cat}'] == 1
        others = [c for c in ['formal', 'contract', 'freelance', 'apprenticeship'] if c != cat]
        for other in others:
            assert row[f'opp_category_{other}'] == 0


# ─────────────────────────────────────────────────────────────────────────────
# 5. _ml_predict — logical sanity checks
# ─────────────────────────────────────────────────────────────────────────────
def _perfect_row():
    skills = {'Python': 1.0, 'React': 0.75, 'SQL': 0.5, 'Node.js': 0.75}
    return _build_feature_row(
        skills, skills,
        _make_worker_ctx(
            total_exp_months=72,
            n_skills=4,
            profile_completeness=1.0,
            n_shortlisted=8,
            expected_rate_min=400_000,
            expected_rate_max=900_000,
            location='Kampala',
        ),
        _make_opp(location='Kampala', isRemote=False, experienceLevel='senior'),
    )


def _zero_row():
    return _build_feature_row(
        {'Python': 1.0}, {'Carpentry': 1.0},
        _make_worker_ctx(
            total_exp_months=0,
            n_skills=1,
            profile_completeness=0.4,
            n_shortlisted=0,
            expected_rate_min=2_000_000,
            expected_rate_max=5_000_000,
            location='Gulu',
        ),
        _make_opp(location='Kampala', isRemote=False, experienceLevel='senior'),
    )


def test_perfect_match_scores_above_80():
    score, _ = _ml_predict(_perfect_row())
    assert score > 80, f"Perfect match scored {score}, expected > 80"


def test_zero_overlap_scores_below_30():
    score, _ = _ml_predict(_zero_row())
    assert score < 30, f"Zero overlap scored {score}, expected < 30"


def test_perfect_beats_zero():
    perfect_score, _ = _ml_predict(_perfect_row())
    zero_score, _    = _ml_predict(_zero_row())
    assert perfect_score > zero_score


def test_remote_opportunity_scores_higher_than_non_remote():
    skills = {'Python': 1.0, 'React': 0.75}
    ctx    = _make_worker_ctx(location='Gulu')

    remote_row = _build_feature_row(
        skills, skills, ctx, _make_opp(location='Kampala', isRemote=True)
    )
    non_remote_row = _build_feature_row(
        skills, skills, ctx, _make_opp(location='Kampala', isRemote=False)
    )
    remote_score, _     = _ml_predict(remote_row)
    non_remote_score, _ = _ml_predict(non_remote_row)
    assert remote_score > non_remote_score


def test_score_always_in_0_100_range():
    for row in [_perfect_row(), _zero_row()]:
        score, prob = _ml_predict(row)
        assert 0 <= score <= 100
        if prob is not None:
            assert 0 <= prob <= 1


# ─────────────────────────────────────────────────────────────────────────────
# 6. Fallback — rule-based when ML unavailable
# ─────────────────────────────────────────────────────────────────────────────
def test_fallback_when_ml_unavailable():
    """When _ML_AVAILABLE=False, _ml_predict should still return a valid score."""
    import app.main as main_module
    original = main_module._ML_AVAILABLE
    try:
        main_module._ML_AVAILABLE = False
        score, prob = _ml_predict(_perfect_row())
        assert 0 <= score <= 100
        assert prob is None   # classifier not used in fallback
    finally:
        main_module._ML_AVAILABLE = original
