"""
SBOUP CV Generation Microservice
AI-powered CV generation from worker profiles.
Algorithm from SDD Section 5.2 (GenerateCV)
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from bson import ObjectId
import os
import logging
from datetime import datetime
import json

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/sboup_dev')
client = MongoClient(MONGODB_URI)
db = client.get_default_database() if 'sboup' in MONGODB_URI else client['sboup_dev']


def fetch_profile_data(profile_id):
    """Gather all profile data for CV generation."""
    pid = ObjectId(profile_id)
    profile = db.profiles.find_one({'_id': pid})
    if not profile:
        return None

    user = db.users.find_one({'_id': profile['userId']})
    skills = list(db.profileskills.aggregate([
        {'$match': {'profileId': pid}},
        {'$lookup': {'from': 'skills', 'localField': 'skillId', 'foreignField': '_id', 'as': 'skill'}},
        {'$unwind': '$skill'},
    ]))
    experiences = list(db.experiences.find({'profileId': pid}).sort('startDate', -1))
    education = list(db.educations.find({'profileId': pid}).sort('startYear', -1))
    preference = db.preferences.find_one({'profileId': pid})

    return {
        'user': user,
        'profile': profile,
        'skills': skills,
        'experiences': experiences,
        'education': education,
        'preference': preference,
    }


def generate_cv_content(data, template_type, selected_data=None):
    """Generate structured CV content from profile data."""
    user = data['user']
    profile = data['profile']
    skills = data['skills']
    experiences = data['experiences']
    education = data['education']

    sections = []

    # Header
    sections.append({
        'type': 'header',
        'name': user.get('fullName', ''),
        'title': profile.get('title', ''),
        'email': user.get('email', ''),
        'phone': user.get('phoneNumber', ''),
        'location': profile.get('location', ''),
    })

    # Professional Summary
    if profile.get('bio'):
        sections.append({'type': 'summary', 'content': profile['bio']})

    # Skills section
    if skills and (not selected_data or 'skills' in selected_data):
        primary = [s['skill']['skillName'] for s in skills if s.get('classification') == 'primary']
        secondary = [s['skill']['skillName'] for s in skills if s.get('classification') == 'secondary']
        sections.append({
            'type': 'skills',
            'primary': primary,
            'secondary': secondary,
        })

    # Work Experience
    if experiences and (not selected_data or 'experience' in selected_data):
        exp_items = []
        for exp in experiences:
            exp_items.append({
                'jobTitle': exp.get('jobTitle', ''),
                'company': exp.get('companyName', ''),
                'duration': f"{exp.get('durationMonths', 0)} months",
                'description': exp.get('description', ''),
            })
        sections.append({'type': 'experience', 'items': exp_items})

    # Education
    if education and (not selected_data or 'education' in selected_data):
        edu_items = []
        for edu in education:
            edu_items.append({
                'institution': edu.get('institution', ''),
                'qualification': edu.get('qualification', ''),
                'field': edu.get('fieldOfStudy', ''),
                'year': f"{edu.get('startYear', '')} - {edu.get('endYear', 'Present')}",
            })
        sections.append({'type': 'education', 'items': edu_items})

    return {
        'templateType': template_type,
        'sections': sections,
        'generatedAt': datetime.utcnow().isoformat(),
    }


@app.route('/api/cv/generate', methods=['POST'])
def generate_cv():
    """Generate a CV for a worker profile."""
    try:
        data = request.json
        profile_id = data.get('profileId')
        template_type = data.get('templateType', 'chronological')
        selected_data = data.get('selectedData')

        if not profile_id:
            return jsonify({'error': 'Profile ID required'}), 400

        profile_data = fetch_profile_data(profile_id)
        if not profile_data:
            return jsonify({'error': 'Profile not found'}), 404

        cv_content = generate_cv_content(profile_data, template_type, selected_data)

        # In production, this would generate a PDF/DOCX and upload to S3
        # For MVP, return structured content and a placeholder URL
        file_url = f"/api/cv/files/{profile_id}_{template_type}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.pdf"

        logger.info(f"CV generated for profile {profile_id}")

        return jsonify({
            'fileUrl': file_url,
            'content': cv_content,
        })
    except Exception as e:
        logger.error(f"CV generation error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'cv-generation'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5003, debug=True)
