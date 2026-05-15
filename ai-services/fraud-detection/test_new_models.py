#!/usr/bin/env python3
"""Test script to verify new models are working correctly"""
import sys
import pickle
import numpy as np
from pathlib import Path
from scipy.sparse import hstack, csr_matrix

MODEL_DIR = Path(__file__).parent / 'models'

print('=' * 80)
print('TESTING NEW FRAUD DETECTION MODELS')
print('=' * 80)

# Load models
print('\n1. Loading models...')
ensemble = pickle.load(open(MODEL_DIR / 'ensemble.pkl', 'rb'))
tfidf = pickle.load(open(MODEL_DIR / 'tfidf.pkl', 'rb'))
scaler = pickle.load(open(MODEL_DIR / 'scaler.pkl', 'rb'))

print(f'   Ensemble type: {type(ensemble).__name__}')
print(f'   TF-IDF features: {len(tfidf.get_feature_names_out())}')
print(f'   Scaler features: {scaler.n_features_in_}')
print(f'   Scaler max_abs[9] (salary): {scaler.max_abs_[9]:,.0f} UGX')

# Check if ensemble is calibrated
print('\n2. Checking ensemble structure...')
if hasattr(ensemble, 'calibrated_classifiers_'):
    print('   ✅ Model is CalibratedClassifierCV')
    base_estimator = ensemble.calibrated_classifiers_[0].estimator
    print(f'   Base estimator type: {type(base_estimator).__name__}')
    
    if hasattr(base_estimator, 'named_estimators_'):
        print('   ✅ Base estimator is VotingClassifier')
        rf_model = base_estimator.named_estimators_.get('rf')
        xgb_model = base_estimator.named_estimators_.get('xgb')
        
        if rf_model and hasattr(rf_model, 'feature_importances_'):
            print(f'   ✅ RF has {len(rf_model.feature_importances_)} feature importances')
            print(f'      Top 5 RF importances: {sorted(rf_model.feature_importances_, reverse=True)[:5]}')
        
        if xgb_model and hasattr(xgb_model, 'feature_importances_'):
            print(f'   ✅ XGB has {len(xgb_model.feature_importances_)} feature importances')
            print(f'      Top 5 XGB importances: {sorted(xgb_model.feature_importances_, reverse=True)[:5]}')
else:
    print('   ❌ Model is NOT calibrated')
    if hasattr(ensemble, 'named_estimators_'):
        print('   Model is VotingClassifier')

# Test predictions
print('\n3. Testing predictions...')

test_cases = [
    {
        'name': 'Legitimate Accountant',
        'text': 'title: Senior Accountant description: Established accounting firm looking for qualified accountant. Responsibilities include financial statements and tax compliance. requirements: CPA certification, 5+ years experience benefits: Health insurance, pension',
        'numeric': [0, 1, 0, 17, 127, 38, 25, 3000000, 4000000, 3500000]
    },
    {
        'name': 'Obvious Fraud',
        'text': 'title: EARN 500K DAILY!!! description: No experience needed! Send 30000 UGX registration fee via Mobile Money. WhatsApp only. GUARANTEED income!!! requirements: None benefits: Unlimited income',
        'numeric': [1, 0, 0, 18, 130, 4, 16, 50000000, 50000000, 50000000]
    },
    {
        'name': 'Software Developer',
        'text': 'title: Software Developer description: Develop web applications using Python and Django. Minimum 3 years experience required. requirements: BSc Computer Science, 3+ years Python benefits: Competitive salary, flexible hours',
        'numeric': [0, 1, 0, 18, 110, 42, 35, 5000000, 8000000, 6500000]
    }
]

for test in test_cases:
    text_feat = tfidf.transform([test['text']])
    num_feat = np.array([test['numeric']], dtype=np.float64)
    num_scaled = scaler.transform(num_feat)
    X = hstack([text_feat, csr_matrix(num_scaled)]).toarray()
    
    prob = ensemble.predict_proba(X)[0][1]
    score = int(round(prob * 100))
    
    if score < 30:
        decision = 'Auto-Publish ✅'
    elif score < 70:
        decision = 'Review ⚠️'
    else:
        decision = 'Block ❌'
    
    print(f'\n   {test["name"]:25} Score: {score:3d}  {decision}')

print('\n' + '=' * 80)
print('TEST COMPLETE')
print('=' * 80)
