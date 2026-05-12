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

# ── Summary ───────────────────────────────────────────────────────
print("\n" + "=" * 60)
if all_passed:
    print("  \033[92m✓ ALL TESTS PASSED — Fraud detection is working!\033[0m")
else:
    print("  \033[91m✗ SOME TESTS FAILED — Check output above.\033[0m")
print("=" * 60 + "\n")
