#!/usr/bin/env python3
"""Debug why service predictions differ from direct model predictions"""
import sys
import pickle
import numpy as np
from pathlib import Path
from scipy.sparse import hstack, csr_matrix

MODEL_DIR = Path(__file__).parent / 'models'

# Load models
ensemble = pickle.load(open(MODEL_DIR / 'ensemble.pkl', 'rb'))
tfidf = pickle.load(open(MODEL_DIR / 'tfidf.pkl', 'rb'))
scaler = pickle.load(open(MODEL_DIR / 'scaler.pkl', 'rb'))

print('Testing: Senior Accountant')
print('=' * 80)

# Simulate what the service does
text = 'title: Senior Accountant description: Established accounting firm looking for qualified accountant. Responsibilities include financial statements and tax compliance. requirements: CPA certification, 5+ years experience benefits: Health insurance, pension telecommuting: 0 external_application: 0 compensation_currency: UGX compensation_currency_source: manual has_company_logo: 1'

numeric = [
    0,  # telecommuting
    1,  # has_company_logo  
    0,  # has_questions
    17,  # title_length
    127,  # description_length
    38,  # requirements_length
    25,  # benefits_length
    3000000,  # salary_min_ugx
    4000000,  # salary_max_ugx
    3500000,  # salary_mid_ugx
]

print(f'\nText features (first 100 chars): {text[:100]}...')
print(f'Numeric features: {numeric}')

# Transform
text_feat = tfidf.transform([text])
print(f'\nTF-IDF shape: {text_feat.shape}')
print(f'TF-IDF non-zero: {text_feat.nnz}')

num_feat = np.array([numeric], dtype=np.float64)
print(f'\nNumeric before scaling: {num_feat[0][:3]}... (first 3)')

num_scaled = scaler.transform(num_feat)
print(f'Numeric after scaling: {num_scaled[0][:3]}... (first 3)')
print(f'Salary features after scaling: min={num_scaled[0][7]:.6f}, max={num_scaled[0][8]:.6f}, mid={num_scaled[0][9]:.6f}')

# Combine
X = hstack([text_feat, csr_matrix(num_scaled)])
print(f'\nCombined feature matrix shape: {X.shape}')

# Predict
prob = ensemble.predict_proba(X.toarray())[0][1]
score = int(round(prob * 100))

print(f'\n' + '=' * 80)
print(f'Fraud probability: {prob:.6f}')
print(f'Fraud score: {score}')
print(f'Expected: ~2 (Auto-Publish)')
print(f'Actual: {score} ({"Auto-Publish" if score < 30 else "Review" if score < 70 else "Block"})')
print('=' * 80)
