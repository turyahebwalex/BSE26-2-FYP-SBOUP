"""
SBOUP Matching Engine Microservice
Implements hybrid content-based + collaborative filtering for opportunity matching.
Algorithm from SDD Section 5.4 (ComputeMatchScore)
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer
import os
import logging

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# MongoDB connection
MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/sboup_dev')
client = MongoClient(MONGODB_URI)
db = client.get_default_database() if 'sboup' in MONGODB_URI else client['sboup_dev']


def get_profile_skill_vector(profile_id):
    """Extract skill vector from worker profile."""
    profile_skills = list(db.profileskills.find({'profileId': profile_id}))
    all_skills = list(db.skills.find())
    skill_map = {str(s['_id']): s['skillName'] for s in all_skills}

    vector = {}
    proficiency_weights = {'beginner': 0.25, 'intermediate': 0.5, 'advanced': 0.75, 'expert': 1.0}

    for ps in profile_skills:
        skill_name = skill_map.get(str(ps['skillId']), '')
        weight = proficiency_weights.get(ps.get('proficiencyLevel', 'beginner'), 0.25)
        if skill_name:
            vector[skill_name] = weight

    return vector


def get_opportunity_skill_vector(opportunity_id):
    """Extract required skill vector from opportunity."""
    opportunity = db.opportunities.find_one({'_id': opportunity_id})
    if not opportunity:
        return {}

    required_skills = opportunity.get('requiredSkills', [])
    skill_names = []
    for sid in required_skills:
        skill = db.skills.find_one({'_id': sid})
        if skill:
            skill_names.append(skill['skillName'])

    return {name: 1.0 for name in skill_names}


def compute_cosine_similarity(worker_skills, opp_skills):
    """Compute cosine similarity between skill vectors."""
    all_skills = set(list(worker_skills.keys()) + list(opp_skills.keys()))
    if not all_skills:
        return 0.0

    vec_a = np.array([worker_skills.get(s, 0) for s in all_skills]).reshape(1, -1)
    vec_b = np.array([opp_skills.get(s, 0) for s in all_skills]).reshape(1, -1)

    if np.linalg.norm(vec_a) == 0 or np.linalg.norm(vec_b) == 0:
        return 0.0

    return float(cosine_similarity(vec_a, vec_b)[0][0])


def compute_experience_score(profile_id, opp_category):
    """Compute experience relevance score (0-100)."""
    experiences = list(db.experiences.find({'profileId': profile_id}))
    total_months = 0
    for exp in experiences:
        if exp.get('category', '').lower() == opp_category.lower():
            total_months += exp.get('durationMonths', 0)
    return min(total_months, 100)


def compute_collaborative_score(profile_id, opportunity_id):
    """Compute collaborative filtering score based on similar users."""
    # Find workers with similar skills who applied to this opportunity
    worker_skills = db.profileskills.find({'profileId': profile_id})
    skill_ids = [ps['skillId'] for ps in worker_skills]

    # Find other profiles with overlapping skills
    similar_profiles = db.profileskills.find({'skillId': {'$in': skill_ids}, 'profileId': {'$ne': profile_id}})
    similar_profile_ids = list(set([sp['profileId'] for sp in similar_profiles]))

    if not similar_profile_ids:
        return 0

    # Count how many similar workers applied to this opportunity
    applications = db.applications.count_documents({
        'profileId': {'$in': similar_profile_ids},
        'opportunityId': opportunity_id,
    })

    # Normalize: more applications from similar users = higher score
    score = min(applications * 20, 100)
    return score


@app.route('/api/match/score', methods=['POST'])
def compute_match_score():
    """
    Compute match score between a worker profile and an opportunity.
    Implements Algorithm 5.4 from SDD.
    """
    try:
        data = request.json
        from bson import ObjectId
        profile_id = ObjectId(data['profileId'])
        opportunity_id = ObjectId(data['opportunityId'])

        opportunity = db.opportunities.find_one({'_id': opportunity_id})
        if not opportunity:
            return jsonify({'error': 'Opportunity not found'}), 404

        # Step 2: Skill similarity (cosine)
        worker_skills = get_profile_skill_vector(profile_id)
        opp_skills = get_opportunity_skill_vector(opportunity_id)
        skill_score = compute_cosine_similarity(worker_skills, opp_skills) * 100

        # Step 3: Experience relevance
        exp_score = compute_experience_score(profile_id, opportunity.get('category', ''))

        # Step 4: Collaborative filtering
        collab_score = compute_collaborative_score(profile_id, opportunity_id)

        # Step 5: Weighted combination (0.5 skill + 0.25 exp + 0.25 collab)
        match_score = round((0.5 * skill_score) + (0.25 * exp_score) + (0.25 * collab_score), 1)

        # Identify skill gaps
        missing_skills = [s for s in opp_skills if s not in worker_skills]

        return jsonify({
            'matchScore': match_score,
            'breakdown': {
                'skillScore': round(skill_score, 1),
                'experienceScore': round(exp_score, 1),
                'collaborativeScore': round(collab_score, 1),
            },
            'missingSkills': missing_skills,
        })
    except Exception as e:
        logger.error(f"Match score error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/match/recommendations/<user_id>', methods=['GET'])
def get_recommendations(user_id):
    """Get ranked opportunity recommendations for a worker."""
    try:
        from bson import ObjectId
        profile = db.profiles.find_one({'userId': ObjectId(user_id)})
        if not profile:
            return jsonify({'recommendations': []})

        # Get all published opportunities
        opportunities = list(db.opportunities.find({
            'status': 'published',
            'deadline': {'$gte': __import__('datetime').datetime.utcnow()},
        }).limit(100))

        results = []
        worker_skills = get_profile_skill_vector(profile['_id'])

        for opp in opportunities:
            opp_skills = get_opportunity_skill_vector(opp['_id'])
            skill_score = compute_cosine_similarity(worker_skills, opp_skills) * 100
            exp_score = compute_experience_score(profile['_id'], opp.get('category', ''))
            match_score = round((0.5 * skill_score) + (0.25 * exp_score) + (0.25 * 0), 1)

            missing = [s for s in opp_skills if s not in worker_skills]

            results.append({
                'opportunityId': str(opp['_id']),
                'title': opp.get('title', ''),
                'matchScore': match_score,
                'missingSkills': missing,
            })

        results.sort(key=lambda x: x['matchScore'], reverse=True)
        return jsonify({'recommendations': results[:20]})
    except Exception as e:
        logger.error(f"Recommendations error: {e}")
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
    """Find matching candidates for a newly posted opportunity."""
    try:
        from bson import ObjectId
        data = request.json
        opportunity_id = ObjectId(data['opportunityId'])
        # This could trigger notifications to top-matched workers
        return jsonify({'status': 'matching_triggered', 'opportunityId': str(opportunity_id)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'matching-engine'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
