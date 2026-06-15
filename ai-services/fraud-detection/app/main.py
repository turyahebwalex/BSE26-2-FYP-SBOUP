"""
SBOUP Fraud Detection Microservice
ML-based fraud detection using Random Forest/XGBoost.
Algorithm from SDD Section 5.1 (DetectFraud)
"""
from pathlib import Path
from urllib.parse import urlparse
import csv
import hashlib
import logging
import os
import pickle
import re
from datetime import datetime

import joblib
from flask import Flask, request, jsonify
from flask_cors import CORS
from bson import ObjectId
from pymongo import MongoClient
import numpy as np
from scipy.sparse import csr_matrix, hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.DEBUG)  # Changed to DEBUG
logger = logging.getLogger(__name__)

MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/sboup_dev')
client = MongoClient(
    MONGODB_URI,
    serverSelectionTimeoutMS=int(os.getenv('MONGO_SERVER_SELECTION_TIMEOUT_MS', '1000')),
    connectTimeoutMS=int(os.getenv('MONGO_CONNECT_TIMEOUT_MS', '1000')),
)
db = client.get_default_database() if 'sboup' in MONGODB_URI else client['sboup_dev']

MODEL_DIR = Path(__file__).resolve().parent.parent / 'models'
TRAINING_DATA_DIR = Path(__file__).resolve().parents[3] / 'fraud-training-source'
ENSEMBLE_PATH = MODEL_DIR / 'ensemble.pkl'
TFIDF_PATH = MODEL_DIR / 'tfidf.pkl'
SCALER_PATH = MODEL_DIR / 'scaler.pkl'
USD_TO_UGX = 3760.99
SALARY_CAP_UGX = 50_000_000.0  # cap before log-scaling — must match training notebook
CURRENCY_TO_UGX = {
    'UGX': 1.0,
    'USD': USD_TO_UGX,
    'GBP': 4800.0,
    'EUR': 4100.0,
    'KES': 29.0,
}
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

MODEL_AVAILABLE = False
MODEL_VERSION = 'unavailable'
MODEL_LAST_TRAINED_AT = None
MODEL_FEATURE_NAMES = []
MODEL_FEATURE_IMPORTANCES = None
MODEL_STATS = {
    'available': False,
    'accuracy': None,
    'precision': None,
    'recall': None,
    'f1': None,
    'sampleCount': 0,
}
FRAUD_MODEL = None
FRAUD_VECTORIZER = None
FRAUD_SCALER = None


def _clean_text(value):
    if value is None:
        return ''
    text = str(value).replace('\x00', ' ').strip()
    if text in {'', 'Unknown'}:
        return ''
    return re.sub(r'\s+', ' ', text)


def _normalize_bool(value):
    if isinstance(value, bool):
        return int(value)
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return int(bool(value))
    return 1 if str(value).strip().lower() in {'1', 'true', 'yes', 'y'} else 0


def _normalize_float(value, default=0.0):
    if value in {None, '', 'Unknown'}:
        return float(default)
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _cap_salary(value):
    """Cap salary at SALARY_CAP_UGX — must match training notebook Cell 3c."""
    return min(max(_normalize_float(value), 0.0), SALARY_CAP_UGX)


def _extract_domain(url):
    url = _clean_text(url)
    if not url:
        return ''
    parsed = urlparse(url if '://' in url else f'https://{url}')
    return parsed.netloc.lower().replace('www.', '')


def _safe_object_id(value):
    if not value:
        return None
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(str(value))
    except Exception:
        return None


def _hash_artifacts(*paths):
    digest = hashlib.sha256()
    last_modified = None
    for path in paths:
        if not path.exists():
            continue
        digest.update(path.read_bytes())
        modified = datetime.utcfromtimestamp(path.stat().st_mtime).isoformat() + 'Z'
        if last_modified is None or modified > last_modified:
            last_modified = modified
    return digest.hexdigest()[:12], last_modified


def _load_company_doc(company_id):
    company_oid = _safe_object_id(company_id)
    if not company_oid:
        return {}
    try:
        return db.companies.find_one({'_id': company_oid}) or {}
    except Exception as exc:
        logger.warning(f'Company lookup skipped: {exc}')
        return {}


def _load_skill_names(skill_ids):
    resolved = []
    for skill_id in skill_ids or []:
        skill_oid = _safe_object_id(skill_id)
        if not skill_oid:
            continue
        try:
            skill = db.skills.find_one({'_id': skill_oid}) or {}
        except Exception:
            skill = {}
        skill_name = _clean_text(skill.get('skillName'))
        if skill_name:
            resolved.append(skill_name)
    return resolved


def _coerce_salary_range(payload):
    comp = payload.get('compensationRange') or {}
    min_value = payload.get('salary_min_ugx')
    max_value = payload.get('salary_max_ugx')
    mid_value = payload.get('salary_mid_ugx')
    currency = _clean_text(comp.get('currency') or payload.get('salary_currency') or 'UGX') or 'UGX'
    source = _clean_text(payload.get('salary_currency_source') or comp.get('currencySource') or 'manual') or 'manual'

    if min_value in {None, '', 'Unknown'}:
        min_value = comp.get('min')
    if max_value in {None, '', 'Unknown'}:
        max_value = comp.get('max')
    if mid_value in {None, '', 'Unknown'}:
        if min_value not in {None, '', 'Unknown'} and max_value not in {None, '', 'Unknown'}:
            mid_value = (_normalize_float(min_value) + _normalize_float(max_value)) / 2
        elif min_value not in {None, '', 'Unknown'}:
            mid_value = min_value
        else:
            mid_value = 0.0

    rate = CURRENCY_TO_UGX.get(currency.upper(), 1.0 if currency.upper() == 'UGX' else USD_TO_UGX)
    min_ugx = _normalize_float(min_value) * rate
    max_ugx = _normalize_float(max_value) * rate
    mid_ugx = _normalize_float(mid_value) * rate

    if mid_ugx == 0.0 and min_ugx and max_ugx:
        mid_ugx = (min_ugx + max_ugx) / 2

    return {
        'currency': currency,
        'currencySource': source,
        'minUGX': round(min_ugx, 2),
        'maxUGX': round(max_ugx, 2),
        'midUGX': round(mid_ugx, 2),
        'rate': rate,
    }


def _compose_model_text(payload, company_doc=None, skill_names=None):
    company_doc = company_doc or {}
    skill_names = skill_names or []

    # Match notebook's combine_text exactly:
    # fields = ['title', 'company_profile', 'description', 'requirements', 'benefits']
    # plain values joined by space, no field: prefixes
    text_fields = ['title', 'description', 'requirements', 'benefits']

    parts = []
    for field in text_fields:
        value = _clean_text(payload.get(field))
        if value and value.lower() != 'unknown':
            parts.append(value)

    # company_profile from company doc or payload
    company_profile = _clean_text(company_doc.get('description')) or _clean_text(payload.get('company_profile'))
    if company_profile and company_profile.lower() != 'unknown':
        parts.append(company_profile)

    # skill names as plain text
    if skill_names:
        parts.append(' '.join(skill_names))

    compensation = _coerce_salary_range(payload)
    return ' '.join(parts), compensation


def _build_numeric_features(payload, company_doc=None, skill_names=None):
    company_doc = company_doc or {}
    skill_names = skill_names or []
    requirements_text = _clean_text(payload.get('requirements')) or ' '.join(skill_names)
    company_profile_text = _clean_text(company_doc.get('description')) or _clean_text(payload.get('company_profile'))
    benefits_text = _clean_text(payload.get('benefits')) or company_profile_text

    compensation = _coerce_salary_range(payload)
    company_logo_flag = _normalize_bool(company_doc.get('logoUrl') or payload.get('has_company_logo'))
    telecommuting_flag = _normalize_bool(payload.get('isRemote') or payload.get('telecommuting'))
    questions_flag = _normalize_bool(payload.get('has_questions') or payload.get('applicationMethod') == 'external' or payload.get('externalLink'))

    return {
        'telecommuting': float(telecommuting_flag),
        'has_company_logo': float(company_logo_flag),
        'has_questions': float(questions_flag),
        'title_length': float(len(_clean_text(payload.get('title')))),
        'description_length': float(len(_clean_text(payload.get('description')))),
        'requirements_length': float(len(requirements_text)),
        'benefits_length': float(len(benefits_text)),
        'salary_min_ugx': _cap_salary(compensation['minUGX']),
        'salary_max_ugx': _cap_salary(compensation['maxUGX']),
        'salary_mid_ugx': _cap_salary(compensation['midUGX']),
    }


def _load_model_artifacts():
    global MODEL_AVAILABLE, MODEL_VERSION, MODEL_LAST_TRAINED_AT, MODEL_FEATURE_NAMES
    global MODEL_FEATURE_IMPORTANCES, FRAUD_MODEL, FRAUD_VECTORIZER, FRAUD_SCALER

    try:
        FRAUD_MODEL = joblib.load(ENSEMBLE_PATH)
        FRAUD_VECTORIZER = joblib.load(TFIDF_PATH)
        
        # Load scaler if it exists (critical for models trained with scaling)
        if SCALER_PATH.exists():
            FRAUD_SCALER = joblib.load(SCALER_PATH)
            logger.info('Scaler loaded from %s', SCALER_PATH)
        else:
            FRAUD_SCALER = None
            logger.warning('Scaler not found at %s - predictions may be incorrect if model was trained with scaling', SCALER_PATH)
        
        MODEL_FEATURE_NAMES = list(FRAUD_VECTORIZER.get_feature_names_out()) + NUMERIC_FEATURE_NAMES

        # Extract feature importances from calibrated model
        importances = []
        base_model = FRAUD_MODEL
        
        # Unwrap CalibratedClassifierCV if present
        if hasattr(FRAUD_MODEL, 'calibrated_classifiers_'):
            base_model = FRAUD_MODEL.calibrated_classifiers_[0].estimator
            # Unwrap FrozenEstimator if present
            if hasattr(base_model, 'estimator'):
                base_model = base_model.estimator
        
        # Now extract from VotingClassifier
        estimators = getattr(base_model, 'named_estimators_', {}) if hasattr(base_model, 'named_estimators_') else {}
        rf_model = estimators.get('rf')
        xgb_model = estimators.get('xgb')
        if getattr(rf_model, 'feature_importances_', None) is not None:
            importances.append(np.asarray(rf_model.feature_importances_, dtype=float))
        if getattr(xgb_model, 'feature_importances_', None) is not None:
            importances.append(np.asarray(xgb_model.feature_importances_, dtype=float))
        if importances:
            MODEL_FEATURE_IMPORTANCES = np.mean(importances, axis=0)
        else:
            MODEL_FEATURE_IMPORTANCES = np.ones(len(MODEL_FEATURE_NAMES), dtype=float)

        signature, last_modified = _hash_artifacts(ENSEMBLE_PATH, TFIDF_PATH)
        MODEL_VERSION = f'fraud-ensemble-{signature}'
        MODEL_LAST_TRAINED_AT = last_modified
        MODEL_AVAILABLE = True
        logger.info('Fraud model loaded (%s, %d features)', MODEL_VERSION, len(MODEL_FEATURE_NAMES))
        if MODEL_FEATURE_IMPORTANCES is not None:
            logger.info('Feature importances: min=%.6f, max=%.6f, mean=%.6f', 
                       MODEL_FEATURE_IMPORTANCES.min(), MODEL_FEATURE_IMPORTANCES.max(), MODEL_FEATURE_IMPORTANCES.mean())
    except Exception as exc:
        MODEL_AVAILABLE = False
        MODEL_VERSION = 'unavailable'
        MODEL_LAST_TRAINED_AT = None
        MODEL_FEATURE_NAMES = []
        MODEL_FEATURE_IMPORTANCES = None
        FRAUD_MODEL = None
        FRAUD_VECTORIZER = None
        FRAUD_SCALER = None
        logger.warning('Fraud model not loaded, using rule-based fallback: %s', exc)

# Fraud indicators for rule-based fallback
FRAUD_INDICATORS = [
    r'urgent\s*hiring',
    r'immediate\s*start',
    r'limited\s*slots',
    r'!!!',
    r'advance\s*(fee|payment)',
    r'wire\s*transfer',
    r'western\s*union',
    r'money\s*gram',
    r'mobile\s*money',
    r'airtel\s*money',
    r'guarantee.*income',
    r'no\s*experience\s*needed.*(?:\$|UGX|shs|shillings)\s*\d+',
    r'work\s*from\s*home.*(?:\$|UGX|shs|shillings)\s*\d+',
    r'send\s*(money|payment|fee)',
    r'personal\s*(bank|account)\s*details',
    r'national\s*id\s*number',
    r'processing\s*fee',
    r'upfront\s*(cost|fee|payment)',
    r'too\s*good\s*to\s*be\s*true',
    r'get\s*rich\s*quick',
    # Subtle scam patterns
    r'investment\s*required',
    r'small\s*investment',
    r'training\s*(fee|materials)',
    r'business\s*license.*fee',
    r'inventory\s*purchase',
    r'buy\s*inventory',
    r'start.*inventory',
    r'certification.*fee',
    r'background\s*check.*fee',
    r'unlimited\s*(earning|income|commission)',
    r'be.*your.*own\s*boss',
    r'multiple\s*income\s*streams',
    r'business\s*partner',
    r'e-commerce.*network',
    r'proven\s*platform',
    r'team\s*bonuses',
    r'retail\s*commissions',
    r'high\s*commission\s*structure',
    r'flexible\s*hours.*high\s*pay',
    r'work.*from.*home.*investment',
    r'self.*motivated.*high\s*pay',
    r'no.*specific.*experience.*required',
    r'full.*training.*provided.*high\s*pay',
]

HIGH_SEVERITY_PATTERNS = [
    r'wire\s*transfer',
    r'western\s*union',
    r'money\s*gram',
    r'advance\s*(fee|payment)',
    r'processing\s*fee',
    r'upfront\s*(cost|fee|payment)',
    r'mobile\s*money\s*(fee|payment|charge)',
]


def preprocess_text(text):
    """Tokenize and clean text for analysis."""
    if not text:
        return ''
    text = text.lower()
    text = re.sub(r'[^a-zA-Z0-9\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def build_signal_breakdown(features):
    signals = []
    fraud_pattern_count = int(features.get('fraud_pattern_count', 0) or 0)
    word_count = int(features.get('word_count', 0) or 0)
    exclamation_count = int(features.get('exclamation_count', 0) or 0)
    uppercase_ratio = float(features.get('uppercase_ratio', 0) or 0)
    url_count = int(features.get('url_count', 0) or 0)
    email_count = int(features.get('email_count', 0) or 0)
    phone_count = int(features.get('phone_count', 0) or 0)
    contact_handle_count = int(features.get('contact_handle_count', 0) or 0)
    suspicious_tld_count = int(features.get('suspicious_tld_count', 0) or 0)
    high_severity_pattern_count = int(features.get('high_severity_pattern_count', 0) or 0)

    if fraud_pattern_count > 0:
        signals.append({
            'signal': f'{fraud_pattern_count} fraud indicator pattern(s) matched',
            'weight': fraud_pattern_count * 20,
        })
    if int(features.get('has_unrealistic_pay', 0) or 0):
        signals.append({'signal': 'Compensation exceeds the realistic threshold', 'weight': 25})
    if word_count > 0 and word_count < 10:
        signals.append({'signal': 'Posting description is unusually short', 'weight': 15})
    if exclamation_count > 5:
        signals.append({'signal': 'Excessive exclamation marks', 'weight': 10})
    if uppercase_ratio > 0.3:
        signals.append({'signal': 'Excessive uppercase text', 'weight': 10})
    if url_count > 3:
        signals.append({'signal': 'Suspicious number of external URLs', 'weight': 10})
    if email_count > 0:
        signals.append({'signal': 'Direct email contact requested in posting', 'weight': 10})
    if phone_count > 0:
        signals.append({'signal': 'Direct phone contact requested in posting', 'weight': 10})
    if contact_handle_count > 0:
        signals.append({'signal': 'Off-platform chat handle detected (WhatsApp/Telegram)', 'weight': 12})
    if suspicious_tld_count > 0:
        signals.append({'signal': 'Suspicious external link domain detected', 'weight': 10})
    if high_severity_pattern_count > 0:
        signals.append({
            'signal': f'{high_severity_pattern_count} high-severity payment/scam phrase(s) detected',
            'weight': high_severity_pattern_count * 15,
        })

    return signals


def build_explanation(classification, fraud_score, decision_reason, signals):
    parts = []
    if decision_reason:
        parts.append(decision_reason)
    if signals:
        parts.append('Key signals: ' + '; '.join(signal['signal'] for signal in signals))
    parts.append(f'Fraud score {fraud_score}.')
    parts.append(f'Classification: {classification}.')
    return ' '.join(parts)


def _compose_plain_rationale(fraud_score, signals):
    """Short explanation tied to concrete signal themes (not generic boilerplate)."""
    texts = [str(s.get('signal', '')).lower() for s in (signals or [])]
    blob = ' '.join(texts)

    def has_any(*needles):
        return any(n in blob for n in needles)

    pay_scam = has_any(
        'wire', 'western union', 'money gram', 'advance', 'processing fee',
        'upfront', 'payment', 'security deposit', 'transfer agent',
    )
    unrealistic_pay = has_any('unrealistic', 'compensation exceeds', 'high compensation', 'high-severity')
    spam_style = has_any('exclamation', 'uppercase', 'unusually short', 'fraud indicator pattern')
    contact_risk = has_any('email', 'phone', 'whatsapp', 'telegram', 'external', 'suspicious external')
    url_risk = has_any('url', 'domain')

    if fraud_score >= 70:
        parts = []
        if pay_scam:
            parts.append('language that asks for fees, transfers, or upfront payments')
        if unrealistic_pay:
            parts.append('compensation that looks unrealistic for the role')
        if spam_style:
            parts.append('spam-like formatting or very thin job details')
        if contact_risk or url_risk:
            parts.append('strong push to move contact or applications off-platform')
        if not parts:
            parts.append('several strong automated fraud indicators')
        return (
            'This posting was flagged because it contains ' +
            _english_join(parts[:3]) +
            '.'
        )
    if fraud_score >= 30:
        parts = []
        if pay_scam or contact_risk:
            parts.append('some payment or off-platform contact cues')
        if unrealistic_pay:
            parts.append('pay ranges that need a second look')
        if spam_style:
            parts.append('style or length issues common in low-quality listings')
        if not parts:
            parts.append('mixed signals that are not severe enough to auto-block')
        return (
            'This posting was sent for review because it shows ' +
            _english_join(parts[:2]) +
            '.'
        )
    return (
        'This posting looks consistent with genuine listings based on current signals '
        '(always combine with employer context in the admin panel).'
    )


def _english_join(phrases):
    phrases = [p for p in phrases if p]
    if not phrases:
        return ''
    if len(phrases) == 1:
        return phrases[0]
    if len(phrases) == 2:
        return f'{phrases[0]} and {phrases[1]}'
    return ', '.join(phrases[:-1]) + f', and {phrases[-1]}'


def _load_employer_metrics(payload):
    """Real employer history from Mongo when employerId is present."""
    default = {
        'account_age_days': None,
        'previous_postings': 0,
        'blocked_count': 0,
        'verification_status': 'unknown',
    }
    employer_id = payload.get('employerId') or payload.get('postedByUserId')
    oid = _safe_object_id(employer_id)
    if not oid:
        return default
    try:
        user = db.users.find_one({'_id': oid}) or {}
        created = user.get('createdAt')
        if isinstance(created, datetime):
            account_age_days = max(0, (datetime.utcnow() - created).days)
        else:
            account_age_days = None

        total_posted = db.opportunities.count_documents({'postedByUserId': oid})
        previous_postings = max(0, int(total_posted) - 1)
        blocked_count = db.opportunities.count_documents({
            'postedByUserId': oid,
            'status': {'$in': ['blocked']},
        })
        return {
            'account_age_days': account_age_days,
            'previous_postings': previous_postings,
            'blocked_count': int(blocked_count),
            'verification_status': 'unknown',
        }
    except Exception as exc:
        logger.warning('Employer metrics lookup skipped: %s', exc)
        return default


def build_rich_explanation(result, payload, numeric_features, company_doc=None):
    """Build plain-English explanation with quality metrics and confidence indicators."""
    fraud_score = result['fraudScore']
    classification = result['classification']
    signals = result.get('signals', [])
    
    rationale = _compose_plain_rationale(fraud_score, signals)
    
    # Quality metrics
    quality_metrics = calculate_quality_metrics(payload, numeric_features, company_doc)
    
    # Confidence indicator
    if fraud_score >= 70 or fraud_score < 20:
        confidence = "high"
    elif fraud_score >= 50 or fraud_score < 30:
        confidence = "medium"
    else:
        confidence = "low"
    
    em = quality_metrics['employer_metrics']
    age_days = em.get('account_age_days')
    age_phrase = f'{age_days} days' if isinstance(age_days, int) else 'unknown (no employer id or user record)'
    trust_line = (
        f'Employer context: account age ~{age_phrase}, '
        f'{em.get("previous_postings", 0)} prior posting(s), '
        f'{em.get("blocked_count", 0)} blocked posting(s), '
        f'company verification: {em.get("verification_status", "unknown")}.'
    )

    explanation_parts = [
        rationale,
        f"Quality Score: {quality_metrics['overall_score']}/100 (completeness: {quality_metrics['completeness_score']}/100, content quality: {quality_metrics['content_score']}/100).",
        trust_line,
        f"Confidence in fraud assessment: {confidence}.",
        f"Key risk factors: {'; '.join(signal['signal'] for signal in signals[:3]) if signals else 'None detected'}.",
    ]
    
    return {
        'plain_english_rationale': rationale,
        'quality_metrics': quality_metrics,
        'confidence_level': confidence,
        'detailed_explanation': ' '.join(explanation_parts),
        'risk_factors': [signal['signal'] for signal in signals[:5]]
    }


def calculate_quality_metrics(payload, numeric_features, company_doc=None):
    """Calculate genuine quality metrics for XAI panel."""
    company_doc = company_doc or {}
    
    # Posting completeness score (0-100)
    req_text = _clean_text(payload.get('requirements'))
    skill_ids = payload.get('requiredSkills') or []
    has_requirements = (len(req_text) > 20) or (isinstance(skill_ids, list) and len(skill_ids) > 0)

    completeness_checks = {
        'has_description': bool(payload.get('description') and len(str(payload.get('description', '')).strip()) > 50),
        'has_requirements': has_requirements,
        'has_salary': bool(numeric_features.get('salary_mid_ugx', 0) > 0),
        'has_location': bool(payload.get('location') and len(str(payload.get('location', '')).strip()) > 2),
        'has_title': bool(payload.get('title') and len(str(payload.get('title', '')).strip()) > 5),
        'has_category': bool(payload.get('category')),
        'has_deadline': bool(payload.get('deadline')),
        'has_company': bool(payload.get('companyId') or company_doc.get('_id'))
    }
    
    completeness_score = sum(completeness_checks.values()) / len(completeness_checks) * 100
    
    # Content quality score (0-100)
    content_checks = {
        'adequate_description_length': 10 <= len(payload.get('description', '')) <= 2000,
        'professional_title': not any(x in payload.get('title', '').lower() for x in ['!!!', 'urgent', 'immediate', 'asap']),
        'reasonable_compensation': 0 < numeric_features.get('salary_mid_ugx', 0) < 10000000,  # Not too high
        'no_excessive_punctuation': payload.get('description', '').count('!') <= 2,
        'no_all_caps': sum(1 for c in payload.get('description', '') if c.isupper()) / max(len(payload.get('description', '')), 1) < 0.3
    }
    
    content_score = sum(content_checks.values()) / len(content_checks) * 100
    
    # Overall quality score
    overall_score = (completeness_score * 0.6) + (content_score * 0.4)
    
    employer_metrics = _load_employer_metrics(payload)
    employer_metrics['verification_status'] = (
        _clean_text(company_doc.get('verificationStatus'))
        or employer_metrics.get('verification_status')
        or 'unverified'
    )
    
    return {
        'overall_score': round(overall_score, 1),
        'completeness_score': round(completeness_score, 1),
        'content_score': round(content_score, 1),
        'completeness_checks': completeness_checks,
        'content_checks': content_checks,
        'employer_metrics': employer_metrics
    }


def extract_features(text, posting_data, raw_text=None):
    """Extract fraud detection features from posting."""
    features = {}
    source_text = raw_text if raw_text is not None else text

    # Linguistic features
    features['text_length'] = len(text)
    features['word_count'] = len(text.split())
    features['avg_word_length'] = np.mean([len(w) for w in text.split()]) if text.split() else 0
    features['exclamation_count'] = text.count('!')
    features['uppercase_ratio'] = sum(1 for c in source_text if c.isupper()) / max(len(source_text), 1)
    features['url_count'] = len(re.findall(r'http[s]?://\S+', str(posting_data.get('description', ''))))
    features['email_count'] = len(re.findall(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', source_text))
    features['phone_count'] = len(re.findall(r'(\+?\d[\d\-\s]{7,}\d)', source_text))
    features['contact_handle_count'] = len(re.findall(r'(?:whatsapp|telegram|t\.me|dm\s+me|inbox\s+me)', text, re.IGNORECASE))
    features['suspicious_tld_count'] = len(re.findall(r'https?://[^\s]+\.(xyz|top|click|work|biz|loan|win)\b', source_text, re.IGNORECASE))
    high_severity_pattern_count = 0
    for pattern in HIGH_SEVERITY_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            high_severity_pattern_count += 1
    features['high_severity_pattern_count'] = high_severity_pattern_count

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
    # Increase weight for Ugandan context keywords
    score += features.get('fraud_pattern_count', 0) * 25

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
    score += features.get('high_severity_pattern_count', 0) * 15
    if features.get('email_count', 0) > 0:
        score += 10
    if features.get('phone_count', 0) > 0:
        score += 10
    if features.get('contact_handle_count', 0) > 0:
        score += 12
    if features.get('suspicious_tld_count', 0) > 0:
        score += 10

    return min(score, 100)


def classify_score(fraud_score, low_threshold, high_threshold):
    if fraud_score < low_threshold:
        return 'Low Risk', 'published', f'Fraud score {fraud_score} is below the auto-approval threshold ({low_threshold}).'
    if fraud_score >= high_threshold:
        return 'High Risk', 'blocked', f'Fraud score {fraud_score} is at or above the auto-rejection threshold ({high_threshold}).'
    return 'Medium Risk', 'under_review', f'Fraud score {fraud_score} falls within the manual review band ({low_threshold}-{high_threshold - 1}).'


def _model_feature_contributions(feature_values):
    if MODEL_FEATURE_IMPORTANCES is None or not MODEL_FEATURE_NAMES:
        return []

    contributions = []
    for idx, value in enumerate(feature_values):
        importance = float(MODEL_FEATURE_IMPORTANCES[idx]) if idx < len(MODEL_FEATURE_IMPORTANCES) else 0.0
        contribution = float(value) * importance
        if contribution <= 0:
            continue
        contributions.append({
            'feature': MODEL_FEATURE_NAMES[idx],
            'value': round(float(value), 4),
            'importance': round(importance, 6),
            'contribution': round(contribution, 6),
        })

    contributions.sort(key=lambda item: item['contribution'], reverse=True)
    return contributions[:5]


def _model_flags(payload, numeric_features, feature_contributions, text_blob):
    flags = []
    if numeric_features['telecommuting']:
        flags.append({'signal': 'Remote posting', 'weight': 4})
    if numeric_features['has_questions']:
        flags.append({'signal': 'External application path detected', 'weight': 5})
    if numeric_features['salary_mid_ugx'] > 0 and numeric_features['salary_mid_ugx'] >= 10000000:
        flags.append({'signal': 'High compensation band', 'weight': 8})

    if text_blob:
        for pattern in FRAUD_INDICATORS:
            if re.search(pattern, text_blob, re.IGNORECASE):
                flags.append({'signal': f'Matched fraud pattern: {pattern}', 'weight': 20})

    for item in feature_contributions:
        flags.append({
            'signal': f'Top model feature: {item["feature"]}',
            'weight': max(int(round(item['contribution'] * 100)), 1),
            'feature': item['feature'],
            'contribution': item['contribution'],
        })

    deduped = []
    seen = set()
    for flag in flags:
        key = flag.get('signal')
        if key in seen:
            continue
        seen.add(key)
        deduped.append(flag)
    return deduped[:10]


def _model_explanation(result):
    parts = [
        f"Model {MODEL_VERSION} predicted {result['fraudScore']} risk.",
        f"Risk level: {result['riskLevel']}.",
        f"Decision outcome: {result['decisionOutcome']}.",
    ]
    if result.get('flags'):
        parts.append('Key flags: ' + '; '.join(flag['signal'] for flag in result['flags'][:5]))
    return ' '.join(parts)


def _apply_edge_case_overrides(base_score, heuristic_features, numeric_features):
    adjusted_score = int(base_score)
    override_flags = []

    fraud_pattern_count = int(heuristic_features.get('fraud_pattern_count', 0) or 0)
    high_severity_pattern_count = int(heuristic_features.get('high_severity_pattern_count', 0) or 0)
    word_count = int(heuristic_features.get('word_count', 0) or 0)
    has_unrealistic_pay = int(heuristic_features.get('has_unrealistic_pay', 0) or 0) == 1
    contact_count = (
        int(heuristic_features.get('email_count', 0) or 0)
        + int(heuristic_features.get('phone_count', 0) or 0)
        + int(heuristic_features.get('contact_handle_count', 0) or 0)
    )
    suspicious_tld_count = int(heuristic_features.get('suspicious_tld_count', 0) or 0)
    external_path = int(numeric_features.get('has_questions', 0) or 0) == 1
    remote_posting = int(numeric_features.get('telecommuting', 0) or 0) == 1
    salary_mid_ugx = float(numeric_features.get('salary_mid_ugx', 0) or 0)

    def enforce_floor(floor, signal, weight=25):
        nonlocal adjusted_score
        if adjusted_score < floor:
            adjusted_score = floor
            override_flags.append({'signal': signal, 'weight': weight})

    if high_severity_pattern_count >= 2 and has_unrealistic_pay and contact_count > 0:
        enforce_floor(90, 'Edge-case override: severe scam signature (payment phrases + unrealistic pay + direct contact)')

    if word_count < 8 and has_unrealistic_pay and (external_path or contact_count > 0):
        enforce_floor(80, 'Edge-case override: very short high-pay posting with external/direct contact path')

    if fraud_pattern_count >= 1 and suspicious_tld_count > 0:
        enforce_floor(75, 'Edge-case override: fraud phrase with suspicious external domain')

    if fraud_pattern_count >= 1:
        enforce_floor(35, 'Edge-case override: suspicious keywords require manual review', weight=15)

    # Medium-risk guardrail: suspicious external routing should never auto-publish.
    medium_risk_bundle = (
        external_path
        and (
            suspicious_tld_count > 0
            or contact_count > 0
            or high_severity_pattern_count > 0
            or fraud_pattern_count > 0
        )
        and (remote_posting or salary_mid_ugx >= 4_000_000)
    )
    if medium_risk_bundle:
        enforce_floor(35, 'Edge-case override: suspicious external/contact pattern requires manual review', weight=12)

    return min(adjusted_score, 100), override_flags


def _score_payload(payload, persist_log=True):
    payload = payload or {}
    company_doc = _load_company_doc(payload.get('companyId'))
    skill_names = _load_skill_names(payload.get('requiredSkills'))
    text_blob, compensation = _compose_model_text(payload, company_doc, skill_names)
    numeric_features = _build_numeric_features(payload, company_doc, skill_names)
    heuristic_features = extract_features(preprocess_text(text_blob), payload, text_blob)

    model_ready = MODEL_AVAILABLE and FRAUD_MODEL is not None and FRAUD_VECTORIZER is not None
    low_threshold = int(os.getenv('FRAUD_LOW_THRESHOLD', 30))
    high_threshold = int(os.getenv('FRAUD_HIGH_THRESHOLD', 70))

    if model_ready:
        try:
            text_matrix = FRAUD_VECTORIZER.transform([text_blob])
            numeric_row = np.array([[numeric_features[name] for name in NUMERIC_FEATURE_NAMES]], dtype=np.float32)

            # Apply scaler to numeric features if available (critical for models trained with scaling).
            if FRAUD_SCALER is not None:
                numeric_row = FRAUD_SCALER.transform(numeric_row)

            logger.debug('Text blob (first 200 chars): %s', text_blob[:200])
            logger.debug('Numeric features before scaling: %s', [numeric_features[name] for name in NUMERIC_FEATURE_NAMES])
            logger.debug('Numeric features after scaling: %s', numeric_row[0].tolist())

            numeric_matrix = csr_matrix(numeric_row)
            feature_matrix = hstack([text_matrix, numeric_matrix]).toarray()
            fraud_prob = float(FRAUD_MODEL.predict_proba(feature_matrix)[0][1])
            fraud_score = int(round(np.clip(fraud_prob * 100, 0, 100)))

            # SYSTEM OPTIMIZATION: Trust internal postings from professional companies.
            # If the job is internal and the text is professional, reduce the AI's sensitivity.
            is_internal = payload.get('applicationMethod') == 'internal'
            if is_internal and fraud_score < 70:
                # Check for absolute red flags (fees, money collection)
                high_severity_count = int(heuristic_features.get('high_severity_pattern_count', 0) or 0)
                if high_severity_count == 0:
                    # Reduce score to favor auto-publishing for verified internal employers
                    fraud_score = int(fraud_score * 0.4) 

            fraud_score, override_flags = _apply_edge_case_overrides(fraud_score, heuristic_features, numeric_features)
            feature_values = np.concatenate([text_matrix.toarray().ravel(), numeric_row.ravel()])
            feature_contributions = _model_feature_contributions(feature_values)
            flags = _model_flags(payload, numeric_features, feature_contributions, text_blob)
            if override_flags:
                flags = override_flags + flags
            classification, decision_outcome, decision_reason = classify_score(fraud_score, low_threshold, high_threshold)
            result = {
                'fraudScore': fraud_score,
                'riskLevel': classification,
                'classification': classification,
                'decisionOutcome': decision_outcome,
                'decisionReason': decision_reason,
                'thresholds': {'low': low_threshold, 'high': high_threshold},
                'flags': flags,
                'signals': flags,
                'featureContributions': feature_contributions,
                'features': {
                    **heuristic_features,
                    'modelVersion': MODEL_VERSION,
                    'modelReady': True,
                    'modelFeatures': numeric_features,
                    'textLength': len(text_blob),
                    'salary': compensation,
                },
                'explanation': '',
                'modelVersion': MODEL_VERSION,
                'lastTrainedAt': MODEL_LAST_TRAINED_AT,
                'modelReady': True,
            }
            result['explanation'] = _model_explanation(result)
            
            # Add rich XAI explanation
            rich_explanation = build_rich_explanation(result, payload, numeric_features, company_doc)
            result['xaiExplanation'] = rich_explanation
        except Exception as exc:
            logger.warning('Model inference failed, falling back to heuristics: %s', exc)
            model_ready = False

    if not model_ready:
        features = heuristic_features
        fraud_score = compute_fraud_score(features)
        fraud_score, override_flags = _apply_edge_case_overrides(fraud_score, heuristic_features, numeric_features)
        classification, decision_outcome, decision_reason = classify_score(fraud_score, low_threshold, high_threshold)
        flags = build_signal_breakdown(features)
        if override_flags:
            flags = override_flags + flags
        explanation = build_explanation(classification, fraud_score, decision_reason, flags)
        result = {
            'fraudScore': fraud_score,
            'riskLevel': classification,
            'classification': classification,
            'decisionOutcome': decision_outcome,
            'decisionReason': decision_reason,
            'thresholds': {'low': low_threshold, 'high': high_threshold},
            'flags': flags,
            'signals': flags,
            'featureContributions': [],
            'features': {
                **features,
                'modelVersion': MODEL_VERSION,
                'modelReady': False,
                'modelFeatures': numeric_features,
                'textLength': len(text_blob),
                'salary': compensation,
            },
            'explanation': explanation,
            'modelVersion': MODEL_VERSION,
            'lastTrainedAt': MODEL_LAST_TRAINED_AT,
            'modelReady': False,
        }
        
        # Add rich XAI explanation for fallback case
        rich_explanation = build_rich_explanation(result, payload, numeric_features, company_doc)
        result['xaiExplanation'] = rich_explanation

    if persist_log:
        try:
            db.fraudlogs.insert_one({
                'opportunityId': payload.get('opportunityId'),
                'source': 'model' if model_ready else 'workflow',
                'stage': 'inference',
                'fraudScore': result['fraudScore'],
                'classification': result['classification'],
                'decisionOutcome': result['decisionOutcome'],
                'decisionReason': result['decisionReason'],
                'thresholds': result['thresholds'],
                'features': result['features'],
                'signals': result['signals'],
                'explanation': result['explanation'],
                'timestamp': datetime.utcnow(),
            })
        except Exception as exc:
            logger.warning(f'Fraud log write skipped: {exc}')

    return result


def _evaluate_model_metrics():
    if not MODEL_AVAILABLE or FRAUD_MODEL is None or FRAUD_VECTORIZER is None:
        return

    test_path = TRAINING_DATA_DIR / 'test.csv'
    if not test_path.exists():
        return

    try:
        with test_path.open(newline='', encoding='utf-8') as handle:
            rows = list(csv.DictReader(handle))
    except Exception as exc:
        logger.warning('Fraud metrics evaluation skipped: %s', exc)
        return

    if not rows:
        return

    y_true = []
    y_pred = []
    for row in rows:
        prediction = _score_payload(row, persist_log=False)
        y_true.append(int(_normalize_float(row.get('fraudulent'), 0)))
        y_pred.append(1 if prediction['fraudScore'] >= 50 else 0)

    try:
        MODEL_STATS.update({
            'available': True,
            'accuracy': round(float(accuracy_score(y_true, y_pred)), 4),
            'precision': round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
            'recall': round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
            'f1': round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
            'sampleCount': len(rows),
        })
    except Exception as exc:
        logger.warning('Fraud metrics computation failed: %s', exc)


_load_model_artifacts()
_evaluate_model_metrics()


@app.route('/api/detect', methods=['POST'])
def detect_fraud():
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({'error': 'Invalid input'}), 400

        result = _score_payload(data, persist_log=True)
        logger.info(
            'Fraud detection: %s -> %s (%s) modelReady=%s',
            data.get('opportunityId'),
            result['fraudScore'],
            result['classification'],
            result['modelReady'],
        )
        return jsonify(result)
    except Exception as e:
        logger.error(f"Fraud detection error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/detect/batch', methods=['POST'])
def detect_fraud_batch():
    try:
        data = request.get_json(silent=True) or {}
        opportunities = data.get('opportunities')
        if not isinstance(opportunities, list) or not opportunities:
            return jsonify({'error': 'opportunities must be a non-empty array'}), 400
        if len(opportunities) > 100:
            return jsonify({'error': 'Maximum batch size is 100 opportunities'}), 400

        results = []
        for item in opportunities:
            results.append(_score_payload(item or {}, persist_log=True))

        return jsonify({
            'count': len(results),
            'results': results,
            'modelVersion': MODEL_VERSION,
            'lastTrainedAt': MODEL_LAST_TRAINED_AT,
        })
    except Exception as exc:
        logger.error('Batch fraud detection error: %s', exc)
        return jsonify({'error': str(exc)}), 500


@app.route('/api/model/stats', methods=['GET'])
def model_stats():
    return jsonify({
        'available': MODEL_STATS['available'],
        'modelVersion': MODEL_VERSION,
        'lastTrainedAt': MODEL_LAST_TRAINED_AT,
        'accuracy': MODEL_STATS['accuracy'],
        'precision': MODEL_STATS['precision'],
        'recall': MODEL_STATS['recall'],
        'f1': MODEL_STATS['f1'],
        'sampleCount': MODEL_STATS['sampleCount'],
        'featureCount': len(MODEL_FEATURE_NAMES),
    })


# ─── Drift Detection ──────────────────────────────────────────────────────────

# Baseline thresholds — derived from training-time targets in retrain_model.py.
# A metric that falls below these values signals potential model drift.
DRIFT_BASELINES = {
    'accuracy':  0.85,
    'precision': 0.90,
    'f1':        0.82,
}

# Agreement rate below this % (admin decisions that contradict the model) is
# treated as a drift warning signal.
ADMIN_AGREEMENT_THRESHOLD = 0.70


def _compute_drift_status():
    """
    Compare current model metrics against baselines and inspect admin feedback
    logs to produce a drift health report.

    Three signals are checked:
      1. Model performance metrics (accuracy / precision / F1) vs. baselines.
      2. Admin override rate — how often admins reverse the model's auto-decision.
      3. Score distribution shift — the ratio of high-risk flags in recent logs
         vs. the historical average (a large shift can indicate concept drift).

    Returns a dict describing the drift health status.
    """
    report = {
        'checkedAt': datetime.utcnow().isoformat() + 'Z',
        'modelVersion': MODEL_VERSION,
        'modelAvailable': MODEL_AVAILABLE,
        'overallStatus': 'ok',          # 'ok' | 'warning' | 'drift_detected'
        'signals': [],
        'metricComparison': {},
        'adminAgreementRate': None,
        'adminAgreementSampleSize': 0,
        'scoreDistributionShift': None,
        'recommendation': '',
    }

    # ── 1. Performance metric comparison ─────────────────────────────────────
    if MODEL_STATS['available']:
        metric_issues = []
        comparison = {}
        for metric, baseline in DRIFT_BASELINES.items():
            current = MODEL_STATS.get(metric)
            if current is None:
                continue
            gap = round(current - baseline, 4)
            comparison[metric] = {
                'current': current,
                'baseline': baseline,
                'gap': gap,
                'ok': current >= baseline,
            }
            if current < baseline:
                metric_issues.append(
                    f'{metric} degraded to {current:.3f} (baseline {baseline:.3f}, gap {gap:.3f})'
                )
        report['metricComparison'] = comparison
        if metric_issues:
            report['signals'].extend(metric_issues)
            report['overallStatus'] = 'drift_detected'
    else:
        report['signals'].append('Model metrics unavailable — model not loaded or test set missing.')
        report['overallStatus'] = 'warning'

    # ── 2. Admin override rate (last 30 days) ─────────────────────────────────
    try:
        since_30d = datetime.utcnow().__class__.utcnow() if False else \
            datetime(datetime.utcnow().year, datetime.utcnow().month, datetime.utcnow().day) \
            .__class__.utcnow()
        from datetime import timedelta
        since_30d = datetime.utcnow() - timedelta(days=30)

        # Admin logs where a human made a different decision than the model
        admin_logs = list(db.fraudlogs.aggregate([
            {'$match': {
                'source': 'admin',
                'stage': 'moderation',
                'createdAt': {'$gte': since_30d},
            }},
            {'$group': {
                '_id': '$opportunityId',
                'adminOutcome': {'$last': '$decisionOutcome'},
            }},
        ]))

        model_logs_map = {}
        if admin_logs:
            opp_ids = [row['_id'] for row in admin_logs if row.get('_id')]
            model_logs = list(db.fraudlogs.aggregate([
                {'$match': {
                    'source': {'$in': ['model', 'workflow']},
                    'opportunityId': {'$in': opp_ids},
                }},
                {'$sort': {'createdAt': 1}},
                {'$group': {
                    '_id': '$opportunityId',
                    'modelOutcome': {'$last': '$decisionOutcome'},
                }},
            ]))
            model_logs_map = {str(row['_id']): row['modelOutcome'] for row in model_logs}

        agreements = 0
        total = len(admin_logs)
        for row in admin_logs:
            model_outcome = model_logs_map.get(str(row.get('_id')), None)
            admin_outcome = row.get('adminOutcome')
            if model_outcome and admin_outcome:
                # Treat "approve" admin action as agreeing with the model if model
                # also said published, or disagreeing if the model blocked/flagged.
                if admin_outcome == model_outcome:
                    agreements += 1
                elif admin_outcome == 'published' and model_outcome == 'published':
                    agreements += 1

        if total > 0:
            agreement_rate = round(agreements / total, 4)
            report['adminAgreementRate'] = agreement_rate
            report['adminAgreementSampleSize'] = total
            if agreement_rate < ADMIN_AGREEMENT_THRESHOLD:
                msg = (
                    f'Admin override rate is high — agreement rate {agreement_rate:.1%} '
                    f'(threshold {ADMIN_AGREEMENT_THRESHOLD:.0%}, {total} decisions). '
                    'Admins are frequently reversing model decisions, suggesting concept drift.'
                )
                report['signals'].append(msg)
                if report['overallStatus'] == 'ok':
                    report['overallStatus'] = 'warning'
        else:
            report['adminAgreementRate'] = None
            report['adminAgreementSampleSize'] = 0
    except Exception as exc:
        logger.warning('Admin agreement computation skipped: %s', exc)

    # ── 3. Score distribution shift ───────────────────────────────────────────
    try:
        from datetime import timedelta
        recent_cutoff = datetime.utcnow() - timedelta(days=7)
        historical_cutoff = datetime.utcnow() - timedelta(days=37)

        recent_agg = list(db.fraudlogs.aggregate([
            {'$match': {
                'source': {'$in': ['model', 'workflow']},
                'createdAt': {'$gte': recent_cutoff},
            }},
            {'$group': {
                '_id': None,
                'total': {'$sum': 1},
                'highRisk': {'$sum': {'$cond': [{'$gte': ['$fraudScore', 70]}, 1, 0]}},
                'avgScore': {'$avg': '$fraudScore'},
            }},
        ]))

        historical_agg = list(db.fraudlogs.aggregate([
            {'$match': {
                'source': {'$in': ['model', 'workflow']},
                'createdAt': {'$gte': historical_cutoff, '$lt': recent_cutoff},
            }},
            {'$group': {
                '_id': None,
                'total': {'$sum': 1},
                'highRisk': {'$sum': {'$cond': [{'$gte': ['$fraudScore', 70]}, 1, 0]}},
                'avgScore': {'$avg': '$fraudScore'},
            }},
        ]))

        recent = recent_agg[0] if recent_agg else None
        historical = historical_agg[0] if historical_agg else None

        if recent and historical and recent['total'] > 0 and historical['total'] > 0:
            recent_rate = recent['highRisk'] / recent['total']
            hist_rate = historical['highRisk'] / historical['total']
            shift = round(recent_rate - hist_rate, 4)
            report['scoreDistributionShift'] = {
                'recentHighRiskRate': round(recent_rate, 4),
                'historicalHighRiskRate': round(hist_rate, 4),
                'shift': shift,
                'recentAvgScore': round(recent['avgScore'] or 0, 2),
                'historicalAvgScore': round(historical['avgScore'] or 0, 2),
                'recentSamples': recent['total'],
                'historicalSamples': historical['total'],
            }
            if abs(shift) > 0.15:
                direction = 'increase' if shift > 0 else 'decrease'
                msg = (
                    f'Score distribution shift detected — high-risk rate {direction}d by '
                    f'{abs(shift):.1%} vs. prior 30-day baseline '
                    f'(recent {recent_rate:.1%} vs. historical {hist_rate:.1%}).'
                )
                report['signals'].append(msg)
                if report['overallStatus'] == 'ok':
                    report['overallStatus'] = 'warning'
    except Exception as exc:
        logger.warning('Score distribution shift computation skipped: %s', exc)

    # ── Recommendation text ───────────────────────────────────────────────────
    if report['overallStatus'] == 'drift_detected':
        report['recommendation'] = (
            'Model performance has dropped below baseline targets. '
            'Export admin-labelled training data and retrain the model '
            'using scripts/retrain_model.py with the exported feedback CSV.'
        )
    elif report['overallStatus'] == 'warning':
        report['recommendation'] = (
            'Early drift signals detected. Monitor closely over the next 7 days. '
            'If signals persist, export training data and schedule a retrain.'
        )
    else:
        report['recommendation'] = (
            'Model performance is within acceptable bounds. '
            'Continue monitoring weekly via this endpoint.'
        )

    return report


@app.route('/api/drift/status', methods=['GET'])
def drift_status():
    """
    Drift detection endpoint.
    Compares current model metrics against training-time baselines and checks
    admin override patterns to flag potential concept drift.
    """
    try:
        report = _compute_drift_status()
        return jsonify(report)
    except Exception as exc:
        logger.error('Drift status error: %s', exc)
        return jsonify({'error': str(exc)}), 500


@app.route('/api/training-export', methods=['GET'])
def training_export():
    """
    Export admin-labelled decisions from the fraud log for model retraining.

    Returns JSONL-style records where each row contains the opportunity features
    and the final human-verified label (1 = fraud, 0 = legitimate).

    Query params:
      - days (int, default 90): how far back to look
      - min_feedback (bool, default false): if true, only include rows with admin feedback text
    """
    try:
        from datetime import timedelta

        days = int(request.args.get('days', 90))
        require_feedback = request.args.get('min_feedback', 'false').lower() == 'true'
        since = datetime.utcnow() - timedelta(days=days)

        match_filter = {
            'source': 'admin',
            'stage': {'$in': ['moderation', 'appeal_review']},
            'createdAt': {'$gte': since},
        }
        if require_feedback:
            match_filter['adminFeedback'] = {'$exists': True, '$ne': ''}

        logs = list(db.fraudlogs.aggregate([
            {'$match': match_filter},
            # Keep the latest admin decision per opportunity
            {'$sort': {'createdAt': -1}},
            {'$group': {
                '_id': '$opportunityId',
                'decisionOutcome': {'$first': '$decisionOutcome'},
                'adminAction': {'$first': '$adminAction'},
                'adminFeedback': {'$first': '$adminFeedback'},
                'fraudScore': {'$first': '$fraudScore'},
                'classification': {'$first': '$classification'},
                'signals': {'$first': '$signals'},
                'features': {'$first': '$features'},
                'explanation': {'$first': '$explanation'},
                'createdAt': {'$first': '$createdAt'},
            }},
            {'$sort': {'createdAt': -1}},
            {'$limit': 5000},
        ]))

        # Resolve ground-truth label from admin decision:
        # approve / appeal_approve  → 0 (legitimate)
        # reject / suspend / remove → 1 (fraud)
        # Skipped if action is ambiguous
        ACTION_TO_LABEL = {
            'approve': 0,
            'appeal_approve': 0,
            'restore': 0,
            'reject': 1,
            'suspend': 1,
            'appeal_reject': 1,
            'permanent_remove': 1,
        }

        records = []
        for log in logs:
            action = log.get('adminAction') or ''
            label = ACTION_TO_LABEL.get(action)
            if label is None:
                continue  # skip ambiguous entries

            opp_id = log.get('_id')
            # Optionally fetch opportunity fields for richer training data
            opp = {}
            try:
                if opp_id:
                    opp = db.opportunities.find_one(
                        {'_id': opp_id},
                        {
                            'title': 1, 'description': 1, 'location': 1,
                            'compensationRange': 1, 'isRemote': 1,
                            'experienceLevel': 1, 'category': 1,
                            'applicationMethod': 1, 'externalLink': 1,
                        }
                    ) or {}
            except Exception:
                pass

            features = log.get('features') or {}
            records.append({
                'opportunityId': str(opp_id) if opp_id else None,
                'fraudulent': label,
                'fraudScore': log.get('fraudScore', 0),
                'classification': log.get('classification', ''),
                'adminAction': action,
                'adminFeedback': log.get('adminFeedback', ''),
                'decisionOutcome': log.get('decisionOutcome', ''),
                'decidedAt': log.get('createdAt').isoformat() + 'Z' if log.get('createdAt') else None,
                # Posting text fields
                'title': opp.get('title', ''),
                'description': opp.get('description', ''),
                'location': opp.get('location', ''),
                'category': opp.get('category', ''),
                'experienceLevel': opp.get('experienceLevel', ''),
                'isRemote': opp.get('isRemote', False),
                'applicationMethod': opp.get('applicationMethod', ''),
                # Numeric features captured at scoring time
                'title_length': features.get('title_length', 0),
                'description_length': features.get('description_length', 0),
                'fraud_pattern_count': features.get('fraud_pattern_count', 0),
                'high_severity_pattern_count': features.get('high_severity_pattern_count', 0),
                'email_count': features.get('email_count', 0),
                'phone_count': features.get('phone_count', 0),
                'contact_handle_count': features.get('contact_handle_count', 0),
                'url_count': features.get('url_count', 0),
                'uppercase_ratio': features.get('uppercase_ratio', 0),
                'word_count': features.get('word_count', 0),
                'has_unrealistic_pay': features.get('has_unrealistic_pay', 0),
                'signals': log.get('signals', []),
                'explanation': log.get('explanation', ''),
            })

        # Sanitise any remaining ObjectId / datetime values that slipped through
        import json as _json

        def _serialise(obj):
            if isinstance(obj, ObjectId):
                return str(obj)
            if isinstance(obj, datetime):
                return obj.isoformat() + 'Z'
            raise TypeError(f'Not serialisable: {type(obj)}')

        safe_records = _json.loads(_json.dumps(records, default=_serialise))

        return jsonify({
            'exportedAt': datetime.utcnow().isoformat() + 'Z',
            'days': days,
            'totalRecords': len(safe_records),
            'labelDistribution': {
                'legitimate': sum(1 for r in safe_records if r['fraudulent'] == 0),
                'fraud': sum(1 for r in safe_records if r['fraudulent'] == 1),
            },
            'records': safe_records,
        })
    except Exception as exc:
        logger.error('Training export error: %s', exc)
        return jsonify({'error': str(exc)}), 500


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'service': 'fraud-detection',
        'model_version': MODEL_VERSION,
        'last_trained_at': MODEL_LAST_TRAINED_AT,
        'model_available': MODEL_AVAILABLE,
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002, debug=True)
