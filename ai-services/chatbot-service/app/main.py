"""
SBOUP Chatbot Microservice
NLP-based conversational assistant for user guidance.
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import re
import os
import logging

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Knowledge base - FAQ responses
KNOWLEDGE_BASE = {
    'greeting': {
        'patterns': [r'\b(hello|hi|hey|good morning|good afternoon)\b'],
        'response': "Hello! I'm your SkillBridge assistant. I can help you with navigating the platform, finding opportunities, building your profile, generating CVs, and more. What would you like to do?",
    },
    'register': {
        'patterns': [r'\b(register|sign up|create account|join)\b'],
        'response': "To register, tap 'Create Account', fill in your name, email, and phone number, select your role (Skilled Worker or Employer), add your location, and tap 'Next'. You'll receive a verification email to activate your account.",
    },
    'profile': {
        'patterns': [r'\b(profile|edit profile|update profile|add skills)\b'],
        'response': "To build your profile, go to the Profile tab and tap 'Edit about me'. Add your professional title, bio, skills (primary and secondary), work experience, education, and personality traits. A complete profile improves your match scores!",
    },
    'opportunities': {
        'patterns': [r'\b(find job|search job|discover|opportunities|browse)\b'],
        'response': "Go to the 'Discover Jobs' tab to browse opportunities. Use the search bar to find specific roles, and apply filters like location, category, or personality traits. Each opportunity shows your match percentage. Tap 'Quick Apply' to apply instantly!",
    },
    'apply': {
        'patterns': [r'\b(apply|application|submit|quick apply)\b'],
        'response': "To apply for an opportunity: open the job details, review your match score, tap 'Quick Apply' or the apply button, attach your CV and cover letter, then submit. You can track your applications from your dashboard.",
    },
    'cv': {
        'patterns': [r'\b(cv|resume|generate cv|tailored cv)\b'],
        'response': "Generate a tailored CV by going to 'Generate CV' from your dashboard. Select which profile data to include (experience, skills, personality traits), choose a template (Professional or Modern), then tap 'Generate Preview'. Your CV will be optimized for the opportunities you're targeting!",
    },
    'learning': {
        'patterns': [r'\b(learn|upskill|course|skill gap|training)\b'],
        'response': "The Upskill section identifies your skill gaps and recommends free or affordable learning resources. When you see a 'Bridge' button next to a missing skill, tap it to start a personalized learning path. Completing courses improves your match scores!",
    },
    'matching': {
        'patterns': [r'\b(match score|compatibility|recommendation)\b'],
        'response': "Your Match Score shows how well your skills and experience align with an opportunity. It's based on skill similarity (50%), experience relevance (25%), and patterns from similar workers (25%). Building your profile and completing learning paths will improve your scores.",
    },
    'messaging': {
        'patterns': [r'\b(message|chat|contact employer|inbox)\b'],
        'response': "You can message employers through the Messaging Hub. Open your inbox to see conversations, or go to an application to message the employer directly. You can attach documents up to 10MB.",
    },
    'fraud': {
        'patterns': [r'\b(fraud|scam|suspicious|report|fake)\b'],
        'response': "If you encounter a suspicious posting, tap the 'Report' button and select a reason. Our AI system automatically screens postings, and community reports help us remove harmful content quickly. Never share personal banking details with anyone on the platform.",
    },
    'help': {
        'patterns': [r'\b(help|support|assist|how to)\b'],
        'response': "I can help with: profile setup, finding opportunities, generating CVs, learning new skills, messaging, and understanding match scores. What would you like to know more about?",
    },
}


def identify_intent(query):
    """NLP-based intent identification using pattern matching."""
    query_lower = query.lower()
    best_match = None
    best_score = 0

    for intent, data in KNOWLEDGE_BASE.items():
        for pattern in data['patterns']:
            if re.search(pattern, query_lower):
                match_score = len(pattern)
                if match_score > best_score:
                    best_score = match_score
                    best_match = intent

    return best_match


@app.route('/api/chatbot/query', methods=['POST'])
def process_query():
    """Process user query and return response."""
    try:
        data = request.json
        query = data.get('query', '')
        user_id = data.get('userId', '')

        if not query:
            return jsonify({'response': "Please type a question and I'll help you!", 'intent': None})

        intent = identify_intent(query)

        if intent:
            response = KNOWLEDGE_BASE[intent]['response']
        else:
            response = "I'm not sure I understand that question. I can help you with: registering, building your profile, finding opportunities, generating CVs, learning new skills, or understanding match scores. Could you rephrase your question?"

        return jsonify({
            'response': response,
            'intent': intent,
            'suggestedActions': get_suggested_actions(intent),
        })
    except Exception as e:
        logger.error(f"Chatbot error: {e}")
        return jsonify({
            'response': "I'm having a small issue right now. Please try again or submit a support ticket.",
            'fallback': True,
        }), 500


def get_suggested_actions(intent):
    """Return quick-action buttons based on detected intent."""
    actions = {
        'greeting': ['Find Opportunities', 'Build Profile', 'Generate CV'],
        'profile': ['Edit Profile', 'Add Skills', 'View Dashboard'],
        'opportunities': ['Browse Jobs', 'My Applications', 'Recommended for Me'],
        'cv': ['Generate CV', 'View My CVs', 'Edit Profile'],
        'learning': ['View Skill Gaps', 'Browse Courses', 'My Learning Paths'],
    }
    return actions.get(intent, ['Find Opportunities', 'Build Profile', 'Help'])


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'chatbot-service'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5005, debug=True)
