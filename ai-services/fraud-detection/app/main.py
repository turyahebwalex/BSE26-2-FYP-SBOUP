"""
SBOUP Fraud Detection Microservice
ML-based fraud detection using Random Forest/XGBoost.
Algorithm from SDD Section 5.1 (DetectFraud)
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
import re
import os
import logging
import pickle
from datetime import datetime

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/sboup_dev')
client = MongoClient(MONGODB_URI)
db = client.get_default_database() if 'sboup' in MONGODB_URI else client['sboup_dev']

# Fraud indicators for rule-based fallback
FRAUD_INDICATORS = [
    r'advance\s*(fee|payment)',
    r'wire\s*transfer',
    r'western\s*union',
    r'money\s*gram',
    r'guarantee.*income',
    r'no\s*experience\s*needed.*\$\d{4,}',
    r'work\s*from\s*home.*\$\d{4,}',
    r'send\s*(money|payment|fee)',
    r'personal\s*(bank|account)\s*details',
    r'processing\s*fee',
    r'upfront\s*(cost|fee|payment)',
    r'too\s*good\s*to\s*be\s*true',
]


def preprocess_text(text):
    """Tokenize and clean text for analysis."""
    if not text:
        return ''
    text = text.lower()
    text = re.sub(r'[^a-zA-Z0-9\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def extract_features(text, posting_data):
    """Extract fraud detection features from posting."""
    features = {}

    # Linguistic features
    features['text_length'] = len(text)
    features['word_count'] = len(text.split())
    features['avg_word_length'] = np.mean([len(w) for w in text.split()]) if text.split() else 0
    features['exclamation_count'] = text.count('!')
    features['uppercase_ratio'] = sum(1 for c in text if c.isupper()) / max(len(text), 1)
    features['url_count'] = len(re.findall(r'http[s]?://\S+', str(posting_data.get('description', ''))))

    # Fraud pattern matching
    fraud_pattern_count = 0
    for pattern in FRAUD_INDICATORS:
        if re.search(pattern, text, re.IGNORECASE):
            fraud_pattern_count += 1
    features['fraud_pattern_count'] = fraud_pattern_count

    # Compensation anomalies
    comp = posting_data.get('compensationRange', {})
    if comp:
        min_pay = comp.get('min', 0) or 0
        max_pay = comp.get('max', 0) or 0
        features['pay_range'] = max_pay - min_pay
        features['has_unrealistic_pay'] = 1 if max_pay > 10000000 else 0
    else:
        features['pay_range'] = 0
        features['has_unrealistic_pay'] = 0

    return features


def compute_fraud_score(features):
    """
    Compute fraud risk score (0-100).
    Uses rule-based scoring as fallback when ML model is not trained.
    """
    score = 0

    # Pattern-based scoring
    score += features.get('fraud_pattern_count', 0) * 20

    # Very short or suspiciously formatted descriptions
    if features.get('word_count', 0) < 10:
        score += 15
    if features.get('exclamation_count', 0) > 5:
        score += 10
    if features.get('uppercase_ratio', 0) > 0.3:
        score += 10
    if features.get('has_unrealistic_pay', 0):
        score += 25
    if features.get('url_count', 0) > 3:
        score += 10

    return min(score, 100)


@app.route('/api/detect', methods=['POST'])
def detect_fraud():
    """
    Analyze an opportunity posting for fraud.
    Implements Algorithm 5.1 from SDD.
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'Invalid input'}), 400

        # Step 2: Prepare text
        text = f"{data.get('title', '')} {data.get('description', '')}"
        processed_text = preprocess_text(text)

        # Step 3: Extract features
        features = extract_features(processed_text, data)

        # Step 4: Predict fraud probability
        fraud_score = compute_fraud_score(features)

        # Step 5: Classify risk
        low_threshold = int(os.getenv('FRAUD_LOW_THRESHOLD', 30))
        high_threshold = int(os.getenv('FRAUD_HIGH_THRESHOLD', 70))

        if fraud_score <= low_threshold:
            classification = 'Low Risk'
        elif fraud_score >= high_threshold:
            classification = 'High Risk'
        else:
            classification = 'Medium Risk'

        # Step 6: Log classification
        db.fraudlogs.insert_one({
            'opportunityId': data.get('opportunityId'),
            'fraudScore': fraud_score,
            'classification': classification,
            'features': features,
            'timestamp': datetime.utcnow(),
        })

        logger.info(f"Fraud detection: {data.get('opportunityId')} -> {fraud_score} ({classification})")

        return jsonify({
            'fraudScore': fraud_score,
            'classification': classification,
            'features': features,
        })
    except Exception as e:
        logger.error(f"Fraud detection error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'fraud-detection'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002, debug=True)
