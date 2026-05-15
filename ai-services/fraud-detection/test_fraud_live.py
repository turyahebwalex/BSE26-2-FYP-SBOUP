"""
Quick live test for the SBOUP Fraud Detection service.
Run with: .venv/bin/python test_fraud_live.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

# Suppress MongoDB connection warnings during test
os.environ.setdefault('MONGODB_URI', 'mongodb://localhost:27017/sboup_dev')

from app.main import app, MODEL_AVAILABLE, MODEL_VERSION, FRAUD_MODEL

print("=" * 60)
print("  SBOUP FRAUD DETECTION - LIVE TEST")
print("=" * 60)
print(f"  Model Available : {MODEL_AVAILABLE}")
print(f"  Model Version   : {MODEL_VERSION}")
print(f"  Model Loaded    : {FRAUD_MODEL is not None}")
print("=" * 60)

client = app.test_client()
PASS = "\033[92m✓ PASS\033[0m"
FAIL = "\033[91m✗ FAIL\033[0m"
all_passed = True

# ── Test 1: Health Check ──────────────────────────────────────────
print("\n[1] Health Check")
res = client.get('/api/health')
data = res.get_json()
ok = res.status_code == 200 and data.get('service') == 'fraud-detection'
print(f"    Status  : {res.status_code}")
print(f"    Service : {data.get('service')}")
print(f"    Result  : {PASS if ok else FAIL}")
all_passed = all_passed and ok

# ── Test 2: Model Stats ───────────────────────────────────────────
print("\n[2] Model Stats Endpoint")
res = client.get('/api/model/stats')
data = res.get_json()
ok = res.status_code == 200
print(f"    Status    : {res.status_code}")
print(f"    Available : {data.get('available')}")
print(f"    Accuracy  : {data.get('accuracy')}")
print(f"    F1        : {data.get('f1')}")
print(f"    Features  : {data.get('featureCount')}")
print(f"    Result    : {PASS if ok else FAIL}")
all_passed = all_passed and ok

# ── Test 3: Clean Legitimate Posting ─────────────────────────────
print("\n[3] Legitimate Job Posting (expect: Low Risk / published)")
legitimate = {
    'opportunityId': 'test-001',
    'title': 'Junior Carpenter',
    'description': (
        'We are hiring a skilled carpenter with 2 years of experience '
        'in Kampala. Must have basic woodworking tools. Competitive salary '
        'based on experience. Work Monday to Friday, 8am to 5pm.'
    ),
    'requirements': 'Woodworking, measurement, finishing, basic math',
    'location': 'Kampala, Uganda',
    'compensationRange': {'min': 500000, 'max': 900000},
    'isRemote': False,
    'category': 'construction',
    'experienceLevel': 'entry',
}
res = client.post('/api/detect', json=legitimate)
data = res.get_json()
score = data.get('fraudScore', -1)
decision = data.get('decisionOutcome', '')
ok = res.status_code == 200 and score < 30 and decision == 'published'
print(f"    Fraud Score : {score}")
print(f"    Risk Level  : {data.get('riskLevel')}")
print(f"    Decision    : {decision}")
print(f"    Model Used  : {data.get('modelReady')}")
print(f"    Result      : {PASS if ok else FAIL}  (expected score<30, decision=published)")
all_passed = all_passed and ok

# ── Test 4: Obvious Fraud Posting ────────────────────────────────
print("\n[4] Obvious Fraud Posting (expect: High Risk / blocked)")
fraudulent = {
    'opportunityId': 'test-002',
    'title': 'MAKE $5000 WEEKLY GUARANTEED!!!',
    'description': (
        'Work from home and earn guaranteed income! No experience needed! '
        'Send processing fee via wire transfer or Western Union to get started. '
        'Personal bank account details required. Advance fee of $200 needed. '
        'Upfront payment unlocks your earnings. Send money now!!!'
    ),
    'requirements': '',
    'location': 'Online',
    'compensationRange': {'min': 15000000, 'max': 25000000},
    'isRemote': True,
}
res = client.post('/api/detect', json=fraudulent)
data = res.get_json()
score = data.get('fraudScore', -1)
decision = data.get('decisionOutcome', '')
ok = res.status_code == 200 and score >= 70 and decision == 'blocked'
print(f"    Fraud Score : {score}")
print(f"    Risk Level  : {data.get('riskLevel')}")
print(f"    Decision    : {decision}")
flags = [f['signal'] for f in (data.get('flags') or [])[:4]]
print(f"    Top Flags   : {flags}")
print(f"    Result      : {PASS if ok else FAIL}  (expected score>=70, decision=blocked)")
all_passed = all_passed and ok

# ── Test 4b: XAI explainability payload ───────────────────────────
print("\n[4b] XAI / explainability fields on blocked posting")
xai = data.get('xaiExplanation') or {}
xai_ok = (
    isinstance(xai.get('plain_english_rationale'), str)
    and len(xai.get('plain_english_rationale', '')) > 10
    and xai.get('confidence_level') in ('low', 'medium', 'high')
    and isinstance(xai.get('quality_metrics'), dict)
    and isinstance(xai['quality_metrics'].get('completeness_checks'), dict)
    and isinstance(xai['quality_metrics'].get('employer_metrics'), dict)
)
print(f"    Rationale   : {(xai.get('plain_english_rationale') or '')[:80]}...")
print(f"    Confidence  : {xai.get('confidence_level')}")
print(f"    Result      : {PASS if xai_ok else FAIL}")
all_passed = all_passed and xai_ok

# ── Test 5: Medium Risk Posting ───────────────────────────────────
print("\n[5] Medium Risk Posting (expect: under_review)")
medium = {
    'opportunityId': 'test-003',
    'title': 'Quick Online Work — Good Pay',
    'description': (
        'Earn extra income from home! No prior experience required. '
        'Guaranteed pay for the right candidate. Apply now!'
    ),
    'requirements': '',
    'location': 'Remote',
    'compensationRange': {'min': 2000000, 'max': 4000000},
    'isRemote': True,
}
res = client.post('/api/detect', json=medium)
data = res.get_json()
score = data.get('fraudScore', -1)
decision = data.get('decisionOutcome', '')
ok = res.status_code == 200
print(f"    Fraud Score : {score}")
print(f"    Risk Level  : {data.get('riskLevel')}")
print(f"    Decision    : {decision}")
print(f"    Result      : {PASS if ok else FAIL}")
all_passed = all_passed and ok

# ── Test 6: Batch Endpoint ────────────────────────────────────────
print("\n[6] Batch Detection Endpoint (2 postings)")
batch_payload = {
    'opportunities': [
        {'opportunityId': 'batch-001', 'title': 'Plumber needed', 'description': 'Experienced plumber for residential work in Entebbe. 3 years experience required.', 'location': 'Entebbe'},
        {'opportunityId': 'batch-002', 'title': 'URGENT!!! EASY MONEY!!!', 'description': 'Send advance fee wire transfer western union processing fee upfront cost guaranteed income no experience!!!', 'location': 'Online'},
    ]
}
res = client.post('/api/detect/batch', json=batch_payload)
data = res.get_json()
ok = res.status_code == 200 and data.get('count') == 2
results = data.get('results', [])
print(f"    Status      : {res.status_code}")
print(f"    Count       : {data.get('count')}")
if results:
    print(f"    Posting 1   : score={results[0].get('fraudScore')} → {results[0].get('decisionOutcome')}")
    print(f"    Posting 2   : score={results[1].get('fraudScore')} → {results[1].get('decisionOutcome')}")
print(f"    Result      : {PASS if ok else FAIL}")
all_passed = all_passed and ok

# ── Extended Test Cases ──────────────────────────────────────────────
# 5 legitimate, 5 review, 5 blocked cases

print("\n" + "=" * 60)
print("  EXTENDED TEST CASES - 5 per scenario")
print("=" * 60)

# ── Legitimate Test Cases (expect: Low Risk / published) ────────
legitimate_cases = [
    {
        'opportunityId': 'legit-001',
        'title': 'Senior Accountant',
        'description': 'We are seeking a qualified accountant with 5+ years of experience in financial reporting and tax preparation. CPA certification required. Competitive salary and benefits package offered.',
        'requirements': 'CPA certification, 5+ years experience, proficiency in QuickBooks and Excel',
        'location': 'Kampala, Uganda',
        'compensationRange': {'min': 2500000, 'max': 4500000},
        'isRemote': False,
        'category': 'formal',
        'experienceLevel': 'senior',
    },
    {
        'opportunityId': 'legit-002',
        'title': 'Marketing Assistant',
        'description': 'Growing marketing agency looking for a creative marketing assistant to support our digital campaigns. Experience with social media management and content creation preferred.',
        'requirements': 'Social media experience, content writing skills, basic graphic design',
        'location': 'Entebbe, Uganda',
        'compensationRange': {'min': 800000, 'max': 1500000},
        'isRemote': False,
        'category': 'formal',
        'experienceLevel': 'entry',
    },
    {
        'opportunityId': 'legit-003',
        'title': 'Plumbing Contractor',
        'description': 'Licensed plumber needed for residential and commercial projects. Must have own tools and valid license. 3+ years experience required.',
        'requirements': 'Plumbing license, own tools, 3+ years experience',
        'location': 'Jinja, Uganda',
        'compensationRange': {'min': 1500000, 'max': 2800000},
        'isRemote': False,
        'category': 'contract',
        'experienceLevel': 'mid',
    },
    {
        'opportunityId': 'legit-004',
        'title': 'Freelance Content Writer',
        'description': 'Seeking experienced content writer for blog posts and website content. Topics include business, technology, and lifestyle. Payment per article.',
        'requirements': 'Excellent writing skills, SEO knowledge, meeting deadlines',
        'location': 'Remote',
        'compensationRange': {'min': 50000, 'max': 150000},
        'isRemote': True,
        'category': 'freelance',
        'experienceLevel': 'mid',
    },
    {
        'opportunityId': 'legit-005',
        'title': 'Receptionist',
        'description': 'We are hiring a receptionist to manage the front desk at our Kampala office. The role involves answering phone calls, welcoming visitors, scheduling appointments, and supporting the admin team. Professional communication and punctuality are required.',
        'requirements': 'Customer service skills, basic computer use, professional communication, punctuality',
        'location': 'Kampala, Uganda',
        'compensationRange': {'min': 900000, 'max': 1800000},
        'isRemote': False,
        'category': 'formal',
        'experienceLevel': 'entry',
    }
]

print("\n[7-11] Testing 5 Legitimate Cases (expect: Low Risk / published)")
legitimate_passed = 0
for i, case in enumerate(legitimate_cases, 7):
    res = client.post('/api/detect', json=case)
    data = res.get_json()
    score = data.get('fraudScore', -1)
    decision = data.get('decisionOutcome', '')
    passed = res.status_code == 200 and score < 30 and decision == 'published'
    if passed:
        legitimate_passed += 1
    print(f"    [Test {i}] {case['title'][:30]:<30} | Score: {score:>3} | Decision: {decision:<10} | {'✓ PASS' if passed else '✗ FAIL'}")
    all_passed = all_passed and passed

print(f"    Legitimate cases passed: {legitimate_passed}/5")

# ── Review Test Cases (expect: under_review) ─────────────────────
review_cases = [
    {
        'opportunityId': 'review-001',
        'title': 'Administrative Assistant (Contract)',
        'description': 'Join our team as an administrative assistant for a contract role. You will support scheduling, document preparation, and coordination with staff. Training will be provided and you will work with a supervisor.',
        'requirements': 'Good communication, attention to detail, basic computer skills',
        'location': 'Kampala, Uganda',
        'compensationRange': {'min': 1200000, 'max': 2500000},
        'isRemote': False,
        'category': 'contract',
        'experienceLevel': 'entry',
    },
    {
        'opportunityId': 'review-002',
        'title': 'Sales Representative Needed!',
        'description': 'Looking for motivated sales reps! Great commission structure! No experience necessary but preferred. Start immediately!',
        'requirements': 'Good communication skills, motivated',
        'location': 'Kampala, Uganda',
        'compensationRange': {'min': 1500000, 'max': 5000000},
        'isRemote': False,
        'category': 'contract',
        'experienceLevel': 'any',
    },
    {
        'opportunityId': 'review-003',
        'title': 'Retail Sales Representative Needed!',
        'description': 'Retail sales representatives needed! Great commission structure with bonuses. Start immediately. Training will be provided.',
        'requirements': 'Communication skills, sales interest, motivation',
        'location': 'Kampala, Uganda',
        'compensationRange': {'min': 1600000, 'max': 5200000},
        'isRemote': False,
        'category': 'contract',
        'experienceLevel': 'any',
    },
    {
        'opportunityId': 'review-004',
        'title': 'Operations Assistant (Contract) Needed!',
        'description': 'Operations assistant needed! Support scheduling, prepare documents, and coordinate with team members. Training will be provided. Apply now and start the process.',
        'requirements': 'Attention to detail, communication skills, basic computer skills',
        'location': 'Kampala, Uganda',
        'compensationRange': {'min': 1350000, 'max': 3500000},
        'isRemote': False,
        'category': 'contract',
        'experienceLevel': 'entry',
    },
    {
        'opportunityId': 'review-005',
        'title': 'Customer Support Agent Needed!',
        'description': 'Customer support agent needed! Start immediately. Training will be provided. Handle customer inquiries by phone and email. Flexible schedule.',
        'requirements': 'Communication skills, phone etiquette, basic computer use',
        'location': 'Kampala, Uganda',
        'compensationRange': {'min': 1500000, 'max': 4500000},
        'isRemote': False,
        'category': 'contract',
        'experienceLevel': 'any',
    }
]

print("\n[12-16] Testing 5 Review Cases (expect: under_review)")
review_passed = 0
for i, case in enumerate(review_cases, 12):
    res = client.post('/api/detect', json=case)
    data = res.get_json()
    score = data.get('fraudScore', -1)
    decision = data.get('decisionOutcome', '')
    passed = res.status_code == 200 and 30 <= score < 70 and decision == 'under_review'
    if passed:
        review_passed += 1
    print(f"    [Test {i}] {case['title'][:30]:<30} | Score: {score:>3} | Decision: {decision:<10} | {'✓ PASS' if passed else '✗ FAIL'}")
    all_passed = all_passed and passed

print(f"    Review cases passed: {review_passed}/5")

# ── Blocked Test Cases (expect: blocked) ─────────────────────────
blocked_cases = [
    {
        'opportunityId': 'blocked-001',
        'title': 'EARN $5000 DAILY!!! WORK FROM HOME!!!',
        'description': 'Make guaranteed income working from home! No experience needed! Send processing fee via wire transfer to start earning immediately! Limited spots available!',
        'requirements': '',
        'location': 'Online',
        'compensationRange': {'min': 15000000, 'max': 30000000},
        'isRemote': True,
    },
    {
        'opportunityId': 'blocked-002',
        'title': 'URGENT: Western Union Payment Required',
        'description': 'High paying jobs available! Send advance payment via Western Union or MoneyGram to secure your position. Guaranteed employment after payment received!',
        'requirements': 'Must send upfront payment',
        'location': 'Remote',
        'compensationRange': {'min': 20000000, 'max': 40000000},
        'isRemote': True,
    },
    {
        'opportunityId': 'blocked-003',
        'title': 'GET RICH QUICK - INVESTMENT OPPORTUNITY!!!',
        'description': 'Small investment required for huge returns! Work from home and become financially free! Send money now to unlock your earning potential!!!',
        'requirements': 'Willingness to invest',
        'location': 'Online',
        'compensationRange': {'min': 25000000, 'max': 50000000},
        'isRemote': True,
    },
    {
        'opportunityId': 'blocked-004',
        'title': 'PROCESSING FEE JOBS - IMMEDIATE START!!!',
        'description': 'Jobs available requiring processing fee! Send personal bank details and upfront payment to get started. Guaranteed high income! No experience needed!',
        'requirements': 'Bank account details, processing fee',
        'location': 'Remote',
        'compensationRange': {'min': 18000000, 'max': 35000000},
        'isRemote': True,
    },
    {
        'opportunityId': 'blocked-005',
        'title': 'MONEY TRANSFER AGENTS NEEDED URGENTLY!!!',
        'description': 'Become a money transfer agent! Send wire transfers and receive commissions! Must provide personal banking information and send security deposit!',
        'requirements': 'Personal bank details, security deposit',
        'location': 'Online',
        'compensationRange': {'min': 22000000, 'max': 45000000},
        'isRemote': True,
    }
]

print("\n[17-21] Testing 5 Blocked Cases (expect: blocked)")
blocked_passed = 0
for i, case in enumerate(blocked_cases, 17):
    res = client.post('/api/detect', json=case)
    data = res.get_json()
    score = data.get('fraudScore', -1)
    decision = data.get('decisionOutcome', '')
    passed = res.status_code == 200 and score >= 70 and decision == 'blocked'
    if passed:
        blocked_passed += 1
    print(f"    [Test {i}] {case['title'][:30]:<30} | Score: {score:>3} | Decision: {decision:<10} | {'✓ PASS' if passed else '✗ FAIL'}")
    all_passed = all_passed and passed

print(f"    Blocked cases passed: {blocked_passed}/5")

# ── Test Summary ─────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("  EXTENDED TEST SUMMARY")
print("=" * 60)
print(f"  Legitimate cases: {legitimate_passed}/5 passed")
print(f"  Review cases:     {review_passed}/5 passed")
print(f"  Blocked cases:    {blocked_passed}/5 passed")
total_extended = legitimate_passed + review_passed + blocked_passed
print(f"  Total extended:    {total_extended}/15 passed")

if total_extended == 15:
    print("  \033[92m✓ ALL EXTENDED TESTS PASSED!\033[0m")
else:
    print(f"  \033[91m✗ {15 - total_extended} EXTENDED TESTS FAILED\033[0m")

# ── Final Summary ───────────────────────────────────────────────────────
print("\n" + "=" * 60)
if all_passed and total_extended == 15:
    print("  \033[92m✓ ALL TESTS PASSED — Fraud detection is working perfectly!\033[0m")
elif all_passed:
    print("  \033[92m✓ ORIGINAL TESTS PASSED — Check extended tests above.\033[0m")
elif total_extended == 15:
    print("  \033[92m✓ EXTENDED TESTS PASSED — Check original tests above.\033[0m")
else:
    print("  \033[91m✗ SOME TESTS FAILED — Check output above.\033[0m")
print("=" * 60 + "\n")
