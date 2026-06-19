"""
SBOUP Chatbot Microservice — Kazi (RAG + Groq)
Intelligent assistant powered by RAG and Groq's hosted LLM API.

Pipeline per request:
  1. Retrieve relevant knowledge chunks from ChromaDB (RAG)
  2. Fetch user's real profile data from MongoDB (personalisation)
  3. Load conversation history from MongoDB (memory)
  4. Build system prompt with all context injected
  5. POST to Groq /openai/v1/chat/completions for a natural language response
  6. Save the turn to conversation history
  7. Return response + suggested actions to the client
"""

import os
import sys
import logging
import time
from datetime import datetime, timezone, timedelta

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# ── Load environment ──────────────────────────────────────────────────────────
load_dotenv()

# ── Flask app ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
BASE_DIR         = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROMA_DIR       = os.path.join(BASE_DIR, "chroma_db")
KNOWLEDGE_DIR    = os.path.join(BASE_DIR, "knowledge")
COLLECTION_NAME  = "sboup_knowledge"
EMBED_MODEL_NAME = "all-MiniLM-L6-v2"
# ── Groq config — edit GROQ_MODEL here or in .env to switch models ────────────
GROQ_API_KEY  = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL    = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_API_URL  = "https://api.groq.com/openai/v1/chat/completions"
# ─────────────────────────────────────────────────────────────────────────────
MONGODB_URI   = os.getenv("MONGODB_URI", "mongodb://localhost:27017/sboup_dev")
DB_NAME       = MONGODB_URI.split("/")[-1].split("?")[0]

# Proficiency weights (mirrors matching engine)
PROFICIENCY_WEIGHT = {
    "beginner": 0.25, "intermediate": 0.50,
    "advanced": 0.75, "expert": 1.00,
}

# ── Lazy-loaded singletons ────────────────────────────────────────────────────
_embed_model   = None
_chroma_col    = None
_mongo_db      = None
_groq_ready    = False   # True once GROQ_API_KEY is confirmed present
_components_loaded = False


def _load_components():
    """Load all components once on first request."""
    global _embed_model, _chroma_col, _mongo_db, _groq_ready, _components_loaded
    if _components_loaded:
        return

    # 1. Embedding model + ChromaDB
    try:
        from sentence_transformers import SentenceTransformer
        import chromadb
        _embed_model = SentenceTransformer(EMBED_MODEL_NAME)
        client       = chromadb.PersistentClient(path=CHROMA_DIR)
        _chroma_col  = client.get_collection(COLLECTION_NAME)
        logger.info(f"RAG ready — {_chroma_col.count()} chunks indexed")
    except Exception as e:
        logger.warning(f"RAG unavailable: {e}")

    # 2. MongoDB
    try:
        from pymongo import MongoClient
        mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        mongo_client.admin.command("ping")
        _mongo_db = mongo_client[DB_NAME]
        logger.info(f"MongoDB connected: {DB_NAME}")
    except Exception as e:
        logger.warning(f"MongoDB unavailable: {e}")

    # 3. Groq — just verify the API key is set (no network call needed at startup)
    if GROQ_API_KEY and GROQ_API_KEY not in ("your-groq-api-key-here", ""):
        _groq_ready = True
        logger.info(f"Groq ready — model: {GROQ_MODEL}")
    else:
        logger.warning("GROQ_API_KEY not set — running in fallback mode")

    _components_loaded = True


# ── RAG retrieval ─────────────────────────────────────────────────────────────

def _retrieve_knowledge(query: str, n: int = 3) -> str:
    if _embed_model is None or _chroma_col is None:
        return ""
    try:
        embedding = _embed_model.encode(query).tolist()
        results   = _chroma_col.query(
            query_embeddings=[embedding],
            n_results=n,
            include=["documents", "metadatas", "distances"],
        )
        docs      = results["documents"][0]
        metadatas = results["metadatas"][0]
        distances = results["distances"][0]
        chunks = []
        for doc, meta, dist in zip(docs, metadatas, distances):
            source    = meta.get("source", "").replace(".md", "")
            relevance = round((1 - dist) * 100, 1)
            chunks.append(f"[Source: {source} | Relevance: {relevance}%]\n{doc.strip()}")
        return "\n\n---\n\n".join(chunks)
    except Exception as e:
        logger.error(f"RAG error: {e}")
        return ""


# ── User context ──────────────────────────────────────────────────────────────

def _get_user_context(user_id: str, role: str) -> str:
    if _mongo_db is None or not user_id:
        return "Guest user — no profile data available."
    try:
        from bson import ObjectId
        from bson.errors import InvalidId
        uid = ObjectId(user_id)
    except Exception:
        return "Guest user — no profile data available."

    try:
        db = _mongo_db
        if role == "skilled_worker":
            profile = db.profiles.find_one({"userId": uid})
            if not profile:
                return "Worker has not created a profile yet."

            pid    = profile["_id"]
            skills = list(db.profileskills.find({"profileId": pid}))
            skill_names = []
            for ps in skills:
                sk = db.skills.find_one({"_id": ps["skillId"]})
                if sk:
                    skill_names.append(
                        f"{sk['skillName']} ({ps.get('proficiencyLevel','beginner')})"
                    )

            exps      = list(db.experiences.find({"profileId": pid}))
            total_exp = sum(e.get("durationMonths", 0) or 0 for e in exps)

            apps       = list(db.applications.find({"profileId": pid})
                              .sort("submittedAt", -1).limit(5))
            total_apps = db.applications.count_documents({"profileId": pid})
            shortlisted = db.applications.count_documents({
                "profileId": pid,
                "status": {"$in": ["shortlisted", "offer_extended"]}
            })

            app_lines = []
            for a in apps:
                opp = db.opportunities.find_one({"_id": a["opportunityId"]},
                                                {"title": 1})
                title = opp.get("title", "Unknown") if opp else "Unknown"
                app_lines.append(
                    f"  - {title} | {a.get('status','submitted')} | "
                    f"match: {a.get('matchScore',0)}%"
                )

            # Completeness
            weights = {
                "title":      (0.15, bool(profile.get("title"))),
                "bio":        (0.10, bool(profile.get("bio"))),
                "location":   (0.10, bool(profile.get("location"))),
                "skills":     (0.25, len(skills) > 0),
                "experience": (0.25, len(exps) > 0),
                "portfolio":  (0.15, len(profile.get("portfolioItems", [])) > 0),
            }
            completeness = sum(w for w, present in weights.values() if present)
            missing = [s for s, (_, present) in weights.items() if not present]

            lps = list(db.learningpaths.find({"userId": uid, "status": "active"}).limit(3))
            lp_lines = [f"  - {lp['targetSkill']} ({lp.get('progress',0)}%)" for lp in lps]

            return f"""=== Worker Profile ===
Name          : {profile.get('title','Not set')}
Location      : {profile.get('location','Not set')}
Bio           : {(profile.get('bio') or 'Not set')[:150]}
Completeness  : {int(completeness*100)}%
Missing       : {', '.join(missing) if missing else 'None'}
Skills        : {', '.join(skill_names) if skill_names else 'None added yet'}
Experience    : {total_exp} months across {len(exps)} entries
Applications  : {total_apps} total, {shortlisted} shortlisted
Recent apps   :
{chr(10).join(app_lines) if app_lines else '  None yet'}
Learning paths:
{chr(10).join(lp_lines) if lp_lines else '  None active'}
"""

        elif role == "employer":
            postings = list(db.opportunities.find(
                {"postedByUserId": uid, "status": "published"},
                {"title": 1, "category": 1, "applicationCount": 1, "location": 1}
            ).sort("createdAt", -1).limit(5))
            total_apps = sum(p.get("applicationCount", 0) for p in postings)
            posting_lines = "\n".join(
                f"  - {p.get('title','')} ({p.get('category','')}) | "
                f"{p.get('applicationCount',0)} apps"
                for p in postings
            ) or "  None"
            return f"""=== Employer Profile ===
Active postings    : {len(postings)}
Total applications : {total_apps}
Recent postings:
{posting_lines}
"""
    except Exception as e:
        logger.error(f"User context error: {e}")
        return "Could not load user context."

    return "Unknown role."


# ── Conversation memory ───────────────────────────────────────────────────────

def _get_history(user_id: str, limit: int = 10) -> list:
    if _mongo_db is None or not user_id:
        return []
    try:
        from bson import ObjectId
        uid = ObjectId(user_id)
        doc = _mongo_db.chatconversations.find_one({"userId": uid}, {"messages": 1})
        if not doc:
            return []
        recent = doc.get("messages", [])[-limit:]
        return [{"role": m["role"], "content": m["content"]} for m in recent]
    except Exception:
        return []


def _save_turn(user_id: str, user_msg: str, asst_msg: str):
    if _mongo_db is None or not user_id:
        return
    try:
        from bson import ObjectId
        uid = ObjectId(user_id)
        now = datetime.now(timezone.utc)
        _mongo_db.chatconversations.update_one(
            {"userId": uid},
            {
                "$push": {"messages": {"$each": [
                    {"role": "user",      "content": user_msg,  "timestamp": now},
                    {"role": "assistant", "content": asst_msg,  "timestamp": now},
                ]}},
                "$set":         {"updatedAt": now},
                "$setOnInsert": {"userId": uid, "createdAt": now},
            },
            upsert=True,
        )
    except Exception as e:
        logger.error(f"Memory save error: {e}")


# ── System prompts — one per role ────────────────────────────────────────────
# Edit these to customise Kazi's personality and scope per role.

SYSTEM_PROMPT_WORKER = """You are Kazi, the intelligent assistant for SBOUP \
(Skills-Based Opportunity Unleashing Platform) — a job marketplace in Uganda \
and East Africa.

You are talking to a SKILLED WORKER. Your role:
- Help them find job opportunities that match their skills.
- Help them improve their profile, understand their match scores, and upskill.
- Help them generate CVs and track their applications.
- Give personalised advice based on their actual profile data below.

Rules:
- Always be warm, encouraging, and professional.
- Keep responses concise: 2–4 sentences for simple questions, more for complex ones.
- When their match score is low, explain why and suggest specific improvements.
- When their profile is incomplete, tell them exactly what section to add.
- Respond in the same language the user writes in.
- Do not answer questions unrelated to work, jobs, skills, or the SBOUP platform.

Platform context: Compensation in UGX. \
Job types: formal, contract, freelance, apprenticeship.

--- WORKER PROFILE ---
{user_context}

--- RELEVANT PLATFORM KNOWLEDGE ---
{knowledge_context}
"""

SYSTEM_PROMPT_EMPLOYER = """You are Kazi, the intelligent assistant for SBOUP \
(Skills-Based Opportunity Unleashing Platform) — a job marketplace in Uganda \
and East Africa.

You are talking to an EMPLOYER. Your role:
- Help them post and manage job opportunities effectively.
- Help them review applications and identify the best-matched candidates.
- Help them understand applicant match scores and shortlisting.
- Help them write better job descriptions to attract the right talent.
- Answer questions about the platform from an employer's perspective.
- Give personalised advice based on their actual postings and application data below.

Rules:
- Always be professional, direct, and helpful.
- Keep responses concise: 2–4 sentences for simple questions, more for complex ones.
- When they ask about candidates, refer to their actual application data.
- Never give worker-focused advice (CV generation, skill gaps, etc.) to an employer.
- Respond in the same language the user writes in.
- Do not answer questions unrelated to hiring, jobs, or the SBOUP platform.

Platform context: Compensation in UGX. \
Job types: formal, contract, freelance, apprenticeship.

--- EMPLOYER DATA ---
{user_context}

--- RELEVANT PLATFORM KNOWLEDGE ---
{knowledge_context}
"""

def _build_system_prompt(user_role: str, user_context: str, knowledge_context: str) -> str:
    """Select and fill the correct system prompt based on the user's role."""
    template = (
        SYSTEM_PROMPT_EMPLOYER if user_role == "employer"
        else SYSTEM_PROMPT_WORKER
    )
    return template.format(
        user_context=user_context or "No data available.",
        knowledge_context=knowledge_context or "No relevant knowledge found.",
    )


# ── LLM call ──────────────────────────────────────────────────────────────────

def _call_groq(system_prompt: str, history: list, message: str, role: str = "skilled_worker") -> str:
    """
    POST to Groq's OpenAI-compatible chat endpoint and return the reply.

    Endpoint : POST https://api.groq.com/openai/v1/chat/completions
    Auth     : Bearer token from GROQ_API_KEY
    Messages : [{"role": "system"|"user"|"assistant", "content": str}, ...]
    """
    if not _groq_ready:
        return _fallback(message, role)

    try:
        import requests as _req

        # Build the messages array — same format as OpenAI
        messages = [{"role": "system", "content": system_prompt}]
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": message})

        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type":  "application/json",
        }
        payload = {
            "model":       GROQ_MODEL,
            "messages":    messages,
            "temperature": 0.4,
            "max_tokens":  500,
        }

        resp = _req.post(GROQ_API_URL, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()

        return resp.json()["choices"][0]["message"]["content"].strip()

    except Exception as e:
        logger.error(f"Groq error: {e}")
        return _fallback(message, role)


def _fallback(message: str, role: str = "skilled_worker") -> str:
    msg = message.lower()
    if role == "employer":
        if any(w in msg for w in ["hello", "hi", "hey"]):
            return ("Hello! I'm Kazi, your SBOUP employer assistant. I can help you "
                    "post jobs, review applications, and find top candidates. "
                    "What would you like to do?")
        if any(w in msg for w in ["application", "applicant", "candidate"]):
            return ("Go to My Jobs → View Applications to see all applicants for your "
                    "postings, ranked by match score. You can shortlist or message "
                    "candidates directly from there.")
        if any(w in msg for w in ["post", "job", "opportunit"]):
            return ("Click 'Post Job' in the top navigation to create a new opportunity. "
                    "Add required skills, compensation range, and deadline to attract "
                    "the best-matched candidates.")
        if any(w in msg for w in ["shortlist", "hire", "offer"]):
            return ("Open an application and click 'Shortlist' to move a candidate forward. "
                    "You can then extend an offer or schedule an interview from the "
                    "application detail page.")
        return ("I'm having a small issue right now. Please try again in a moment, "
                "or visit the Help section for support.")
    # Worker fallback
    if any(w in msg for w in ["hello", "hi", "hey"]):
        return ("Hello! I'm Kazi, your SBOUP assistant. I can help you find "
                "opportunities, improve your profile, generate CVs, and more. "
                "What would you like to do?")
    if any(w in msg for w in ["match", "score"]):
        return ("Your match score shows how well your skills fit a job. "
                "Skill overlap is the most important factor — add more skills "
                "to your profile to improve your scores.")
    if any(w in msg for w in ["profile", "complete"]):
        return ("A complete profile gets better match scores. Make sure you "
                "have a title, bio, location, skills, experience, and portfolio.")
    if any(w in msg for w in ["cv", "resume"]):
        return ("Go to Dashboard → Generate CV to create a tailored CV from "
                "your profile data. Choose Professional or Modern template.")
    if any(w in msg for w in ["skill", "learn", "upskill"]):
        return ("Visit the Upskill section to see your skill gaps and get "
                "recommended free learning resources to close them.")
    if any(w in msg for w in ["apply", "application", "job"]):
        return ("Browse opportunities in the Discover Jobs tab. Each job shows "
                "your match %. Tap Quick Apply to submit instantly.")
    if any(w in msg for w in ["fraud", "scam", "suspicious", "report"]):
        return ("Tap the Report button on any suspicious posting. Our AI screens "
                "all postings automatically and community reports are reviewed "
                "within 24 hours.")
    return ("I'm having a small issue right now. Please try again in a moment, "
            "or visit the Help section for support.")


def _suggested_actions(message: str, role: str) -> list:
    msg = message.lower()
    if role == "employer":
        return ["Post Opportunity", "View Applications", "Find Candidates"]
    if any(w in msg for w in ["cv", "resume"]):
        return ["Generate CV", "View My CVs", "Edit Profile"]
    if any(w in msg for w in ["skill", "learn", "upskill", "gap"]):
        return ["View Skill Gaps", "Browse Courses", "Edit Skills"]
    if any(w in msg for w in ["match", "score", "opportunit", "job"]):
        return ["Browse Jobs", "My Applications", "Improve Profile"]
    if any(w in msg for w in ["profile", "complete", "bio"]):
        return ["Edit Profile", "Add Skills", "Add Experience"]
    return ["Find Opportunities", "Build Profile", "Generate CV"]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.before_request
def _startup():
    if not _components_loaded:
        _load_components()


@app.route('/api/chatbot/query', methods=['POST'])
def process_query():
    """Main chat endpoint — replaces the old pattern-matching handler."""
    try:
        data      = request.get_json(force=True, silent=True) or {}
        query     = (data.get('query') or '').strip()
        user_id   = (data.get('userId') or '').strip()
        user_role = (data.get('userRole') or 'skilled_worker').strip()

        if not query:
            return jsonify({
                'response':         "Please type a question and I'll help you!",
                'intent':           None,
                'suggestedActions': ['Find Opportunities', 'Build Profile', 'Generate CV'],
                'fallback':         True,
            })

        t0 = time.time()

        # Pipeline
        knowledge_context = _retrieve_knowledge(query)
        user_context      = _get_user_context(user_id, user_role)
        history           = _get_history(user_id)

        system_prompt = _build_system_prompt(user_role, user_context, knowledge_context)

        response_text = _call_groq(system_prompt, history, query, user_role)

        if user_id and response_text:
            _save_turn(user_id, query, response_text)

        latency_ms = int((time.time() - t0) * 1000)
        logger.info(f"Query: '{query[:60]}' | {latency_ms}ms | user={user_id or 'guest'}")

        return jsonify({
            'response':         response_text,
            'intent':           None,
            'suggestedActions': _suggested_actions(query, user_role),
            'fallback':         (not _groq_ready),
            'latency_ms':       latency_ms,
        })

    except Exception as e:
        logger.error(f"Chatbot error: {e}", exc_info=True)
        return jsonify({
            'response':         "I'm having a small issue right now. Please try again!",
            'intent':           None,
            'suggestedActions': ['Find Opportunities', 'Build Profile', 'Help'],
            'fallback':         True,
        }), 500


@app.route('/api/chatbot/history', methods=['DELETE'])
def clear_history():
    """Clear a user's conversation history (called on logout or chat reset)."""
    try:
        data    = request.get_json(force=True, silent=True) or {}
        user_id = (data.get('userId') or '').strip()
        if not user_id:
            return jsonify({'success': False, 'message': 'userId is required'}), 400
        if _mongo_db is None:
            return jsonify({'success': False, 'message': 'Database unavailable'}), 503
        from bson import ObjectId
        _mongo_db.chatconversations.delete_one({'userId': ObjectId(user_id)})
        return jsonify({'success': True, 'message': 'History cleared'})
    except Exception as e:
        logger.error(f"Clear history error: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status':  'ok',
        'service': 'chatbot-service',
        'components': {
            'rag':     'ready' if _chroma_col is not None else 'not loaded',
            'llm':     f'ready ({GROQ_MODEL})' if _groq_ready else 'fallback mode',
            'mongodb': 'connected' if _mongo_db is not None else 'offline',
        },
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5005, debug=True)
