"""
SBOUP Matching Engine Microservice
Hybrid ML-based matching using trained LightGBM models.

Models loaded at startup from ../model/:
  - matching_model.pkl      → regression  (predicts match score 0-100)
  - outcome_classifier.pkl  → classifier  (predicts shortlist probability)
  - feature_list.json       → exact feature order the models expect

Falls back to rule-based scoring if models are not found.
"""

import os
import json
import logging
import datetime

import joblib
import numpy as np
from bson import ObjectId
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from sklearn.metrics.pairwise import cosine_similarity as sk_cosine

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── MongoDB ───────────────────────────────────────────────────────────────────
MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/sboup_dev')
mongo_client = MongoClient(MONGODB_URI)
db = (
    mongo_client.get_default_database()
    if 'sboup' in MONGODB_URI
    else mongo_client['sboup_dev']
)

# ── Load ML models once at startup ────────────────────────────────────────────
_MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'model')

try:
    _reg_model = joblib.load(os.path.join(_MODEL_DIR, 'matching_model.pkl'))
    _clf_model = joblib.load(os.path.join(_MODEL_DIR, 'outcome_classifier.pkl'))
    with open(os.path.join(_MODEL_DIR, 'feature_list.json')) as _f:
        _FEATURE_LIST = json.load(_f)
    logger.info("ML matching models loaded successfully (%d features)", len(_FEATURE_LIST))
    _ML_AVAILABLE = True
except Exception as _e:
    _reg_model = None
    _clf_model = None
    _FEATURE_LIST = []
    _ML_AVAILABLE = False
    logger.warning("ML models not found — falling back to rule-based scoring: %s", _e)

# Experience threshold map (months) — mirrors training data
_EXP_THRESHOLD = {'entry': 12, 'mid': 36, 'senior': 72, 'any': 0}


# ── MongoDB helper functions (unchanged) ─────────────────────────────────────

def get_profile_skill_vector(profile_id):
    """Return {skill_name: proficiency_weight} for a worker profile."""
    profile_skills = list(db.profileskills.find({'profileId': profile_id}))
    all_skills = list(db.skills.find())
    skill_map = {str(s['_id']): s['skillName'] for s in all_skills}

    proficiency_weights = {
        'beginner': 0.25, 'intermediate': 0.5,
        'advanced': 0.75, 'expert': 1.0,
    }
    vector = {}
    for ps in profile_skills:
        skill_name = skill_map.get(str(ps['skillId']), '')
        weight = proficiency_weights.get(ps.get('proficiencyLevel', 'beginner'), 0.25)
        if skill_name:
            vector[skill_name] = weight
    return vector


def get_opportunity_skill_vector(opportunity_id):
    """Return {skill_name: 1.0} for required skills of an opportunity."""
    opportunity = db.opportunities.find_one({'_id': opportunity_id})
    if not opportunity:
        return {}
    skill_names = []
    for sid in opportunity.get('requiredSkills', []):
        skill = db.skills.find_one({'_id': sid})
        if skill:
            skill_names.append(skill['skillName'])
    return {name: 1.0 for name in skill_names}


def _cosine(worker_skills: dict, opp_skills: dict) -> float:
    """Cosine similarity between two skill weight dicts."""
    all_skills = set(worker_skills) | set(opp_skills)
    if not all_skills:
        return 0.0
    vec_a = np.array([worker_skills.get(s, 0) for s in all_skills]).reshape(1, -1)
    vec_b = np.array([opp_skills.get(s, 0) for s in all_skills]).reshape(1, -1)
    if np.linalg.norm(vec_a) == 0 or np.linalg.norm(vec_b) == 0:
        return 0.0
    return float(sk_cosine(vec_a, vec_b)[0][0])


def _get_worker_context(profile_id, profile_doc=None):
    """
    Fetch worker context features from MongoDB.
    Returns a dict with all worker-level features needed by the model.
    """
    if profile_doc is None:
        profile_doc = db.profiles.find_one({'_id': profile_id}) or {}

    # Total experience months
    experiences = list(db.experiences.find({'profileId': profile_id}))
    total_exp_months = sum(e.get('durationMonths', 0) for e in experiences)

    # Skill count
    profile_skills = list(db.profileskills.find({'profileId': profile_id}))
    n_skills = len(profile_skills)

    # Application history
    n_past_apps = db.applications.count_documents({'profileId': profile_id})
    n_shortlisted = db.applications.count_documents({
        'profileId': profile_id,
        'status': {'$in': ['shortlisted', 'offer_extended']},
    })

    # Profile completeness
    has_title     = bool(profile_doc.get('title'))
    has_bio       = bool(profile_doc.get('bio'))
    has_location  = bool(profile_doc.get('location'))
    has_skills    = n_skills > 0
    has_exp       = total_exp_months > 0
    has_portfolio = len(profile_doc.get('portfolioItems', [])) > 0
    completeness  = round(
        (0.15 if has_title     else 0) +
        (0.10 if has_bio       else 0) +
        (0.10 if has_location  else 0) +
        (0.25 if has_skills    else 0) +
        (0.25 if has_exp       else 0) +
        (0.15 if has_portfolio else 0),
        2,
    )

    # Expected rate (from preferences collection)
    pref = db.preferences.find_one({'profileId': profile_id}) or {}
    expected_rate_min = pref.get('salaryMin', 0)
    expected_rate_max = pref.get('salaryMax', 0)

    return {
        'total_exp_months':     total_exp_months,
        'n_skills':             n_skills,
        'profile_completeness': completeness,
        'n_past_applications':  n_past_apps,
        'n_shortlisted':        n_shortlisted,
        'expected_rate_min':    expected_rate_min,
        'expected_rate_max':    expected_rate_max,
        'location':             profile_doc.get('location', ''),
        'experiences':          experiences,
    }


def _get_skill_categories(skill_names: list) -> set:
    """Return the set of categories for a list of skill names."""
    categories = set()
    for name in skill_names:
        skill_doc = db.skills.find_one({'skillName': name})
        if skill_doc and skill_doc.get('category'):
            categories.add(skill_doc['category'])
    return categories


def _build_feature_row(worker_skills, opp_skills, worker_ctx, opp_doc):
    """
    Build the complete feature dict that the ML model expects.
    Mirrors exactly the features in feature_list.json.
    """
    worker_skill_set = set(worker_skills.keys())
    opp_skill_set    = set(opp_skills.keys())
    n_req            = len(opp_skill_set) or 1

    overlap_count = len(worker_skill_set & opp_skill_set)
    gap_count     = len(opp_skill_set - worker_skill_set)
    cosine_sim    = _cosine(worker_skills, opp_skills)

    # Skill category overlap
    worker_categories = _get_skill_categories(list(worker_skill_set))
    opp_categories    = _get_skill_categories(list(opp_skill_set))
    n_opp_cats        = len(opp_categories) or 1
    skill_category_overlap      = len(worker_categories & opp_categories)
    worker_category_match_ratio = round(skill_category_overlap / n_opp_cats, 4)

    # Location match: same city OR remote opportunity
    location_match = int(
        worker_ctx['location'] == opp_doc.get('location', '') or
        opp_doc.get('isRemote', False)
    )

    # Salary fit
    comp = opp_doc.get('compensationRange', {})
    comp_min = comp.get('min', 0) or 0
    comp_max = comp.get('max', 0) or 0
    if comp_max == 0:
        salary_fit = 1   # no range specified → assume fit
    else:
        salary_fit = int(
            worker_ctx['expected_rate_min'] <= comp_max and
            worker_ctx['expected_rate_max'] >= comp_min
        )

    # Experience level fit
    exp_level    = opp_doc.get('experienceLevel', 'any')
    exp_required = _EXP_THRESHOLD.get(exp_level, 0)
    exp_fit      = int(worker_ctx['total_exp_months'] >= exp_required)

    # Opportunity context
    category = opp_doc.get('category', 'formal')
    deadline = opp_doc.get('deadline')
    days_until_deadline = (
        max((deadline - datetime.datetime.utcnow()).days, 0)
        if deadline else 30
    )

    return {
        'skill_overlap_count':          overlap_count,
        'skill_gap_count':              gap_count,
        'skill_overlap_ratio':          round(overlap_count / n_req, 4),
        'cosine_similarity':            round(cosine_sim, 4),
        'location_match':               location_match,
        'salary_fit':                   salary_fit,
        'exp_fit':                      exp_fit,
        'skill_category_overlap':       skill_category_overlap,
        'worker_category_match_ratio':  worker_category_match_ratio,
        'worker_n_skills':              worker_ctx['n_skills'],
        'worker_total_exp_months':      worker_ctx['total_exp_months'],
        'worker_profile_completeness':  worker_ctx['profile_completeness'],
        'worker_n_past_applications':   worker_ctx['n_past_applications'],
        'worker_n_shortlisted':         worker_ctx['n_shortlisted'],
        'opp_n_required_skills':        len(opp_skill_set),
        'opp_application_count':        opp_doc.get('applicationCount', 0),
        'opp_view_count':               opp_doc.get('viewCount', 0),
        'opp_days_until_deadline':      days_until_deadline,
        'opp_is_remote':                int(opp_doc.get('isRemote', False)),
        'opp_category_formal':          int(category == 'formal'),
        'opp_category_contract':        int(category == 'contract'),
        'opp_category_freelance':       int(category == 'freelance'),
        'opp_category_apprenticeship':  int(category == 'apprenticeship'),
    }


def _ml_predict(feature_row: dict):
    """
    Run both ML models on a feature row.
    Returns (match_score, shortlist_probability).
    Falls back to rule-based if models unavailable.
    """
    if not _ML_AVAILABLE:
        # Rule-based fallback (original formula)
        score = round(
            feature_row['cosine_similarity']       * 50 +
            feature_row['location_match']          * 15 +
            feature_row['salary_fit']              * 10 +
            feature_row['exp_fit']                 * 10 +
            feature_row['worker_profile_completeness'] * 10 +
            min(feature_row['worker_n_shortlisted'] * 0.5, 5),
            1,
        )
        return min(max(score, 0), 100), None

    X = [[feature_row.get(f, 0) for f in _FEATURE_LIST]]
    match_score   = float(np.clip(_reg_model.predict(X)[0], 0, 100))
    shortlist_prob = float(_clf_model.predict_proba(X)[0][1])
    return round(match_score, 1), round(shortlist_prob, 4)


# ── API Endpoints ─────────────────────────────────────────────────────────────

@app.route('/api/match/score', methods=['POST'])
def compute_match_score():
    """
    Compute ML match score between a worker profile and an opportunity.
    POST body: { profileId, opportunityId }
    """
    try:
        data           = request.json
        profile_id     = ObjectId(data['profileId'])
        opportunity_id = ObjectId(data['opportunityId'])

        opportunity = db.opportunities.find_one({'_id': opportunity_id})
        if not opportunity:
            return jsonify({'error': 'Opportunity not found'}), 404

        profile = db.profiles.find_one({'_id': profile_id})

        worker_skills = get_profile_skill_vector(profile_id)
        opp_skills    = get_opportunity_skill_vector(opportunity_id)
        worker_ctx    = _get_worker_context(profile_id, profile)

        feature_row   = _build_feature_row(worker_skills, opp_skills, worker_ctx, opportunity)
        match_score, shortlist_prob = _ml_predict(feature_row)

        missing_skills = [s for s in opp_skills if s not in worker_skills]

        response = {
            'matchScore':    match_score,
            'missingSkills': missing_skills,
            'breakdown': {
                'cosineScore':      round(feature_row['cosine_similarity'] * 100, 1),
                'locationMatch':    bool(feature_row['location_match']),
                'salaryFit':        bool(feature_row['salary_fit']),
                'expFit':           bool(feature_row['exp_fit']),
                'skillOverlap':     feature_row['skill_overlap_count'],
                'skillGap':         feature_row['skill_gap_count'],
            },
            'modelUsed': 'ml' if _ML_AVAILABLE else 'rule-based',
        }
        if shortlist_prob is not None:
            response['shortlistProbability'] = shortlist_prob

        return jsonify(response)

    except Exception as e:
        logger.error("Match score error: %s", e)
        return jsonify({'error': str(e)}), 500


@app.route('/api/match/recommendations/<user_id>', methods=['GET'])
def get_recommendations(user_id):
    """
    Get ranked opportunity recommendations for a worker.
    Returns top 20 opportunities sorted by ML match score.
    """
    try:
        profile = db.profiles.find_one({'userId': ObjectId(user_id)})
        if not profile:
            return jsonify({'recommendations': []})

        opportunities = list(db.opportunities.find({
            'status': 'published',
            'deadline': {'$gte': datetime.datetime.utcnow()},
        }).limit(100))

        worker_skills = get_profile_skill_vector(profile['_id'])
        worker_ctx    = _get_worker_context(profile['_id'], profile)

        results = []
        for opp in opportunities:
            opp_skills  = get_opportunity_skill_vector(opp['_id'])
            feature_row = _build_feature_row(worker_skills, opp_skills, worker_ctx, opp)
            match_score, shortlist_prob = _ml_predict(feature_row)
            missing     = [s for s in opp_skills if s not in worker_skills]

            entry = {
                'opportunityId': str(opp['_id']),
                'title':         opp.get('title', ''),
                'matchScore':    match_score,
                'missingSkills': missing,
                'modelUsed':     'ml' if _ML_AVAILABLE else 'rule-based',
            }
            if shortlist_prob is not None:
                entry['shortlistProbability'] = shortlist_prob
            results.append(entry)

        results.sort(key=lambda x: x['matchScore'], reverse=True)
        return jsonify({'recommendations': results[:20]})

    except Exception as e:
        logger.error("Recommendations error: %s", e)
        return jsonify({'error': str(e)}), 500


@app.route('/api/match/scores-batch', methods=['POST'])
def batch_match_scores():
    """
    Compute match scores for one worker profile against many opportunities.
    Body: { profileId, opportunityIds: [..] }
    Returns: { scores: { opportunityId: matchScore } }
    """
    try:
        from bson import ObjectId
        data = request.json or {}
        profile_id = ObjectId(data['profileId'])
        opp_ids = [ObjectId(x) for x in (data.get('opportunityIds') or []) if x]

        worker_skills = get_profile_skill_vector(profile_id)
        scores = {}
        for opp_id in opp_ids:
            opp = db.opportunities.find_one({'_id': opp_id})
            if not opp:
                scores[str(opp_id)] = 0
                continue
            opp_skills = get_opportunity_skill_vector(opp_id)
            skill_score = compute_cosine_similarity(worker_skills, opp_skills) * 100
            exp_score = compute_experience_score(profile_id, opp.get('category', ''))
            match_score = round((0.5 * skill_score) + (0.25 * exp_score) + (0.25 * 0), 1)
            scores[str(opp_id)] = match_score

        return jsonify({'scores': scores})
    except Exception as e:
        logger.error(f"Batch score error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/match/opportunity', methods=['POST'])
def match_for_opportunity():
    """Trigger matching for a newly posted opportunity."""
    try:
        data           = request.json
        opportunity_id = ObjectId(data['opportunityId'])
        return jsonify({
            'status':        'matching_triggered',
            'opportunityId': str(opportunity_id),
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status':      'ok',
        'service':     'matching-engine',
        'mlAvailable': _ML_AVAILABLE,
        'features':    len(_FEATURE_LIST),
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
