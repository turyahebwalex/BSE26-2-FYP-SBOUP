"""
SBOUP Learning Engine Microservice
Skill gap analysis and adaptive learning path generation.
Algorithm from SDD Section 5.3 (GenerateLearningPath)
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from bson import ObjectId
import os
import logging
from datetime import datetime

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/sboup_dev')
client = MongoClient(MONGODB_URI)
db = client.get_default_database() if 'sboup' in MONGODB_URI else client['sboup_dev']

# Curated free learning resource database (MVP fallback when YouTube API unavailable)
LEARNING_RESOURCES = {
    'JavaScript': [
        {'title': 'JavaScript Full Course for Beginners', 'url': 'https://youtube.com/watch?v=PkZNo7MFNFg', 'provider': 'YouTube', 'cost': 0, 'estimatedDuration': '3h', 'type': 'video'},
        {'title': 'JavaScript Algorithms and Data Structures', 'url': 'https://freecodecamp.org/learn/javascript-algorithms-and-data-structures/', 'provider': 'freeCodeCamp', 'cost': 0, 'estimatedDuration': '300h', 'type': 'course'},
    ],
    'Python': [
        {'title': 'Python for Everybody', 'url': 'https://coursera.org/specializations/python', 'provider': 'Coursera', 'cost': 0, 'estimatedDuration': '80h', 'type': 'course'},
        {'title': 'Automate the Boring Stuff with Python', 'url': 'https://automatetheboringstuff.com/', 'provider': 'Online Book', 'cost': 0, 'estimatedDuration': '40h', 'type': 'tutorial'},
    ],
    'React': [
        {'title': 'React Official Tutorial', 'url': 'https://react.dev/learn', 'provider': 'React.dev', 'cost': 0, 'estimatedDuration': '10h', 'type': 'tutorial'},
    ],
    'default': [
        {'title': 'Search for free courses', 'url': 'https://www.coursera.org/search?query={skill}', 'provider': 'Coursera', 'cost': 0, 'estimatedDuration': 'Varies', 'type': 'course'},
        {'title': 'YouTube tutorials', 'url': 'https://youtube.com/results?search_query={skill}+tutorial', 'provider': 'YouTube', 'cost': 0, 'estimatedDuration': 'Varies', 'type': 'video'},
    ],
}


def identify_skill_gaps(profile_id, opportunity_id):
    """Compare worker skills against opportunity requirements."""
    pid = ObjectId(profile_id)
    oid = ObjectId(opportunity_id)

    worker_skill_ids = [
        ps['skillId'] for ps in db.profileskills.find({'profileId': pid})
    ]
    worker_skill_names = set()
    for sid in worker_skill_ids:
        skill = db.skills.find_one({'_id': sid})
        if skill:
            worker_skill_names.add(skill['skillName'])

    opportunity = db.opportunities.find_one({'_id': oid})
    if not opportunity:
        return []

    required_skill_names = set()
    for sid in opportunity.get('requiredSkills', []):
        skill = db.skills.find_one({'_id': sid})
        if skill:
            required_skill_names.add(skill['skillName'])

    return list(required_skill_names - worker_skill_names)


def get_resources_for_skill(skill_name):
    """Retrieve learning resources for a specific skill."""
    resources = LEARNING_RESOURCES.get(skill_name, LEARNING_RESOURCES['default'])
    # Replace {skill} placeholder in default resources
    return [
        {**r, 'url': r['url'].format(skill=skill_name)} for r in resources
    ]


@app.route('/api/learning/generate', methods=['POST'])
def generate_learning_path():
    """Generate personalized learning path for skill gaps."""
    try:
        data = request.json
        user_id = data.get('userId')
        target_skill = data.get('targetSkill')
        opportunity_id = data.get('opportunityId')

        resources = []

        if opportunity_id:
            profile = db.profiles.find_one({'userId': ObjectId(user_id)})
            if profile:
                missing_skills = identify_skill_gaps(str(profile['_id']), opportunity_id)
                for skill in missing_skills[:5]:
                    skill_resources = get_resources_for_skill(skill)[:3]
                    resources.extend(skill_resources)
        elif target_skill:
            resources = get_resources_for_skill(target_skill)[:3]

        return jsonify({
            'resources': resources,
            'targetSkill': target_skill or 'Multiple',
        })
    except Exception as e:
        logger.error(f"Learning path error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/learning/skill-gaps', methods=['POST'])
def analyze_skill_gaps():
    """Analyze skill gaps for a specific opportunity."""
    try:
        data = request.json
        profile_id = data.get('profileId')
        opportunity_id = data.get('opportunityId')

        if not profile_id or not opportunity_id:
            return jsonify({'error': 'profileId and opportunityId required'}), 400

        gaps = identify_skill_gaps(profile_id, opportunity_id)
        return jsonify({'missingSkills': gaps, 'count': len(gaps)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'learning-engine'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5004, debug=True)
