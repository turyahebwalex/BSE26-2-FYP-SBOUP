"""
Fraud Detection — Fraudulent Posting Tests
===========================================
5 real-world style job postings that should be scored HIGH RISK (> 70)
and blocked by the workflow engine, plus some medium-risk cases.

Run with:
    cd ai-services/fraud-detection
    .venv/bin/pytest tests/test_fraud_postings.py -v
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


# ── Test 1: Advance Fee Scam (High Risk ────────────────────────────────────────

def test_fraud_01_advance_fee_scam(client):
    """
    Classic advance fee scam with urgent hiring scam asking for upfront fees,
    payment processing fees, or registration fees to get a high-pay job.
    Should score > 70 and get blocked.
    """
    payload = {
        "opportunityId": "test-fraud-001",
        "title": "URGENT HIRING: Remote Data Entry - Earn UGX 5,000,000/month!",
        "description": (
            "GET RICH QUICK!!! Work from home and earn BIG MONEY daily! "
            "No experience needed! Just send your CV and registration fee of UGX 50,000 to activate your account. "
            "Contact us on WhatsApp +256700000000 or email moneyjobs254@gmail.com. "
            "Limited slots available ACT NOW!!! Send money via Western Union or Airtel Money to process your application today!"
        ),
        "location": "Kampala, Uganda",
        "category": "freelance",
        "employmentType": "contract",
        "experienceLevel": "entry",
        "isRemote": True,
        "applicationMethod": "external",
        "externalLink": "http://moneyjobs254.gmail.com",
        "compensationRange": {"min": 5000000, "max": 10000000, "currency": "UGX"},
    }

    result = detect(client, payload)
    print_result("Advance Fee Scam", result)

    assert result['fraudScore'] >= 70, (
        f"Expected high-risk score (>=70) for advance fee scam, "
        f"got {result['fraudScore']}"
    )
    assert result['decisionOutcome'] == 'blocked', (
        f"Expected blocked decision, got '{result['decisionOutcome']}'"
    )
    assert result['classification'] == 'High Risk'


# ── Test 2: Unrealistic High Pay with External Link (High Risk) ───────────────────────

def test_fraud_02_unrealistic_pay_external(client):
    """
    Extremely high salary for entry-level role with suspicious external domain and
    suspicious TLD domain.
    """
    payload = {
        "opportunityId": "test-fraud-002",
        "title": "Online Assistant - Earn UGX 20,000,000/Month",
        "description": (
            "Work from home as an online assistant and earn up to UGX 20 million per month! "
            "Full training provided, no experience needed! "
            "Click here to apply: http://quickcash.xyz/signup "
            "Guaranteed income from day one! Be your own boss with flexible hours!"
        ),
        "location": "Remote, Uganda",
        "category": "freelance",
        "employmentType": "contract",
        "experienceLevel": "any",
        "isRemote": True,
        "applicationMethod": "external",
        "externalLink": "http://quickcash.xyz",
        "compensationRange": {"min": 15000000, "max": 25000000, "currency": "UGX"},
    }

    result = detect(client, payload)
    print_result("Unrealistic High Pay", result)

    assert result['fraudScore'] >= 70, (
        f"Expected high-risk score for unrealistic high pay, got {result['fraudScore']}"
    )
    assert result['decisionOutcome'] == 'blocked'
    assert result['classification'] == 'High Risk'


# ── Test 3: Very Short Posting with High Pay and WhatsApp Contact (High Risk) ───────────

def test_fraud_03_short_post_high_pay_whatsapp(client):
    """
    Very short posting with extremely high pay and direct contact info.
    """
    payload = {
        "opportunityId": "test-fraud-003",
        "title": "High Pay Work",
        "description": (
            "Earn UGX 8M/month WhatsApp +256771234567"
        ),
        "location": "Kampala",
        "category": "formal",
        "employmentType": "full_time",
        "experienceLevel": "entry",
        "isRemote": True,
        "applicationMethod": "external",
        "compensationRange": {"min": 7000000, "max": 9000000, "currency": "UGX"},
    }

    result = detect(client, payload)
    print_result("Short Post with High Pay", result)

    assert result['fraudScore'] >= 70, (
        f"Expected high-risk score for short high-pay posting got {result['fraudScore']}"
    )
    assert result['decisionOutcome'] == 'blocked'
    assert result['classification'] == 'High Risk'


# ── Test 4: Investment/Business Partner Scam (High Risk) ──────────────────────────

def test_fraud_04_investment_business_partner(client):
    """
    Scam asking for investment or business partner with upfront fees.
    """
    payload = {
        "opportunityId": "test-fraud-004",
        "title": "Business Partner Needed - Earn Unlimited Income!",
        "description": (
            "Become our business partner and earn unlimited commissions! "
            "Start your own e-commerce business with our proven platform! "
            "Small investment of UGX 200,000 required to get started. "
            "Team bonuses and high commission structure. Work from home, be your own boss! "
            "Contact Telegram: @bizpartner256"
        ),
        "location": "Remote, Uganda",
        "category": "freelance",
        "employmentType": "contract",
        "experienceLevel": "any",
        "isRemote": True,
        "applicationMethod": "external",
        "externalLink": "https://t.me/bizpartner256",
        "compensationRange": {"min": 3000000, "max": 10000000, "currency": "UGX"},
    }

    result = detect(client, payload)
    print_result("Investment/Business Partner", result)

    assert result['fraudScore'] >= 70, (
        f"Expected high-risk score for investment scam got {result['fraudScore']}"
    )
    assert result['decisionOutcome'] == 'blocked'
    assert result['classification'] == 'High Risk'


# ── Test 5: Processing Fee + Direct Contact (Medium Risk) ────────────────────

def test_fraud_05_processing_fee_medium(client):
    """
    Posting with processing fee, direct contact info, and external link -
    should score medium risk and go under review.
    """
    payload = {
        "opportunityId": "test-fraud-005",
        "title": "Customer Service Representative",
        "description": (
            "Customer service role with great pay! "
            "Apply at http://jobs.top/csr2025 "
            "Processing fee of UGX 30,000 required for background check and training materials. "
            "Email us at csr@jobs.top or call +256789123456"
        ),
        "location": "Kampala, Uganda",
        "category": "formal",
        "employmentType": "full_time",
        "experienceLevel": "entry",
        "isRemote": False,
        "applicationMethod": "external",
        "externalLink": "http://jobs.top/csr2025",
        "compensationRange": {"min": 800000, "max": 1200000, "currency": "UGX"},
    }

    result = detect(client, payload)
    print_result("Processing Fee Medium Risk", result)

    assert result['fraudScore'] >= 30, (
        f"Expected medium/high-risk score for processing fee posting got {result['fraudScore']}"
    )
    assert result['classification'] in ('Medium Risk', 'High Risk')
