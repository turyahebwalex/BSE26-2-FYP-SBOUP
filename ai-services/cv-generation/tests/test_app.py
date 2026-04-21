"""Smoke tests for the cv-generation service."""
import pytest
from app.main import app, generate_cv_content


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


def test_health(client):
    res = client.get('/api/health')
    assert res.status_code == 200
    assert res.get_json()['service'] == 'cv-generation'


def test_generate_requires_profile_id(client):
    res = client.post('/api/cv/generate', json={})
    assert res.status_code == 400


def test_generate_cv_content_builds_sections():
    data = {
        'user': {'fullName': 'Alex T', 'email': 'a@test.com', 'phoneNumber': '+256700000000'},
        'profile': {'title': 'Carpenter', 'location': 'Kampala', 'bio': 'Skilled carpenter.'},
        'skills': [
            {'skill': {'skillName': 'Carpentry'}, 'classification': 'primary'},
        ],
        'experiences': [
            {'jobTitle': 'Carpenter', 'companyName': 'ABC Ltd', 'durationMonths': 24, 'description': 'Built furniture.'},
        ],
        'education': [
            {'institution': 'Makerere', 'qualification': 'Diploma', 'fieldOfStudy': 'Woodwork', 'startYear': 2018, 'endYear': 2020},
        ],
        'preference': None,
    }
    cv = generate_cv_content(data, 'chronological')
    assert cv['templateType'] == 'chronological'
    section_types = [s['type'] for s in cv['sections']]
    assert 'header' in section_types
    assert 'skills' in section_types
    assert 'experience' in section_types
    assert 'education' in section_types
