"""
Quick local smoke test for the fraud detection service.
Run with: .venv/bin/python test_fraud_local.py
"""
import os
os.environ.setdefault('MONGODB_URI', 'mongodb://localhost:27017/sboup_dev')
os.environ.setdefault('MONGO_SERVER_SELECTION_TIMEOUT_MS', '500')
os.environ.setdefault('MONGO_CONNECT_TIMEOUT_MS', '500')

from app.main import (
    app, MODEL_AVAILABLE, MODEL_VERSION, FRAUD_MODEL,
    _score_payload, compute_fraud_score, extract_features, preprocess_text,
)

PASS = "✅ PASS"
FAIL = "❌ FAIL"

results = []

def check(name, condition, detail=""):
    status = PASS if condition else FAIL
    results.append(condition)
    print(f"  {status}  {name}", f"({detail})" if detail else "")

print("=" * 60)
print("  SBOUP FRAUD DETECTION — LOCAL TEST SUITE")
print("=" * 60)

# ── 1. Model Loading ──────────────────────────────────────────
print("\n[1] Model Loading")
check("ML model loaded",        MODEL_AVAILABLE,       f"version={MODEL_VERSION}")
check("FRAUD_MODEL not None",   FRAUD_MODEL is not None)

# ── 2. Flask Health Endpoint ──────────────────────────────────
print("\n[2] Flask Endpoints (test client)")
client = app.test_client()
app.config['TESTING'] = True

r = client.get('/api/health')
j = r.get_json()
check("GET /api/health → 200",          r.status_code == 200)
check("service name = fraud-detection", j.get('service') == 'fraud-detection')
check("model_available in response",    'model_available' in j)
check("model_version in response",      'model_version' in j)

r2 = client.get('/api/model/stats')
s = r2.get_json()
check("GET /api/model/stats → 200",     r2.status_code == 200)
check("featureCount > 0",               (s.get('featureCount') or 0) > 0,
      f"features={s.get('featureCount')}")

# ── 3. Legitimate Posting (should be Low Risk / published) ────
print("\n[3] Legitimate Posting (Low Risk expected)")
legit = {
    'opportunityId': 'test-legit-001',
    'title': 'Junior Carpenter',
    'description': 'We are hiring a skilled carpenter with 2 years of experience in Kampala. '
                   'Must have own basic tools. Work Monday to Friday. Salary based on experience.',
    'requirements': 'Woodworking, measurement, finishing, sanding',
    'benefits': 'NSSF, medical allowance',
    'location': 'Kampala, Uganda',
    'compensationRange': {'min': 500000, 'max': 900000},
    'isRemote': False,
    'experienceLevel': 'entry',
}
r3 = client.post('/api/detect', json=legit)
d3 = r3.get_json()
check("POST /api/detect → 200",         r3.status_code == 200)
check("fraudScore returned",            'fraudScore' in d3,
      f"score={d3.get('fraudScore')}")
check("score < 70 (not blocked)",       (d3.get('fraudScore') or 0) < 70,
      f"score={d3.get('fraudScore')}")
check("decisionOutcome != blocked",     d3.get('decisionOutcome') != 'blocked',
      f"outcome={d3.get('decisionOutcome')}")
check("modelReady = True",              d3.get('modelReady') == True)
check("explanation present",           bool(d3.get('explanation')))

# ── 4. Fraudulent Posting (should be High Risk / blocked) ─────
print("\n[4] Fraudulent Posting (High Risk expected)")
fraud = {
    'opportunityId': 'test-fraud-001',
    'title': 'GUARANTEED INCOME WORK FROM HOME!!!',
    'description': (
        'Earn guaranteed income working from home! No experience needed to make $5000 weekly! '
        'Send processing fee via wire transfer or Western Union. '
        'Personal bank account details required. Advance fee payment needed. '
        'Upfront cost is just $50 to get started. Send money now! '
        'Money gram accepted. Too good to be true? Just try it!!!'
    ),
    'requirements': '',
    'location': 'Online',
    'compensationRange': {'min': 18000000, 'max': 28000000},
    'isRemote': True,
    'externalLink': 'http://scam-site.biz',
}
r4 = client.post('/api/detect', json=fraud)
d4 = r4.get_json()
check("POST /api/detect → 200",         r4.status_code == 200)
check("fraudScore > 30",                (d4.get('fraudScore') or 0) > 30,
      f"score={d4.get('fraudScore')}")
check("riskLevel != Low Risk",          d4.get('riskLevel') != 'Low Risk',
      f"level={d4.get('riskLevel')}")
check("flags list present",             isinstance(d4.get('flags'), list))
check("at least 1 flag",               len(d4.get('flags') or []) >= 1,
      f"flags={len(d4.get('flags') or [])}")

# ── 5. Batch Endpoint ─────────────────────────────────────────
print("\n[5] Batch Endpoint")
r5 = client.post('/api/detect/batch', json={'opportunities': [legit, fraud]})
d5 = r5.get_json()
check("POST /api/detect/batch → 200",   r5.status_code == 200)
check("count = 2",                      d5.get('count') == 2)
check("results is list of 2",           len(d5.get('results') or []) == 2)

# ── 6. Bad Input Handling ─────────────────────────────────────
print("\n[6] Edge Cases")
r6a = client.post('/api/detect', json={})
check("empty payload → not 500",        r6a.status_code != 500,
      f"status={r6a.status_code}")

r6b = client.post('/api/detect/batch', json={'opportunities': []})
check("empty batch → 400",             r6b.status_code == 400)

r6c = client.post('/api/detect/batch',
                  json={'opportunities': [{}] * 101})
check("oversized batch → 400",         r6c.status_code == 400)

# ── 7. Rule-based fallback functions ─────────────────────────
print("\n[7] Rule-Based Fallback Functions")
text = preprocess_text('send money via wire transfer for processing fee guaranteed income')
feats = extract_features(text, {'description': text})
score = compute_fraud_score(feats)
check("fraud text scores >= 60",        score >= 60, f"score={score}")

clean = preprocess_text('We are hiring a junior carpenter with 1 year experience in Kampala.')
feats2 = extract_features(clean, {'description': clean})
score2 = compute_fraud_score(feats2)
check("clean text scores < 30",        score2 < 30, f"score={score2}")

# ── Summary ───────────────────────────────────────────────────
total = len(results)
passed = sum(results)
failed = total - passed
print()
print("=" * 60)
print(f"  RESULTS: {passed}/{total} passed  |  {failed} failed")
print("=" * 60)
if failed == 0:
    print("  🎉 All tests passed! Fraud detection is working correctly.")
else:
    print(f"  ⚠️  {failed} test(s) failed. Review output above.")
print()

# Print key scores for the demo
print("  DEMO SCORES (for your presentation):")
print(f"    Legitimate posting → Score: {d3.get('fraudScore')}  → {d3.get('decisionOutcome')}")
print(f"    Fraudulent posting → Score: {d4.get('fraudScore')}  → {d4.get('decisionOutcome')}")
print(f"    Model version: {MODEL_VERSION}")
print()
