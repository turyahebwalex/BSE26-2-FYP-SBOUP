"""
10 Direct Test Cases for Fraud Detection
=========================================
Covers all fields used in your application's postings, with both legitimate and fraudulent scenarios.

Run with:
    cd ai-services/fraud-detection
    . .venv/bin/activate
    python scripts/ui_test_cases.py
"""

import sys
import os
os.environ['MONGODB_URI'] = 'mongodb://localhost:27017/sboup_dev'
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app, _score_payload


def run_test(test_name, payload):
    """Run a single test and print results."""
    result = _score_payload(payload, persist_log=False)
    
    print(f"\n{'='*70}")
    print(f"TEST: {test_name}")
    print(f"{'='*70}")
    print(f"  Fraud Score:    {result['fraudScore']}")
    print(f"  Classification: {result['classification']}")
    print(f"  Decision:       {result['decisionOutcome']}")
    print(f"  Model Ready:    {result['modelReady']}")
    
    signals = result.get('signals') or result.get('flags') or []
    if signals:
        print(f"  Key Signals:")
        for i, s in enumerate(signals[:3], 1):
            print(f"    {i}. {s.get('signal', str(s))}")
    
    return result


def main():
    """Run all 10 test cases."""
    tests = [
        # --- Legitimate Cases (should be Published/Low Risk) ---
        {
            "name": "1. Legit - Formal Carpenter Job",
            "payload": {
                "opportunityId": "ui-test-001",
                "title": "Carpenter – Furniture Workshop",
                "description": (
                    "Namulanda Furniture Ltd is seeking a skilled carpenter to join our workshop in Kampala. "
                    "The role involves crafting custom wooden furniture, reading technical drawings, and finishing surfaces to a high standard. "
                    "We offer a structured work environment with regular hours and opportunity for skills growth within the company."
                ),
                "requirements": (
                    "Minimum 2 years of hands-on carpentry experience. "
                    "Ability to read technical drawings. Attention to detail and quality finish."
                ),
                "benefits": "Monthly salary, transport allowance, on-the-job training.",
                "location": "Kampala, Uganda",
                "category": "formal",
                "employmentType": "full_time",
                "experienceLevel": "mid",
                "isRemote": False,
                "applicationMethod": "internal",
                "compensationRange": {"min": 600000, "max": 900000, "currency": "UGX"},
                "deadline": "2026-08-01T00:00:00Z",
            }
        },
        {
            "name": "2. Legit - NGO Admin Assistant",
            "payload": {
                "opportunityId": "ui-test-002",
                "title": "Administrative Assistant",
                "description": (
                    "BRAC Uganda is recruiting an Administrative Assistant to support program operations in our Gulu district office. "
                    "Responsibilities include managing office correspondence, scheduling meetings, maintaining filing systems, and providing general admin support."
                ),
                "requirements": (
                    "Diploma in Business Administration or related field. Proficiency in Microsoft Office (Word, Excel). Strong organizational and communication skills."
                ),
                "benefits": "Competitive salary, health insurance, annual leave.",
                "location": "Gulu, Uganda",
                "category": "formal",
                "employmentType": "full_time",
                "experienceLevel": "entry",
                "isRemote": False,
                "applicationMethod": "internal",
                "compensationRange": {"min": 700000, "max": 1000000, "currency": "UGX"},
            }
        },
        {
            "name": "3. Legit - Freelance Web Developer",
            "payload": {
                "opportunityId": "ui-test-003",
                "title": "Freelance Web Developer – E-Commerce Site",
                "description": (
                    "Crane Industries is looking for a freelance web developer to build a WooCommerce-based e-commerce site. "
                    "Project scope includes custom theme development, product catalog integration, payment gateway setup, and basic SEO."
                ),
                "requirements": (
                    "Proven experience with WordPress and WooCommerce. Familiarity with PHP, HTML5, CSS3, JavaScript. Portfolio of completed e-commerce projects."
                ),
                "benefits": "Fixed project fee paid in two milestones: 50% upfront, 50% on delivery.",
                "location": "Remote (Uganda)",
                "category": "freelance",
                "employmentType": "contract",
                "experienceLevel": "mid",
                "isRemote": True,
                "applicationMethod": "internal",
                "compensationRange": {"min": 1500000, "max": 2500000, "currency": "UGX"},
            }
        },
        {
            "name": "4. Legit - Plumbing Apprenticeship",
            "payload": {
                "opportunityId": "ui-test-004",
                "title": "Plumbing Apprentice",
                "description": (
                    "Nile Technical Services is offering a 12-month paid apprenticeship for aspiring plumbers. "
                    "You will work alongside certified master plumbers on residential and commercial installations, learning pipe fitting and drainage systems."
                ),
                "requirements": (
                    "Certificate in plumbing or related trade from a recognized TVET institution. Physically fit and able to work on construction sites."
                ),
                "benefits": "Monthly stipend, PPE provided, skills certification.",
                "location": "Jinja, Uganda",
                "category": "apprenticeship",
                "employmentType": "apprenticeship",
                "experienceLevel": "entry",
                "isRemote": False,
                "applicationMethod": "internal",
                "compensationRange": {"min": 400000, "max": 500000, "currency": "UGX"},
            }
        },
        
        # --- Fraudulent Cases (should be Blocked/High Risk) ---
        {
            "name": "5. Fraud - Advance Fee Scam (Airtel Money)",
            "payload": {
                "opportunityId": "ui-test-005",
                "title": "URGENT HIRING: Remote Data Entry - 5M/month!",
                "description": (
                    "GET RICH QUICK!!! Work from home and earn BIG MONEY daily! No experience needed! "
                    "Just send your CV and registration fee of UGX 50,000 via Airtel Money or Western Union to activate your account today! "
                    "WhatsApp us at +256700000000 or email moneyjobs254@gmail.com! Limited slots ACT NOW!!!"
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
        },
        {
            "name": "6. Fraud - Unrealistic High Pay with .xyz Domain",
            "payload": {
                "opportunityId": "ui-test-006",
                "title": "Online Assistant - 20M/Month",
                "description": (
                    "Work from home as an online assistant and earn up to UGX 20 million per month! "
                    "Full training provided, no experience needed! Click here to apply: http://quickcash.xyz/signup! "
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
        },
        {
            "name": "7. Fraud - Very Short Post with WhatsApp",
            "payload": {
                "opportunityId": "ui-test-007",
                "title": "High Pay Work",
                "description": "Earn 8M/month WhatsApp +256771234567",
                "location": "Kampala",
                "category": "formal",
                "employmentType": "full_time",
                "experienceLevel": "entry",
                "isRemote": True,
                "applicationMethod": "external",
                "compensationRange": {"min": 7000000, "max": 9000000, "currency": "UGX"},
            }
        },
        {
            "name": "8. Fraud - Investment/Business Partner Scam",
            "payload": {
                "opportunityId": "ui-test-008",
                "title": "Business Partner Needed - Unlimited Income!",
                "description": (
                    "Become our business partner and earn unlimited commissions! "
                    "Start your own e-commerce business with our proven platform! "
                    "Small investment of UGX 200,000 required to get started! "
                    "Team bonuses and high commission structure! Be your own boss! Contact Telegram: @bizpartner256"
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
        },
        
        # --- Medium Risk Cases (should be Under Review) ---
        {
            "name": "9. Medium - Processing Fee + External Link",
            "payload": {
                "opportunityId": "ui-test-009",
                "title": "Customer Service Representative",
                "description": (
                    "Customer service role with great pay! Apply at http://jobs.top/csr2025. "
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
        },
        {
            "name": "10. Medium - MLM-style with Keywords",
            "payload": {
                "opportunityId": "ui-test-010",
                "title": "Sales Representative - High Commission",
                "description": (
                    "We are looking for motivated individuals to join our growing team. "
                    "High commission structure with team bonuses. Flexible hours with high pay. "
                    "Full training provided. No specific experience required. Self motivated individuals preferred!"
                ),
                "location": "Remote, Uganda",
                "category": "freelance",
                "employmentType": "contract",
                "experienceLevel": "any",
                "isRemote": True,
                "applicationMethod": "external",
                "compensationRange": {"min": 2000000, "max": 8000000, "currency": "UGX"},
            }
        }
    ]
    
    print("\n" + "="*70)
    print("10 DIRECT TEST CASES FOR FRAUD DETECTION")
    print("="*70)
    
    results = []
    for test in tests:
        results.append(run_test(test["name"], test["payload"]))
    
    print("\n" + "="*70)
    print("SUMMARY OF ALL TESTS")
    print("="*70)
    for i, (test, res) in enumerate(zip(tests, results), 1):
        status = "✅" if (
            (i <= 4 and res['fraudScore'] < 30) or
            (5 <= i <= 8 and res['fraudScore'] >= 70)
        ) else "⚠️"
        print(f"  {status} {test['name']:60} {res['fraudScore']:3} - {res['decisionOutcome']}")


if __name__ == "__main__":
    main()
