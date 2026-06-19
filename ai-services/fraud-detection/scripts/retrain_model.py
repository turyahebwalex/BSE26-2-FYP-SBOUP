#!/usr/bin/env python3
"""
Retrain the fraud detection model with proper class balancing and feature engineering.
"""
import sys
from pathlib import Path
import csv
import json
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))

import joblib
import numpy as np
from scipy.sparse import csr_matrix, hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from sklearn.preprocessing import MaxAbsScaler
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import cross_val_score
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report,
    confusion_matrix,
    roc_auc_score,
)

try:
    from xgboost import XGBClassifier
except ImportError:
    print("XGBoost not installed. Install with: pip install xgboost")
    sys.exit(1)

MODEL_DIR = Path(__file__).parent.parent / 'models'
DATA_DIR = Path(__file__).parent.parent.parent.parent.parent / 'fraud-training-source'
TRAIN_PATH = DATA_DIR / 'train.csv'
TEST_PATH = DATA_DIR / 'test.csv'

NUMERIC_FEATURE_NAMES = [
    'telecommuting',
    'has_company_logo',
    'has_questions',
    'title_length',
    'description_length',
    'requirements_length',
    'benefits_length',
    'salary_min_ugx',
    'salary_max_ugx',
    'salary_mid_ugx',
]

TEXT_FIELDS = [
    'title',
    'description',
    'requirements',
    'benefits',
    'location',
    'department',
    'industry',
    'function',
    'employment_type',
    'required_experience',
    'required_education',
    'salary_currency',
    'salary_currency_source',
]


def normalize_text(value):
    if value is None or value == '':
        return ''
    text = str(value).strip()
    return '' if text == 'Unknown' else text


def normalize_float(value, default=0.0):
    if value in {None, '', 'Unknown'}:
        return float(default)
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def normalize_bool(value):
    if isinstance(value, bool):
        return int(value)
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return int(bool(value))
    return 1 if str(value).strip().lower() in {'1', 'true', 'yes', 'y'} else 0


def build_text(row):
    parts = []
    for field in TEXT_FIELDS:
        value = normalize_text(row.get(field, ''))
        if value:
            parts.append(f'{field}: {value}')
    return ' '.join(parts)


def build_numeric_features(row):
    """Build numeric features - raw values, scaling applied later."""
    return [
        float(normalize_bool(row.get('telecommuting', 0))),
        float(normalize_bool(row.get('has_company_logo', 0))),
        float(normalize_bool(row.get('has_questions', 0))),
        float(len(normalize_text(row.get('title', '')))),
        float(len(normalize_text(row.get('description', '')))),
        float(len(normalize_text(row.get('requirements', '')))),
        float(len(normalize_text(row.get('benefits', '')))),
        normalize_float(row.get('salary_min_ugx', 0)),
        normalize_float(row.get('salary_max_ugx', 0)),
        normalize_float(row.get('salary_mid_ugx', 0)),
    ]


def load_data(path):
    """Load and prepare data."""
    with path.open(newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    
    texts = [build_text(row) for row in rows]
    numeric = np.array([build_numeric_features(row) for row in rows], dtype=np.float32)
    labels = np.array([int(row['fraudulent']) for row in rows], dtype=np.int64)
    
    return rows, texts, numeric, labels


def train_model():
    print("=" * 80)
    print("FRAUD DETECTION MODEL RETRAINING")
    print("=" * 80)
    
    # Load training data
    print(f"\n1. Loading training data from: {TRAIN_PATH}")
    train_rows, train_texts, train_numeric, y_train = load_data(TRAIN_PATH)
    print(f"   ✓ Loaded {len(train_rows)} training samples")
    print(f"   Class distribution: {np.bincount(y_train)}")
    print(f"   Fraud rate: {y_train.mean():.2%}")
    
    # Load test data
    print(f"\n2. Loading test data from: {TEST_PATH}")
    test_rows, test_texts, test_numeric, y_test = load_data(TEST_PATH)
    print(f"   ✓ Loaded {len(test_rows)} test samples")
    
    # Build TF-IDF vectorizer with better parameters
    print("\n3. Building TF-IDF vectorizer...")
    vectorizer = TfidfVectorizer(
        stop_words='english',
        ngram_range=(1, 2),
        min_df=2,  # Ignore terms that appear in less than 2 documents
        max_df=0.95,  # Ignore terms that appear in more than 95% of documents
        max_features=5000,
        sublinear_tf=True,  # Use log scaling for term frequency
    )
    
    X_train_text = vectorizer.fit_transform(train_texts)
    X_test_text = vectorizer.transform(test_texts)
    print(f"   ✓ Vocabulary size: {len(vectorizer.vocabulary_)}")
    
    # Combine text and numeric features
    print("\n4. Combining features...")
    
    # Apply MaxAbsScaler to numeric features
    scaler = MaxAbsScaler()
    train_numeric_scaled = scaler.fit_transform(train_numeric)
    test_numeric_scaled = scaler.transform(test_numeric)
    
    X_train = hstack([X_train_text, csr_matrix(train_numeric_scaled)])
    X_test = hstack([X_test_text, csr_matrix(test_numeric_scaled)])
    print(f"   ✓ Training shape: {X_train.shape}")
    print(f"   ✓ Test shape: {X_test.shape}")
    print(f"   ✓ Numeric features scaled with MaxAbsScaler")
    
    # Train RandomForest
    print("\n5. Training RandomForest...")
    rf = RandomForestClassifier(
        n_estimators=100,
        max_depth=20,
        min_samples_split=10,
        min_samples_leaf=4,
        class_weight={0: 1, 1: 3},  # Gentle 1:3 weighting
        random_state=42,
        n_jobs=-1,
    )
    rf.fit(X_train, y_train)
    print(f"   ✓ RandomForest trained with 1:3 class weights")
    
    # Train XGBoost
    print("\n6. Training XGBoost...")
    # Use gentle 1:3 class weighting
    scale_pos_weight = 3.0
    
    xgb = XGBClassifier(
        n_estimators=100,
        max_depth=6,
        learning_rate=0.1,
        scale_pos_weight=scale_pos_weight,
        random_state=42,
        n_jobs=-1,
        eval_metric='logloss',
    )
    xgb.fit(X_train, y_train)
    print(f"   ✓ XGBoost trained with 1:3 class weights (scale_pos_weight={scale_pos_weight})")
    
    # Create ensemble with calibration
    print("\n7. Creating calibrated ensemble...")
    base_ensemble = VotingClassifier(
        estimators=[('rf', rf), ('xgb', xgb)],
        voting='soft',
        weights=[1, 1],
    )
    
    # Apply sigmoid calibration to fix overconfident predictions
    ensemble = CalibratedClassifierCV(
        base_ensemble,
        method='sigmoid',
        cv=3,
    )
    ensemble.fit(X_train, y_train)
    print(f"   ✓ Ensemble created with soft voting + sigmoid calibration")
    
    # Evaluate on test set
    print("\n8. Evaluating on test set...")
    y_pred = ensemble.predict(X_test)
    y_prob = ensemble.predict_proba(X_test)[:, 1]
    
    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred, zero_division=0)
    recall = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    roc_auc = roc_auc_score(y_test, y_prob)
    
    print(f"\n   Accuracy:  {accuracy:.4f}  {'✓ PASS' if accuracy >= 0.85 else '✗ FAIL'} (target: ≥0.85)")
    print(f"   Precision: {precision:.4f}  {'✓ PASS' if precision >= 0.90 else '✗ FAIL'} (target: ≥0.90)")
    print(f"   Recall:    {recall:.4f}")
    print(f"   F1 Score:  {f1:.4f}  {'✓ PASS' if f1 >= 0.82 else '✗ FAIL'} (target: ≥0.82)")
    print(f"   ROC AUC:   {roc_auc:.4f}")
    
    # Confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    print(f"\n   Confusion Matrix:")
    print(f"   {cm}")
    print(f"   TN: {cm[0,0]:5d}  FP: {cm[0,1]:5d}")
    print(f"   FN: {cm[1,0]:5d}  TP: {cm[1,1]:5d}")
    
    # Detailed report
    print(f"\n   Classification Report:")
    print(classification_report(y_test, y_pred, target_names=['Legitimate', 'Fraud'], digits=4, zero_division=0))
    
    # Save models
    print("\n9. Saving models...")
    ensemble_path = MODEL_DIR / 'ensemble.pkl'
    tfidf_path = MODEL_DIR / 'tfidf.pkl'
    scaler_path = MODEL_DIR / 'scaler.pkl'
    
    joblib.dump(ensemble, ensemble_path)
    joblib.dump(vectorizer, tfidf_path)
    joblib.dump(scaler, scaler_path)
    
    print(f"   ✓ Ensemble saved to: {ensemble_path}")
    print(f"   ✓ Vectorizer saved to: {tfidf_path}")
    print(f"   ✓ Scaler saved to: {scaler_path}")
    
    # Save metrics
    metrics = {
        'trained_at': datetime.utcnow().isoformat() + 'Z',
        'accuracy': float(accuracy),
        'precision': float(precision),
        'recall': float(recall),
        'f1': float(f1),
        'roc_auc': float(roc_auc),
        'train_samples': len(train_rows),
        'test_samples': len(test_rows),
        'confusion_matrix': cm.tolist(),
        'meets_targets': {
            'accuracy': accuracy >= 0.85,
            'precision': precision >= 0.90,
            'f1': f1 >= 0.82,
        },
        'model_config': {
            'rf_n_estimators': 100,
            'rf_max_depth': 20,
            'rf_class_weight': '1:3',
            'xgb_n_estimators': 100,
            'xgb_max_depth': 6,
            'scale_pos_weight': 3.0,
            'tfidf_max_features': 5000,
            'tfidf_ngram_range': [1, 2],
            'scaler': 'MaxAbsScaler',
            'calibration': 'sigmoid',
        }
    }
    
    metrics_path = MODEL_DIR / 'training_metrics.json'
    with metrics_path.open('w') as f:
        json.dump(metrics, f, indent=2)
    
    print(f"\n10. Metrics saved to: {metrics_path}")
    print("=" * 80)
    print("\n✓ Model retraining complete!")
    
    if all(metrics['meets_targets'].values()):
        print("✓ All performance targets met!")
    else:
        print("⚠ Some performance targets not met. Consider:")
        print("  - Collecting more training data")
        print("  - Feature engineering improvements")
        print("  - Hyperparameter tuning")


if __name__ == '__main__':
    train_model()
