"""
Fraud Detection — Legitimate Posting Tests
==========================================
5 real-world style job postings that should be scored LOW RISK (< 30)
and auto-approved by the workflow engine.

Run with:
    cd ai-services/fraud-detection
    .venv/bin/pytest tests/test_legit_postings.py -v
"""
import pytest
from app.main import app


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


# ── Helper ──────────────────────────────────────────────────────────────────

def detect(client, payload):
    """POST to /api/detect and return the parsed JSON response."""
    res = client.post('/api/detect', json=payload)
    assert res.status_code == 200, f"Unexpected status {res.status_code}: {res.data}"
    return res.get_json()


def print_result(label, result):
    """Pretty-print key fields so the test output is readable."""
    print(f"\n{'─'*60}")
    print(f"  Test     : {label}")
    print(f"  Score    : {result['fraudScore']}")
    print(f"  Risk     : {result['classification']}")
    print(f"  Decision : {result['decisionOutcome']}")
    xai = result.get('xaiExplanation') or {}
    rationale = xai.get('plain_english_rationale', result.get('explanation', '—'))
    print(f"  XAI      : {rationale}")
    print(f"{'─'*60}")


# ── Test 1: Formal carpentry job in Kampala ──────────────────────────────────

def test_legit_01_carpenter_kampala(client):
    """
    A well-formed formal carpentry vacancy with salary, location, and
    clear requirements. Should score below 30 and be auto-published.
    """
    payload = {
        "opportunityId": "test-legit-001",
        "title": "Carpenter – Furniture Workshop",
        "description": (
            "Namulanda Furniture Ltd is seeking a skilled carpenter to join our "
            "workshop in Kampala. The role involves crafting custom wooden furniture, "
            "reading technical drawings, and finishing surfaces to a high standard. "
            "We offer a structured work environment with regular hours, a monthly "
            "salary, and opportunity for skills growth within the company."
        ),
        "requirements": (
            "Minimum 2 years of hands-on carpentry experience. "
            "Ability to read technical drawings. "
            "Attention to detail and quality finish. "
            "Certificate in carpentry or equivalent vocational training preferred."
        ),
        "benefits": "Monthly salary, transport allowance, and on-the-job training.",
        "location": "Kampala, Uganda",
        "category": "formal",
        "employmentType": "full_time",
        "experienceLevel": "mid",
        "isRemote": False,
        "applicationMethod": "internal",
        "compensationRange": {"min": 600000, "max": 900000, "currency": "UGX"},
        "deadline": "2026-08-01T00:00:00Z",
    }

    result = detect(client, payload)
    print_result("Carpenter – Kampala", result)

    assert result['fraudScore'] < 30, (
        f"Expected low-risk score (<30) for a legitimate carpentry job, "
        f"got {result['fraudScore']}"
    )
    assert result['decisionOutcome'] == 'published', (
        f"Expected auto-published decision, got '{result['decisionOutcome']}'"
    )
    assert result['classification'] == 'Low Risk'


# ── Test 2: Administrative assistant at an NGO ───────────────────────────────

def test_legit_02_admin_assistant_ngo(client):
    """
    An administrative assistant role at a registered NGO in Gulu.
    Complete posting: description, requirements, salary, location.
    """
    payload = {
        "opportunityId": "test-legit-002",
        "title": "Administrative Assistant",
        "description": (
            "BRAC Uganda is recruiting an Administrative Assistant to support "
            "programme operations in our Gulu district office. Responsibilities "
            "include managing office correspondence, scheduling meetings, "
            "maintaining filing systems, and providing general administrative "
            "support to programme staff. This is a full-time position based "
            "at our Gulu office."
        ),
        "requirements": (
            "Diploma or degree in Business Administration, Secretarial Studies, "
            "or a related field. Proficient in Microsoft Office (Word, Excel, "
            "Outlook). Strong organisational and communication skills. "
            "At least 1 year of relevant administrative experience."
        ),
        "benefits": "Competitive salary, health insurance, and annual leave.",
        "location": "Gulu, Uganda",
        "category": "formal",
        "employmentType": "full_time",
        "experienceLevel": "entry",
        "isRemote": False,
        "applicationMethod": "internal",
        "compensationRange": {"min": 700000, "max": 1000000, "currency": "UGX"},
        "deadline": "2026-07-20T00:00:00Z",
    }

    result = detect(client, payload)
    print_result("Administrative Assistant – NGO Gulu", result)

    assert result['fraudScore'] < 30, (
        f"Expected low-risk score for a legitimate NGO admin role, "
        f"got {result['fraudScore']}"
    )
    assert result['decisionOutcome'] == 'published'
    assert result['classification'] == 'Low Risk'


# ── Test 3: Freelance web developer contract ─────────────────────────────────

def test_legit_03_freelance_web_developer(client):
    """
    A short-term freelance contract for a web developer. Clearly scoped
    project, realistic pay, no off-platform contact requests.
    """
    payload = {
        "opportunityId": "test-legit-003",
        "title": "Freelance Web Developer – E-Commerce Site",
        "description": (
            "Crane Industries is looking for a freelance web developer to build "
            "a WooCommerce-based e-commerce site for our retail business. The "
            "project scope includes custom theme development, product catalogue "
            "integration, payment gateway setup (MTN MoMo), and basic SEO "
            "configuration. Estimated delivery: 6 weeks. All deliverables and "
            "payment milestones are agreed upfront in a signed contract."
        ),
        "requirements": (
            "Proven experience with WordPress and WooCommerce. "
            "Familiarity with PHP, HTML5, CSS3, and JavaScript. "
            "Portfolio of at least 2 completed e-commerce projects. "
            "Ability to meet agreed milestones and communicate progress weekly."
        ),
        "benefits": "Fixed project fee paid in two milestones: 50% upfront, 50% on delivery.",
        "location": "Remote (Uganda)",
        "category": "freelance",
        "employmentType": "contract",
        "experienceLevel": "mid",
        "isRemote": True,
        "applicationMethod": "internal",
        "compensationRange": {"min": 1500000, "max": 2500000, "currency": "UGX"},
        "deadline": "2026-07-15T00:00:00Z",
    }

    result = detect(client, payload)
    print_result("Freelance Web Developer – E-Commerce", result)

    assert result['fraudScore'] < 30, (
        f"Expected low-risk score for a legitimate freelance dev contract, "
        f"got {result['fraudScore']}"
    )
    assert result['decisionOutcome'] == 'published'
    assert result['classification'] == 'Low Risk'


# ── Test 4: Plumbing apprenticeship ─────────────────────────────────────────

def test_legit_04_plumbing_apprenticeship(client):
    """
    A structured apprenticeship in plumbing for recent vocational graduates.
    Entry-level, well-described, realistic stipend.
    """
    payload = {
        "opportunityId": "test-legit-004",
        "title": "Plumbing Apprentice",
        "description": (
            "Nile Technical Services is offering a 12-month paid apprenticeship "
            "for aspiring plumbers. You will work alongside our certified master "
            "plumbers on residential and commercial installations, learning pipe "
            "fitting, drainage systems, and safety protocols. A structured "
            "mentorship programme is in place, with formal assessment at 6 and "
            "12 months. Successful apprentices may be offered a full-time position."
        ),
        "requirements": (
            "Certificate in plumbing or related trade from a recognised TVET "
            "institution. Physically fit and able to work on construction sites. "
            "Willingness to learn and follow instructions. "
            "No prior work experience required — this is an apprenticeship."
        ),
        "benefits": "Monthly stipend of UGX 450,000, PPE provided, and skills certification.",
        "location": "Jinja, Uganda",
        "category": "apprenticeship",
        "employmentType": "apprenticeship",
        "experienceLevel": "entry",
        "isRemote": False,
        "applicationMethod": "internal",
        "compensationRange": {"min": 400000, "max": 500000, "currency": "UGX"},
        "deadline": "2026-08-10T00:00:00Z",
    }

    result = detect(client, payload)
    print_result("Plumbing Apprenticeship – Jinja", result)

    assert result['fraudScore'] < 30, (
        f"Expected low-risk score for a genuine apprenticeship, "
        f"got {result['fraudScore']}"
    )
    assert result['decisionOutcome'] == 'published'
    assert result['classification'] == 'Low Risk'


# ── Test 5: Secondary school teacher (contract) ──────────────────────────────

def test_legit_05_secondary_school_teacher(client):
    """
    A contract teaching position at a registered secondary school.
    Full posting with subjects, location, qualifications, and salary.
    """
    payload = {
        "opportunityId": "test-legit-005",
        "title": "Secondary School Teacher – Mathematics & Physics",
        "description": (
            "St. Mary's College Kisubi is seeking a qualified teacher of "
            "Mathematics and Physics for Senior 1–6. The successful candidate "
            "will prepare lesson plans aligned with the Uganda National "
            "Curriculum, conduct classes, set and mark examinations, and "
            "participate in the school's co-curricular programme. "
            "The position is available for the academic year starting January 2027, "
            "with the possibility of renewal based on performance."
        ),
        "requirements": (
            "Bachelor of Education (Science) or Bachelor of Science with a "
            "Postgraduate Diploma in Education. "
            "Registered with the Uganda National Teachers College. "
            "Minimum 2 years of classroom teaching experience. "
            "Strong subject knowledge in Mathematics and Physics up to A-Level."
        ),
        "benefits": (
            "Monthly salary, staff housing or housing allowance, "
            "medical cover, and annual performance bonus."
        ),
        "location": "Entebbe, Uganda",
        "category": "formal",
        "employmentType": "contract",
        "experienceLevel": "mid",
        "isRemote": False,
        "applicationMethod": "internal",
        "compensationRange": {"min": 1200000, "max": 1800000, "currency": "UGX"},
        "deadline": "2026-09-30T00:00:00Z",
    }

    result = detect(client, payload)
    print_result("Secondary School Teacher – Entebbe", result)

    assert result['fraudScore'] < 30, (
        f"Expected low-risk score for a legitimate teaching vacancy, "
        f"got {result['fraudScore']}"
    )
    assert result['decisionOutcome'] == 'published'
    assert result['classification'] == 'Low Risk'
