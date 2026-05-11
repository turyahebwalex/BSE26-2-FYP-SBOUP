# Claude Code Prompt: Fully Implement the SBOUP Learning Engine AI Service

> Paste this entire file (or its contents) into a Claude Code session opened **at the repo root** of `BSE26-2-FYP-SBOUP`. It instructs Claude Code to rebuild `ai-services/learning-engine` from a thin Flask MVP into a production-grade FastAPI AI microservice that mirrors the architecture, quality bar, and integration shape already established by `ai-services/cv-generation`, while honouring every requirement in the SDD.

---

## 1. Mission

You are completing the **Continuous and Adaptive Learning Module** described in the SBOUP Software Design Document (SDD §3.2.5, §5.4) and the Component Design (SDD §5.4 — `GenerateLearningPath` algorithm). The current `ai-services/learning-engine/` directory contains only a minimal Flask scaffold (`app/main.py`) with hard-coded resources. Your job is to **rewrite it end-to-end** so that:

1. It is structurally identical (folders, layering, conventions, error envelopes, lifespan, rate-limiting, internal-API-key auth, MongoDB access, storage, pre-loaded ML models, tests, Dockerfile resilience patterns) to `ai-services/cv-generation/`.
2. It implements the exact algorithmic pipeline mandated by SDD §3.2.5 and §5.4 — Skill Gap Analyser → Learning Resource Aggregator → Progress Tracker — as separate, testable components.
3. It integrates without breaking anything already wired up in `server/src/services/ml.service.js`, `server/src/controllers/learning.controller.js`, `server/src/routes/learning.routes.js`, `server/src/models/LearningPath.js`, the `LEARNING_SERVICE_URL` env var on the Node.js server, and the `learning-engine` block in `docker-compose.yml`.
4. It is **a core AI service**, not an LLM wrapper or a YouTube proxy. It loads three Hugging Face models at startup and uses each of them for a job no rule-based path can do: (a) **MiniLM (sentence-transformers/all-MiniLM-L6-v2)** powers semantic resource ranking AND the synonym-tolerant skill matcher AND the semantic Dashboard Fit; (b) **Flan-T5-small** powers the §6.2.4 "WHY THIS COURSE?" per-resource rationale and the pathway header (and serves as a fallback for the skill extractor); (c) **Skill NER (jjzha/escoxlmr_skill_extraction)** mines `Profile.bio` for undeclared skills and tags `bridgesSkill` on provider responses that don't declare it. Around these three models the service still has deterministic engineering — weighted scoring math, batched embeddings, foundational-first ordering, ProfileSkill upserts, matching-engine feedback — but every place where string-matching would systematically fail informal workers in Uganda has been replaced with semantic AI.

You MUST treat `ai-services/cv-generation/` as the **reference implementation**. Read every file there first, internalise the patterns, then mirror them.

**Do not** introduce new architectural ideas the cv-generation service does not already use. Consistency across the two services is a hard requirement.

---

## 2. Required reading before you write a single line

Read these files in full before designing your changes. They define the conventions you must mirror:

- `ai-services/cv-generation/main.py` — FastAPI entry, exception handlers, internal API key check, rate limiter, lifespan, structured error envelope.
- `ai-services/cv-generation/config.py` — Env loading pattern (graceful dotenv import, `_get`/`_get_int` helpers).
- `ai-services/cv-generation/database/mongo_client.py` — Lazy Motor singleton.
- `ai-services/cv-generation/services/ai_model_manager.py` — Singleton model holder, `lifespan` async context manager, `models_loaded` flag, best-effort secondary-model load.
- `ai-services/cv-generation/services/cv_generator.py` — Top-level orchestrator with numbered steps that map 1:1 to SDD pseudocode, custom error class with `code`/`message`/`status`.
- `ai-services/cv-generation/services/profile_service.py` — MongoDB aggregation pattern, ObjectId helpers, dataclass assembly.
- `ai-services/cv-generation/services/keyword_extractor.py` — Validate AI output against the canonical Mongo collection (`skills`).
- `ai-services/cv-generation/services/semantic_ranker.py` — `sentence-transformers` cosine ranking with graceful fallback.
- `ai-services/cv-generation/services/storage_service.py` — local/S3 backend split, error class.
- `ai-services/cv-generation/models/db_models.py` & `request_models.py` — Dataclass + Pydantic separation.
- `ai-services/cv-generation/Dockerfile` — BuildKit pip cache, retry loop, best-effort preload, non-fatal HF DNS check, `network: host` build arg.
- `ai-services/cv-generation/scripts/preload_models.py` — Pre-flight DNS check, `FAIL_FAST`, per-model try/except.
- `ai-services/cv-generation/conftest.py` and `ai-services/cv-generation/tests/test_cv_generator.py` — How orchestrator-level tests mock async I/O.
- `ai-services/cv-generation/.env.example` and `ai-services/cv-generation/requirements.txt`.

Also read (do not modify, only consume the contracts):

- `server/src/services/ml.service.js` — Currently calls `${LEARNING_SERVICE_URL}/api/learning/generate` with `{ userId, targetSkill, opportunityId }`. Your new service MUST keep accepting this exact body shape on `POST /api/learning/generate`.
- `server/src/controllers/learning.controller.js` — Reads `response.data.resources`. Your response payload MUST keep that shape (an array of resource objects).
- `server/src/models/LearningPath.js` — Resource schema: `{ title, url, provider, cost, estimatedDuration, type, isCompleted }` where `type` ∈ `{video, course, article, tutorial}`. Your resources MUST conform.
- `server/src/models/Skill.js`, `ProfileSkill.js`, `Profile.js`, `Opportunity.js` — The Mongo collections you read (`skills`, `profileskills`, `profiles`, `opportunities`).
- `docker-compose.yml` — `learning-engine` block. You will adjust env vars here to match the new `config.py`.
- The full SDD PDF — pay particular attention to §3.2.5 (Continuous and Adaptive Learning Module), §5.4 (`GenerateLearningPath` pseudocode), §3.2.3 (Matching Module — your service must surface skill gaps the matching engine could not close), and §6.2.4 (the Upskill UI screen wireframe — the data your service returns drives that screen).

---

## 3. SDD requirements you must satisfy

These are direct quotes / paraphrases from the SDD that constrain your design. Each must be traceable to code you write.

| SDD Ref | Requirement | Where you implement it |
|---|---|---|
| Mobile Match Breakdown card consistency | The "Skills you are missing" chips on the Discover/OpportunityDetail breakdown card come from the matching-engine. The learning-engine's pathways MUST target the same skill names — no semantic-match, no NER, no bio-mining may add, drop, or rename a skill in the missing list when an `opportunityId` is in scope | `services/match_consumer.py` calls `${MATCHING_SERVICE_URL}/api/match/score` first; its `missingSkills[]` is the authoritative input to the resource aggregator. Semantic/NER intelligence runs in parallel and surfaces as a separate `aliasHints[]` array. Detailed in §6.0. |
| §3.2.5 | Three sub-components: **Skill Gap Analyser**, **Learning Resource Aggregator**, **Progress Tracker** | Three modules under `services/`: `skill_gap_analyser.py`, `resource_aggregator.py`, `progress_tracker.py` |
| §3.2.5 / cv-gen parity | **Semantic skill matching** so synonyms (bricklaying↔masonry), regional variants (joiner↔carpenter), and granularity drift (Python↔Pandas/NumPy) do not leak through as false gaps | `skill_gap_analyser.semantic_match()` using MiniLM cosine similarity ≥ `SEMANTIC_MATCH_THRESHOLD` (0.75) before declaring a required skill missing |
| §6.2.4 UI ("WHY THIS COURSE?") | Per-resource plain-language rationale **and** an overall pathway explanation telling the worker why this sequence was chosen for *their* profile | `services/explanation_generator.py` — mirrors `cv-generation/services/summary_generator.py` (Flan-T5 + filler denylist + deterministic fact-pack fallback). Two functions: `explain_resource()` and `explain_pathway()` |
| §3.2.5 / cv-gen parity | **Skill NER over `Profile.bio` and resource descriptions** — informal workers describe skills in prose without adding them as structured `ProfileSkill` rows; provider responses rarely declare the skill a resource teaches | `services/skill_extractor.py` — mirrors `cv-generation/services/keyword_extractor.py`. Loads `jjzha/escoxlmr_skill_extraction`. Two entry points: `extract_from_bio()` augments the worker's effective skill set at request time, `extract_resource_skill()` tags `bridgesSkill` for provider results that lack it. Validates spans against the canonical `skills` collection. |
| §6.2.4 dashboard fit | **Dashboard Fit must use semantic similarity, not exact-name matching** — informal workers' self-described skills rarely match category vocabulary exactly, so an exact-match ratio under-reports fit and hides categories the worker is actually a near-fit for | `taxonomy_service.compute_category_fit()` rewritten in §6.5 to use the same batched MiniLM cosine pattern as the gap analyser |
| §3.2.5 | The dashboard surfaces **categories the worker fits** AND the **specific missing skills** for each | New endpoint `POST /api/learning/dashboard-fit` returning `{ fittingCategories: [{category, fitScore, missingSkills:[…] }] }` |
| §3.2.5 | Compute a **skill deficit vector** (missing skills + missing proficiency levels) | `skill_gap_analyser.compute_skill_deficit()` — returns both missing skills and proficiency-shortfall on already-held skills |
| §3.2.5 | Query integrated platforms: **YouTube Data API v3** and **MOOC providers** | `resource_aggregator/youtube_provider.py`, `resource_aggregator/coursera_provider.py`, `resource_aggregator/edx_provider.py`, `resource_aggregator/curated_provider.py` (catalog fallback) |
| §3.2.5 | **Filter by relevance, cost (prioritising free), learner ratings, completion rates** | `resource_aggregator.rank_and_filter()` — implements the explicit scoring rule below |
| §3.2.5 | Assemble a sequence **foundational → advanced** | `resource_aggregator.order_pathway()` — sort by (difficulty asc, relevance desc) within each missing skill |
| §3.2.5 | Progress Tracker updates **`ProfileSkill` entries** when resources complete | `progress_tracker.mark_resource_completed()` upserts `profileskills` and emits a `learningprogress` audit doc |
| §3.2.5 | Updated skills **feed back into the matching engine** so match scores improve | The matching-engine reads `profileskills` from Mongo on every `score` / `recommendations` call (it has no cache). The feedback loop therefore closes via the database: `progress_tracker.mark_resource_completed()` upserts `profileskills`, and the very next matching-engine call reflects the new skill state. `services/matching_feedback.py` is kept as a thin hook (logs the upsert) so a future explicit cache-invalidation endpoint on the matching-engine can be wired without touching the learning-engine again. **Do NOT** POST to `/api/match/recommendations/refresh/{userId}` — that endpoint does not exist on the matching-engine. |
| §5.4 Algo | Step 1: **Validate input**; Step 2: **Identify missing skills**; Step 3: **Retrieve learning resources** (top 3 per skill); Step 4: **Rank** by `0.7 × relevance + 0.3 × difficulty`; Step 5: **Store** in `SkillGapLog`; Step 6: **Return** | Each step is a numbered comment block in `services/learning_path_generator.py` |
| §3.2.5 | Pathway **stored in MongoDB** | `LearningPath` collection (Node.js owns it), but this service ALSO writes a `skillgaplogs` collection per SDD §5.4 step 5 |
| §4.1 (data) | `LearningPath` carries: `targetSkill`, ordered `resources[]`, `progress`, `status`, `createdAt` | Already enforced by the Node.js Mongoose model — your service must return data shaped to fit |
| §3.3 (rationale) | Service must be **independently deployable, retrainable** | Same Dockerfile resilience patterns as cv-generation; ML model handles loaded once at lifespan startup |
| §6.2.4 | UI shows: gap analysis (e.g. "3 critical gaps"), a chosen learning path, course price/rating, "Bridge a skill gap" CTA | Response schemas include `analysisSummary`, `criticalGapCount`, per-resource `rating`, `priceLabel`, and a `bridgesSkill` field |
| §7 Reqs Matrix | **CAL001** ML-based skill gap, **CAL002** personalised paths, **CAL003** prioritise free, **CAL004** track progress | Each requirement ID must appear as a comment in the corresponding module |

---

## 4. Concrete deliverables — file tree to produce

Replace the contents of `ai-services/learning-engine/` with the following structure. Delete files not on this list (the empty `app/`, `data/`, `models/` placeholder folder; the old `app/main.py`; `run.py`; the obsolete `tests/test_app.py`).

```
ai-services/learning-engine/
├── .env.example
├── .gitignore                      # mirror cv-generation if not present
├── Dockerfile
├── README.md                       # short — link back to SDD §3.2.5
├── conftest.py
├── config.py
├── main.py
├── pyrightconfig.json              # mirror cv-generation
├── pytest.ini
├── requirements.txt
├── database/
│   ├── __init__.py
│   └── mongo_client.py
├── models/
│   ├── __init__.py
│   ├── db_models.py                # dataclasses: WorkerSkillState, SkillGap, ResourceCandidate, LearningPathDraft, OpportunityFit, CategoryFit
│   └── request_models.py           # Pydantic: GenerateLearningPathRequest, AnalyseSkillGapsRequest, DashboardFitRequest, ProgressUpdateRequest, *Response, ErrorResponse, HealthResponse
├── services/
│   ├── __init__.py
│   ├── ai_model_manager.py         # singleton holder for THREE models: MiniLM (required), Flan-T5-small (required for explanations, graceful), Skill NER jjzha/escoxlmr_skill_extraction (best-effort, falls through to Flan-T5 prompt extraction when unavailable — same pattern as cv-generation)
│   ├── skill_gap_analyser.py       # §3.2.5 Skill Gap Analyser — exact-match THEN semantic-match (MiniLM); profile is augmented with NER-mined bio skills before the comparison
│   ├── skill_extractor.py          # §6.7 Skill NER over Profile.bio AND resource title+description, validated against canonical Skill catalog (twin of cv-generation/services/keyword_extractor.py)
│   ├── learning_path_generator.py  # §5.4 GenerateLearningPath orchestrator (numbered steps)
│   ├── explanation_generator.py    # §6.2.4 "WHY THIS COURSE?" — per-resource + pathway rationales (Flan-T5 + fallback)
│   ├── progress_tracker.py         # §3.2.5 Progress Tracker
│   ├── profile_service.py          # MongoDB reads: profile, skills, opportunities, taxonomy
│   ├── taxonomy_service.py         # opportunity-category → required-skill rollup for dashboard fit
│   ├── match_consumer.py           # §6.0 — calls matching-engine /api/match/score; SOURCE OF TRUTH for missingSkills on opportunity-driven requests
│   ├── matching_feedback.py        # Thin hook called after progress updates. Today: just logs the profileskills upsert (matching-engine reads Mongo fresh, so feedback closes via DB). Future: HTTP cache-invalidation when the matching-engine adds an endpoint.
│   └── resource_aggregator/
│       ├── __init__.py             # exposes aggregate(skill, level) → list[ResourceCandidate]
│       ├── base.py                 # Provider Protocol + ResourceCandidate normalisation + ranking math
│       ├── youtube_provider.py     # YouTube Data API v3 (httpx async, key from env, gracefully disabled)
│       ├── coursera_provider.py    # Coursera public catalog API (read-only, free-content filter)
│       ├── edx_provider.py         # edX public catalog API
│       └── curated_provider.py     # JSON file fallback under data/curated_resources.json
├── data/
│   └── curated_resources.json      # offline fallback catalog seeded with realistic free resources
├── scripts/
│   ├── __init__.py
│   └── preload_models.py           # mirror cv-generation pattern (DNS pre-flight, FAIL_FAST, best-effort)
└── tests/
    ├── __init__.py
    ├── test_api.py                 # endpoint smoke tests
    ├── test_skill_gap_analyser.py  # MUST cover the semantic-match path (synonyms, threshold boundary)
    ├── test_resource_aggregator.py # mocks every provider
    ├── test_learning_path_generator.py  # orchestrator end-to-end with mocks (mirror test_cv_generator.py)
    ├── test_explanation_generator.py    # bio-rule analogue, filler denylist, fact-pack fallback when LLM unavailable
    ├── test_skill_extractor.py     # NER pipeline mocked; assert canonical-catalog validation, dedupe, graceful fallback when model is None
    ├── test_match_consumer.py      # httpx.MockTransport — assert successful path, 5xx fallback, network-error fallback, timeout fallback
    └── test_progress_tracker.py
```

---

## 5. API surface — exactly these routes

All routes return the structured envelope used by cv-generation. Errors always look like `{ "error": "CODE", "message": "..." }`. All routes accept the `X-Internal-API-Key` header and enforce it when `INTERNAL_API_KEY` is non-empty (copy `_check_internal_key` from cv-generation verbatim).

### 5.1 `GET /health`

```json
{ "status": "ok", "models_loaded": true }
```

### 5.2 `POST /api/learning/generate`  *(must remain backward compatible)*

Request:

```json
{
  "userId": "<ObjectId string>",
  "targetSkill": "Python",            // optional — direct request mode
  "opportunityId": "<ObjectId string>" // optional — opportunity-driven mode
}
```

Exactly one of `targetSkill` or `opportunityId` must be provided. If both, `opportunityId` wins and `targetSkill` is treated as a hint.

Response:

```json
{
  "ok": true,
  "data": {
    "consistencyMode": "matching-engine",
    "targetSkill": "JavaScript",
    "missingSkills": ["JavaScript"],
    "criticalGapCount": 1,
    "matchBreakdown": {
      "matchScore": 35.0,
      "cosineScore": 30.1,
      "locationMatch": false,
      "salaryFit": false,
      "expFit": false,
      "skillOverlap": 1,
      "skillGap": 1,
      "modelUsed": "ml",
      "shortlistProbability": 0.18
    },
    "aliasHints": [
      {
        "missingSkill": "Masonry",
        "youMayAlreadyHave": "Bricklaying",
        "similarity": 0.81,
        "suggestion": "Add 'Masonry' to your skills profile to update your match score."
      }
    ],
    "analysisSummary": "1 of 2 required skills missing. Bridge JavaScript to lift the breakdown card's overall match.",
    "pathwayRationale": "Two-sentence Flan-T5 explanation tying the chosen sequence to the worker's existing skills and target role. Falls through to a deterministic fact-pack sentence when the LLM is unavailable. Drives the §6.2.4 dashboard's pathway header.",
    "resources": [
      {
        "title": "...",
        "url": "...",
        "provider": "YouTube",
        "cost": 0,
        "priceLabel": "Free",
        "estimatedDuration": "3h",
        "type": "video",
        "rating": 4.7,
        "difficultyLevel": "beginner",
        "relevanceScore": 0.84,
        "finalScore": 0.82,
        "bridgesSkill": "Pandas",
        "whyThisCourse": "One-to-two sentence Flan-T5 rationale: 'You've mastered Python basics; this course bridges to Pandas, the missing requirement for the Senior Data Analyst role.' Drives the §6.2.4 'WHY THIS COURSE?' panel verbatim.",
        "isCompleted": false
      }
    ],
    "skillGapLogId": "<ObjectId string>"
  }
}
```

The `resources[]` shape is a strict superset of the `LearningPath.resources` Mongoose subdoc — extra fields are fine because Mongoose strips unknown keys, but `title/url/provider/cost/estimatedDuration/type` MUST always be set.

### 5.3 `POST /api/learning/skill-gaps`

Pure analysis — no resource fetch, no DB write.

Request:

```json
{ "profileId": "...", "opportunityId": "..." }
```

Response:

```json
{
  "ok": true,
  "data": {
    "consistencyMode": "matching-engine",
    "missingSkills": ["JavaScript", "React"],
    "matchBreakdown": {
      "matchScore": 0.0,
      "cosineScore": 0.0,
      "locationMatch": false,
      "salaryFit": false,
      "expFit": false,
      "skillOverlap": 0,
      "skillGap": 2,
      "modelUsed": "ml"
    },
    "proficiencyShortfalls": [{ "skill": "Python", "current": "beginner", "required": "advanced" }],
    "aliasHints": [
      { "missingSkill": "Masonry", "youMayAlreadyHave": "Bricklaying", "similarity": 0.81 }
    ],
    "totalGapScore": 1.0
  }
}
```

`missingSkills` is whatever the matching-engine's `/api/match/score` returned for this `(profileId, opportunityId)` pair, byte-for-byte. `proficiencyShortfalls` and `aliasHints` are the learning-engine's enrichment — they decorate the response but never change `missingSkills`. If the matching-engine call fails, `consistencyMode` flips to `"fallback"` and `missingSkills` comes from the local analyser; the response is otherwise identical so clients do not need a different parser.

```json
{
  "ok": true,
  "data": {
    "consistencyMode": "fallback",
    "missingSkills": ["..."],
    "totalGapScore": 0.42
  }
}
```

### 5.4 `POST /api/learning/dashboard-fit`  *(new — drives §6.2.4 worker dashboard)*

Request: `{ "userId": "..." }`

Response:

```json
{
  "ok": true,
  "data": {
    "fittingCategories": [
      {
        "category": "Construction",
        "fitScore": 0.82,
        "matchingSkillCount": 5,
        "missingSkills": ["Plumbing Fixtures", "Electrical Wiring Basics"]
      }
    ]
  }
}
```

### 5.5 `POST /api/learning/progress`

Request:

```json
{
  "userId": "...",
  "learningPathId": "...",
  "resourceUrl": "...",
  "isCompleted": true
}
```

Updates the worker's `ProfileSkill` for the resource's `bridgesSkill` (bumping proficiency one level if the user has no record, else recording the completion in `learningprogress`). The feedback loop to the matching-engine closes through the database — the matching-engine reads `profileskills` fresh on every score request, so the next match-score call automatically reflects the new skill state. Returns `{ ok: true, data: { profileSkillsUpdated: 1 } }`.

> The Node.js `/api/learning/:id/progress` endpoint already exists for percentage tracking on `LearningPath`; this new internal endpoint complements it by updating the worker's actual skill state, which is what feeds back into the matching engine per SDD §3.2.5.

---

## 6. Algorithm specifications — exact maths

These match the SDD pseudocode and weights and must be implemented as written.

### 6.0 Consistency contract with the matching-engine — **read this before §6.1**

The mobile Match Breakdown card on the [Discover screen](mobile/src/screens/worker/DiscoverScreen.js) and [OpportunityDetailScreen](mobile/src/screens/worker/OpportunityDetailScreen.js) is rendered directly from the matching-engine response (`POST ${MATCHING_SERVICE_URL}/api/match/score`). The fields it shows are:

| UI label | Matching-engine field |
|---|---|
| Overall Match | `matchScore` |
| Skill match | `breakdown.cosineScore` |
| Location | `breakdown.locationMatch` |
| Salary fit | `breakdown.salaryFit` |
| Experience level | `breakdown.expFit` |
| Skills you have (X of Y) | `breakdown.skillOverlap` of `breakdown.skillOverlap + breakdown.skillGap` |
| Skills you are missing (chips) | `missingSkills[]` |

**The single most important consistency rule in this entire spec**: when the worker is looking at opportunity X, the "Skills you are missing" chips on the Match Breakdown card MUST be the same skill names that the learning-engine builds pathways for. If the breakdown card says `JavaScript` is missing and the learning-engine surfaces `Pandas` instead — or builds a pathway for `JavaScript Frameworks` instead of `JavaScript` — the worker sees two contradictory views of the same opportunity. That is the bug we are explicitly preventing.

#### The contract

For any **opportunity-driven** request (`/api/learning/generate` with `opportunityId`, `/api/learning/skill-gaps`), the learning-engine MUST:

1. **First call the matching-engine** at `POST ${MATCHING_SERVICE_URL}/api/match/score` with `{ profileId, opportunityId }`.
2. Treat the returned `missingSkills[]` as **authoritative**. Build pathways for exactly those skill names, in that order. Do not add skills, do not remove skills, do not rename skills.
3. Pass the matching-engine's full `breakdown` and `matchScore` through verbatim in your response under `data.matchBreakdown` so any client (mobile, web) can render the same card from one learning-engine call instead of doing two round trips.
4. If the matching-engine call fails (network, 5xx, broken endpoint per the audit on `/api/match/scores-batch`), fall through to the learning-engine's own `skill_gap_analyser` and set `data.consistencyMode = "fallback"` in the response so the client knows the breakdown card may differ. Log a warning. Never silently diverge.

For **target-skill** requests (`/api/learning/generate` with only `targetSkill`, no `opportunityId`) the matching-engine has nothing to say — there is no opportunity context. The learning-engine's own analyser is the source of truth here, and `data.consistencyMode = "standalone"`.

For **dashboard-fit** requests, see §6.5 — that endpoint derives from `${MATCHING_SERVICE_URL}/api/match/recommendations/{userId}`, which is the same data the matching-engine uses to populate the worker's home screen. Categories and `missingSkills` per category are aggregated from the per-opportunity matching-engine output, so the dashboard fit and the per-opportunity card stay consistent by construction.

#### The enrichment layer (where the learning-engine's smarts go)

The learning-engine's semantic skill matching, NER bio mining, and proficiency analysis described in §6.1, §6.7 etc. **DO NOT override** the matching-engine's `missingSkills`. They run in parallel and surface as a separate `data.aliasHints[]` array, e.g.:

```json
"aliasHints": [
  {
    "missingSkill": "Masonry",
    "youMayAlreadyHave": "Bricklaying",
    "similarity": 0.81,
    "suggestion": "Add 'Masonry' to your skills profile to update your match score."
  }
]
```

The mobile UI may surface these as a soft prompt ("did you mean…?") under the missing-skills list, but the chips themselves still come from `missingSkills`. This way the learning-engine's smarter analysis becomes a tool for the worker to improve their profile rather than a source of UI inconsistency.

#### Implementation: `services/match_consumer.py`

Single async helper `fetch_match_breakdown(profile_id, opportunity_id) -> MatchBreakdown | None`. Uses `httpx.AsyncClient` with a 5s timeout. On any exception, returns `None` (caller falls through). On success, returns a typed dataclass with `match_score`, `missing_skills`, `breakdown` (Pydantic-compatible dict), `model_used`, `shortlist_probability`. **No retry loop** — if the matching-engine is slow, the worker would rather see a fast fallback than a 30s spinner.

### 6.1 Skill Gap Analyser (`skill_gap_analyser.py`)

The analyser has **two distinct roles** depending on whether an opportunity is in scope:

- **Opportunity-driven mode** (`opportunityId` is set): the matching-engine is the authoritative source of `missingSkills` per §6.0. The analyser's job here is **enrichment only** — produce `aliasHints[]` (semantic near-matches) and `proficiencyShortfalls[]` (worker has the skill but at a lower level than required). It does NOT add, drop, or rename items in the missing-skills list returned to the orchestrator.
- **Target-skill mode** (only `targetSkill` is set, no opportunity): no authoritative external source exists. The analyser computes `missingSkills` itself using the two-stage match described below.

The two-stage match is exact lowercase first (cheap, deterministic) then MiniLM cosine fallback (catches synonyms / variants / granularity drift). Only if both fail is a required skill declared missing.

```
function compute_skill_deficit(profile_skills, required_skills_with_levels, semantic_model):
    PROFICIENCY_RANK = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 }
    profile_index = { ps.skillName.lower() : ps for ps in profile_skills }

    # Pre-compute embeddings for ALL profile skills in one batched call.
    # Per-skill .encode() inside the loop would be ~10× slower for typical
    # profile sizes (5-30 skills) and dominates the request latency.
    profile_names = [ps.skillName for ps in profile_skills]
    profile_embeds = (
        semantic_model.encode(profile_names, normalize_embeddings=True, convert_to_numpy=True)
        if profile_names and semantic_model is not None
        else None
    )

    missing = []
    shortfalls = []
    semantic_matches = []  # surfaced in API response so the worker / Node.js can audit fuzzy hits

    for req in required_skills_with_levels:
        held = profile_index.get(req.name.lower())

        # Step 1.5 — semantic fallback. Threshold from config
        # (SEMANTIC_MATCH_THRESHOLD, default 0.75). Below the threshold
        # the worker really doesn't have the skill; above it, the
        # difference is plausibly just terminology.
        if held is None and profile_embeds is not None:
            req_embed = semantic_model.encode([req.name], normalize_embeddings=True, convert_to_numpy=True)[0]
            sims = profile_embeds @ req_embed       # cosine — both already L2-normalised
            best_idx = int(sims.argmax())
            best_score = float(sims[best_idx])
            if best_score >= SEMANTIC_MATCH_THRESHOLD:
                held = profile_skills[best_idx]
                semantic_matches.append({
                    "required": req.name,
                    "matchedTo": held.skillName,
                    "similarity": round(best_score, 3),
                })

        if held is None:
            missing.append(req.name)
        elif PROFICIENCY_RANK[held.proficiency] < PROFICIENCY_RANK[req.requiredLevel or 'intermediate']:
            shortfalls.append({"skill": req.name, "current": held.proficiency, "required": req.requiredLevel})

    total_gap_score = (len(missing) + 0.5 * len(shortfalls)) / max(1, len(required_skills_with_levels))
    return SkillDeficit(
        missing=missing,
        shortfalls=shortfalls,
        semanticMatches=semantic_matches,
        totalGapScore=total_gap_score,
    )
```

**Why a threshold of 0.75**: MiniLM all-MiniLM-L6-v2 places truly synonymous short phrases (bricklaying/masonry, joiner/carpenter, web designer/UI designer) at ≈0.78–0.92 cosine, related-but-distinct skills (Python/JavaScript, plumbing/electrical) at ≈0.55–0.7, and unrelated skills below ≈0.4. 0.75 sits cleanly inside the synonym band. Make the threshold configurable via `SEMANTIC_MATCH_THRESHOLD` so it can be retuned against real platform data without a code change.

**Required-level inference**: `Opportunity.requiredSkills` only stores skill IDs, not levels. Read `Opportunity.experienceLevel` if present (`entry|mid|senior`) and map to required proficiency (`intermediate|advanced|expert`). If absent, default to `intermediate`. Document this fallback in the function docstring.

**Test coverage you must include**:
- Exact match (no semantic call needed) — assert `semanticMatches` is empty.
- Synonym match above threshold — assert the required skill does NOT land in `missing` and IS recorded in `semanticMatches` with the matched profile-skill name.
- Near-miss below threshold (e.g. 0.6) — assert it DOES land in `missing` (no false positive).
- Empty `profile_skills` — semantic path is skipped cleanly, all required skills land in `missing`.
- `semantic_model=None` (model failed to load) — analyser still works via exact match only and never throws.

### 6.2 Resource Aggregator scoring (`resource_aggregator/base.py`)

For each candidate from each provider:

```
relevanceScore  ∈ [0,1] — semantic cosine(query="<skillName> tutorial", doc=resource.title + resource.description)
                          using ai_models.semantic_model. If model unavailable: keyword overlap fraction.
qualityScore    ∈ [0,1] — normalised(rating/5) * sqrt(1 + log10(1 + reviewCount)) / a constant (cap at 1)
costScore       ∈ {1.0 if cost==0 else 0.4} — strong free preference per SDD §3.2.5 / CAL003
difficultyScore ∈ [0,1] — beginner=1.0, intermediate=0.7, advanced=0.4 — used both for sort and for foundational-first ordering

finalScore = 0.5 * relevanceScore + 0.2 * qualityScore + 0.2 * costScore + 0.1 * difficultyScore
```

This is consistent with SDD §5.4 step 4 (`0.7 × relevance + 0.3 × difficulty`) but slightly extended to honour the SDD §3.2.5 prose ("filter by relevance, cost, learner ratings, completion rates"). Document the deviation explicitly in the function docstring with a one-line rationale.

### 6.3 Pathway ordering (`resource_aggregator.order_pathway`)

After scoring, group candidates by `bridgesSkill`. Within each group, sort by `(difficultyScore desc, finalScore desc)` so beginner content comes before advanced (foundational → advanced per SDD §3.2.5). Take the top 3 per skill. Concatenate skill groups in the same order as the missing-skills list returned by the analyser.

### 6.4 Provider behaviour rules

- **YouTube**: use `https://www.googleapis.com/youtube/v3/search` with `q="<skill> tutorial"`, `type=video`, `videoDuration=long`, `relevanceLanguage=en`, `maxResults=5`. If `YOUTUBE_API_KEY` is empty, **skip the provider entirely** — do not fail the request. Quota errors (HTTP 403/429) → log + skip this provider for the current request.
- **Coursera**: `https://api.coursera.org/api/courses.v1?q=search&query=<skill>&limit=5&fields=name,slug,workload,partnerIds,photoUrl`. Treat all returned courses as `cost=0` ONLY if the description/landing page explicitly mentions financial aid / audit-free; otherwise mark `cost=null` and `priceLabel="Paid (audit may be free)"`. Do not invent prices.
- **edX**: `https://courses.edx.org/api/courses/v1/courses/?search_term=<skill>&page_size=5`. Same free-detection rule.
- **Curated**: load `data/curated_resources.json` once at startup. Schema: `{ "<skillName>": [ ResourceCandidate, ... ] }`. Always available — used as fallback when no external provider returns results. Seed it with realistic entries for the most common SBOUP categories (Construction, Carpentry, Plumbing, Tailoring, Electrician, Catering, Programming, Data Analysis, Graphic Design — ten skills minimum, three resources each).

All providers return `list[ResourceCandidate]`; the aggregator merges, dedupes by `url`, scores, and orders.

### 6.5 Dashboard Fit (`taxonomy_service.compute_category_fit`) — derived from matching-engine recommendations

**Why this defers to the matching-engine.** Per the §6.0 consistency contract, the matching-engine is the source of truth for any per-opportunity gap. Dashboard Fit is a per-category aggregate of those per-opportunity facts. If we computed it independently (with our own MiniLM cosine over category skill rosters) we'd produce a category-level view that disagrees with the per-opportunity Match Breakdown card the worker sees as soon as they tap any opportunity in that category. Consistent UX requires both views derive from the same data.

Pipeline:

1. Call `GET ${MATCHING_SERVICE_URL}/api/match/recommendations/{userId}` to get the worker's top-ranked opportunities (the matching-engine returns up to 20 with `matchScore >= 5`).
2. Bucket the returned recommendations by `Opportunity.category` (resolved via a single Mongo lookup against the `opportunities` collection — recommendations only carry `opportunityId`, `title`, `matchScore`, `missingSkills`).
3. For each bucket:
   - `fitScore = mean(matchScore for opp in bucket) / 100` (matching-engine returns 0–100; we normalise to 0–1 for the API).
   - `matchingOpportunityCount = len(bucket)`.
   - `missingSkills = Counter(skill for opp in bucket for skill in opp.missingSkills).most_common()` — sort by frequency across opportunities in that category, exactly as the SDD §3.2.5 "missing the skills the most opportunities ask for first" rule mandates.
4. Filter to categories with `fitScore >= 0.4` and order by `fitScore desc`.
5. **Enrichment (non-authoritative)**: optionally run the learning-engine's NER bio-mining + MiniLM semantic match against the union of all category missingSkills, and surface results as `aliasHints[]` per category. Same rule as §6.0: never remove or rename a skill in `missingSkills`; only suggest profile updates the worker may want to make.

If the matching-engine's recommendations endpoint is unavailable, fall through to the local computation using `Opportunity` documents directly: bucket published opportunities by category, run MiniLM cosine over category skill rosters as the previous spec had, and set `consistencyMode: "fallback"` on the response. This mode is documented but not the default — it exists so the dashboard does not 503 when the matching-engine is down.

Response envelope:

```json
{
  "ok": true,
  "data": {
    "consistencyMode": "matching-engine",
    "fittingCategories": [
      {
        "category": "Construction",
        "fitScore": 0.82,
        "matchingOpportunityCount": 6,
        "missingSkills": ["Concrete Finishing", "Masonry"],
        "aliasHints": [
          { "missingSkill": "Masonry", "youMayAlreadyHave": "Bricklaying", "similarity": 0.81 }
        ]
      }
    ]
  }
}
```

This is the data the §6.2.4 dashboard's "Close Your Skill Gaps" section consumes — and it stays consistent with the per-opportunity Match Breakdown card by construction, because both views derive from the same matching-engine output.

### 6.6 Explanation Generator (`services/explanation_generator.py`)

This is what makes the service feel like an AI service to the worker, not a search proxy. It generates the **"WHY THIS COURSE?" panel** shown explicitly in SDD Figure 6.4 panel D, and the top-level pathway rationale shown in the Upskill screen header.

**Design constraint**: this module is the structural twin of [ai-services/cv-generation/services/summary_generator.py](ai-services/cv-generation/services/summary_generator.py). Read that file first; mirror its bio-rule pattern, its `GENERIC_FILLER` denylist, its three-tier fallback (LLM → strip filler → fact-pack template), and its short-output guard (`< 8 words → fall through`). The model used is the same `google/flan-t5-small` already configured via `HF_SUMMARY_MODEL`.

Two public functions:

#### `explain_resource(resource, missing_skill, profile, opportunity=None) -> str`

Returns a 1–2 sentence rationale that names *the worker* and *the gap being bridged*. Examples of the target output quality:

> "Bridges the Pandas gap on your profile, building directly on the Python you already use."
> "Foundational React tutorial — fits your front-end goal and starts at beginner level so no prior framework knowledge is assumed."

Prompt template (no inventing credentials, only structured facts):

```
Write a 1-2 sentence explanation for a CV/upskilling app telling the worker
why this learning resource was chosen for them. Use only the facts below.
Do not mention the worker by name.

Target gap: {missing_skill}
Resource: {resource.title} ({resource.provider}, {resource.difficultyLevel})
Worker's relevant existing skills: {top 3 profile skills overlapping the resource keywords}
Target opportunity: {opportunity.title if opportunity else 'general upskilling'}

Constraints: do not invent credentials or duration. No filler phrases like
"highly recommended" or "industry-leading". Two sentences maximum.
```

**Fallback chain (mandatory)**:
1. Run Flan-T5 with the prompt above. Strip `GENERIC_FILLER` (copy the list verbatim from `cv-generation/services/summary_generator.py`, augment with: `"highly recommended"`, `"industry-leading"`, `"cutting-edge"`, `"world-class"`).
2. If output < 8 words after stripping, fall through.
3. Deterministic fact-pack: `f"Bridges the {missing_skill} gap. {resource.difficultyLevel.capitalize()}-level {resource.type} from {resource.provider}."`

So the field is **never empty** even when `HF_SUMMARY_MODEL` is unset or fails to load — the worker always sees a reason.

#### `explain_pathway(deficit, ordered_resources, profile, opportunity=None) -> str`

Returns a 2–3 sentence header for the whole pathway. Frames the journey rather than any one resource. Examples:

> "Three resources cover the two missing skills for the Senior Data Analyst role: Pandas first, then NumPy. Each builds on the Python foundation already on your profile."
> "Foundational masonry pathway. Starts with safety basics, then moves into bricklaying technique — both flagged as missing for the Construction Foreman role."

Prompt template:

```
Write a 2-3 sentence overview for an upskilling pathway. Use only the facts.

Missing skills (in order): {deficit.missing}
Worker's strengths: {top 3 primary profile skills}
Target opportunity: {opportunity.title if opportunity else 'general upskilling'}
Resource sequence: {[r.title for r in ordered_resources[:5]]}
Number of resources: {len(ordered_resources)}

Constraints: third person, no invented credentials, no filler. Mention how
the sequence flows from foundational to advanced where relevant.
```

Same three-tier fallback. Final fact-pack: `f"Pathway covering {len(deficit.missing)} missing skill(s): {', '.join(deficit.missing)}. {len(ordered_resources)} resources ordered foundational to advanced."`

**Performance**: for a typical 6-resource pathway you make 7 Flan-T5 calls (1 pathway + 6 per-resource). On CPU that is ≈3-6 s total. This is acceptable for an interactive upskilling request and does not need batching. Do **not** introduce async parallelism inside the LLM calls — the same `transformers` pipeline instance is not thread-safe across concurrent generations.

**Caching opportunity (note for the maintainer, do NOT implement now)**: per-resource explanations are deterministic given `(resource.url, missing_skill)`, so a Redis cache keyed on that tuple would eliminate ~80 % of LLM calls in steady state. Defer until the service is in production and the cost is measured.

**What this is NOT**:
- It is **not** the ranking signal. Resources are scored, ordered, and selected before any explanation is generated. The explanation is purely surface text.
- It is **not** a chatbot. No multi-turn, no user input. The model sees only structured facts the orchestrator already has.

### 6.7 Skill Extractor (`services/skill_extractor.py`) — third AI model

This is the third AI model in the service and is the structural twin of [ai-services/cv-generation/services/keyword_extractor.py](ai-services/cv-generation/services/keyword_extractor.py). Read that file first; mirror its NER-then-LLM-fallback pattern, its `_normalise` helper, and its **`_validate_against_catalog`** routine that replaces extracted spans with their canonical `Skill.skillName` so downstream code only ever sees catalog-canonical names.

Model: `jjzha/escoxlmr_skill_extraction` (same as cv-generation), loaded by `ai_model_manager.ner_pipeline`. Best-effort load — on failure the module falls through to a Flan-T5 prompt that asks the LLM to return a JSON array of skill names (also mirrored from cv-generation).

Two public functions:

#### `extract_from_bio(profile) -> list[SkillRef]`

Runs NER on `profile.bio`, validates spans against the canonical `skills` collection, **filters out skills the profile already declares as `ProfileSkill`** (so we do not double-count), and returns a list of `SkillRef` records with `proficiency="intermediate"` and `classification="bio_inferred"` (a new classification value — document it as the convention for skills detected by NER but not declared by the worker).

The skill_gap_analyser MUST call this at the start of `compute_skill_deficit` and merge the inferred skills into the profile-skill list before the exact-match step. This is what makes a bio like "I've been doing house painting and minor electrical work for 8 years" actually count toward fit. The semantic-match path in §6.1 sees the augmented list.

**Constraint**: bio-inferred skills are NEVER persisted to the `profileskills` collection. They are inferred at request time and live only for the duration of the request. Persistence requires an explicit `ProfileSkill` write through the existing Node.js profile flow — that boundary is the user's consent gate and must not be bypassed by an AI service.

#### `extract_resource_skill(resource) -> str | None`

Runs NER on `resource.title + resource.description`, returns the highest-confidence canonical skill name or `None`. The resource aggregator calls this **only when the provider response did not already declare a clear `bridgesSkill`** — so the NER call is amortised across the resources that need it, not the whole catalog. Used to populate `bridgesSkill` for YouTube and edX results in particular, which often arrive without explicit skill tagging.

**Validation rule (mandatory)**: every NER span returned by either function must round-trip through `_validate_against_catalog`. Spans that do not match a canonical `Skill.skillName` are dropped, not invented. This is the same guardrail that prevents cv-generation from generating CVs with hallucinated skills, and it applies for the same reason.

**Fallback chain**:
1. NER pipeline (if loaded): aggregate spans with `score >= 0.5`, normalise, dedupe.
2. NER unavailable: prompt Flan-T5 with `"Extract a JSON array of distinct, short skill names from: <text>"` and parse the array (copy `_llm_extract` from cv-generation verbatim).
3. Both unavailable: return `[]` for `extract_from_bio`, return `None` for `extract_resource_skill`. The service still works — it just degrades to using only the structured `ProfileSkill` rows and only the provider-declared `bridgesSkill` values, which is exactly the pre-NER behaviour.

**Tests** (in `tests/test_skill_extractor.py`):
- NER mocked to return `[{word: "painting", score: 0.82}, {word: "electrical", score: 0.91}]` against a bio containing both → assert both come through canonicalised against a fixture `skills` collection.
- NER returns a span not in the catalog → assert it is dropped, not surfaced.
- NER returns a span the profile already has as `ProfileSkill` → assert it is filtered out.
- NER pipeline is `None` and Flan-T5 is mocked → assert the LLM fallback path runs and produces canonical names.
- Both models are `None` → assert empty list, no exception.

---

## 7. Configuration (`config.py`)

Mirror the cv-generation pattern verbatim. The required env vars:

```
MONGODB_URI=mongodb://localhost:27017/sboup_dev
MONGODB_DB_NAME=sboup_dev
INTERNAL_API_KEY=

# AI models
HF_MODEL_CACHE_DIR=/app/model_cache
HF_SEMANTIC_MODEL=sentence-transformers/all-MiniLM-L6-v2
# Required for the §6.6 "WHY THIS COURSE?" panel and the pathway rationale.
# Service still functions if absent (deterministic fact-pack fallback) but
# the worker-facing explanations will be templated rather than generated.
HF_SUMMARY_MODEL=google/flan-t5-small
HF_SUMMARY_MAX_NEW_TOKENS=80
# Skill NER for §6.7 — bio mining and resource description tagging.
# Best-effort load: on failure the module falls through to a Flan-T5
# prompt-based extraction, same pattern as cv-generation.
HF_SKILL_NER_MODEL=jjzha/escoxlmr_skill_extraction
# Cosine threshold above which a profile skill is treated as a semantic
# match for a required skill (see §6.1 and §6.5). Retunable without code change.
SEMANTIC_MATCH_THRESHOLD=0.75

# Resource providers
YOUTUBE_API_KEY=
COURSERA_BASE_URL=https://api.coursera.org/api
EDX_BASE_URL=https://courses.edx.org/api
PROVIDER_HTTP_TIMEOUT_SECONDS=8

# Matching feedback
MATCHING_SERVICE_URL=http://localhost:5001

# Networking
PORT=5004
LOG_LEVEL=INFO
RATE_LIMIT_PER_USER_PER_MINUTE=10

# HF offline toggles (mirror cv-generation)
TRANSFORMERS_OFFLINE=0
HF_HUB_OFFLINE=0
```

Update `.env.example` accordingly. Update the `learning-engine` block in the **root `docker-compose.yml`** to include all of these env vars (preserve existing `network_mode: host` style and volumes — add a `learning_model_cache` volume mounted at `/app/model_cache`).

---

## 8. Dockerfile

Replace the current trivial Dockerfile with one structurally identical to `ai-services/cv-generation/Dockerfile`:

- `python:3.11-slim` base.
- `apt-get install` only what's required (`libffi-dev` is enough — no Cairo/Pango here, we don't render PDFs).
- BuildKit `--mount=type=cache,target=/root/.cache/pip` + 5-attempt retry loop for `pip install`.
- `--extra-index-url https://download.pytorch.org/whl/cpu` in `requirements.txt` and `torch==2.4.1+cpu` (we need torch for sentence-transformers).
- `ARG FAIL_FAST=0` + `COPY scripts/preload_models.py … && RUN python scripts/preload_models.py` (best-effort, never fails the build unless `FAIL_FAST=1`).
- `EXPOSE 5004`.
- `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5004"]`.

---

## 9. Testing

Mirror the cv-generation test layout:

- `conftest.py` adds project root to `sys.path` (copy verbatim, change comment).
- `tests/test_api.py`: spin up the FastAPI app with `TestClient`, mock `services.learning_path_generator.generate_learning_path` and assert the wire envelope on `/api/learning/generate`, `/api/learning/skill-gaps`, `/api/learning/dashboard-fit`, `/api/learning/progress`, `/health`.
- `tests/test_skill_gap_analyser.py`: pure-function tests on `compute_skill_deficit` covering: no overlap, full match, proficiency shortfall, missing required-level (default applied), empty inputs.
- `tests/test_resource_aggregator.py`: each provider mocked with `httpx.MockTransport` (or `respx`); assert dedupe-by-url, scoring math (specific assertion: a free, beginner, high-rated resource for the exact skill name beats a paid, advanced resource), and pathway ordering (foundational first per skill).
- `tests/test_learning_path_generator.py`: mirror `test_cv_generator.py` — mock `fetch_profile_aggregate`, `fetch_opportunity`, all providers, `_log_skill_gap`, and the matching-feedback call. Cover: targetSkill mode, opportunityId mode, both missing → 422, profile not found → 404, opportunity not found → 404, no missing skills → returns empty `resources` and a friendly `analysisSummary`.
- `tests/test_progress_tracker.py`: assert profileskills upsert path, the matching-feedback fire-and-forget call, idempotency on re-completion of the same resource.

`pytest.ini` — copy from cv-generation.

All tests must run with `cd ai-services/learning-engine && pytest` and pass without MongoDB, without HF models on disk, without internet.

---

## 10. Backwards compatibility — DO NOT BREAK

1. The Node.js layer must keep working without changes. Verify:
   - `POST /api/learning/generate` still accepts `{ userId, targetSkill, opportunityId }`.
   - The response still has `resources` at a top level OR under `data.resources`. Since the Node.js controller does `response.data.resources`, you MUST place `resources` at the top of the `data` block AND ALSO mirror it at the response root for one release cycle to be safe. Add a comment explaining this and a `# TODO: drop top-level resources alias once server/controller is updated` marker.
   - Each resource includes `title`, `url`, `provider`, `cost`, `estimatedDuration`, `type` (one of `video|course|article|tutorial`).
2. The `LEARNING_SERVICE_URL` env on the Node.js server already points to `http://localhost:5004`. Don't change the port.
3. The container name `sboup-learning` and the docker-compose service key `learning-engine` stay unchanged.
4. The GHCR image tag `ghcr.io/turyahebwalex/sboup-learning:latest` stays the same — your only change to compose is env vars + the `learning_model_cache` volume.

---

## 11. Code quality & style — non-negotiable

- Follow the SBOUP repo's `CLAUDE.md`-implied conventions (you do not have one in the AI services dirs, so import the cv-generation tone): no emojis in code or commits; minimal comments — only where the *why* is non-obvious; no narration of refactors in comments; no "added for X feature" comments.
- Module-level docstrings only when they explain a non-obvious responsibility (mirror cv-generation's tone — see e.g. `services/storage_service.py`).
- All async I/O uses `motor` for Mongo and `httpx.AsyncClient` for HTTP.
- Custom error class `LearningEngineError(code, message, status)` mirrors `CVGenerationError`.
- Logging: `logger = logging.getLogger(__name__)`, structured `extra={...}` on warning paths, `logger.exception` on unhandled.
- Pydantic v2 syntax (`Field(default_factory=...)`, `model_dump()` not `dict()`).
- `from __future__ import annotations` on every module (mirror cv-generation).
- Type-hint everything. Do NOT use `Any` except in untyped Mongo doc shapes where it's already the cv-generation convention.

---

## 12. Step-by-step execution plan you must follow

Work in this order. **Do not skip ahead** — each step locks down a contract the next depends on.

1. **Read every file listed in §2.** Open them in the IDE; do not rely on memory.
2. **Write `config.py` and `.env.example`.** Verify they import cleanly with `python -c "import config"` from the service dir.
3. **Write `database/mongo_client.py`.** Identical pattern to cv-generation.
4. **Write the Pydantic request/response models in `models/request_models.py`.** Write a one-shot test that imports them.
5. **Write the dataclasses in `models/db_models.py`.**
6. **Write `services/profile_service.py` and `services/taxonomy_service.py`.** Aggregate pipelines mirror the cv-generation joins on `profileskills` ↔ `skills`.
7. **Write `services/ai_model_manager.py`** holding **three** model handles: `semantic_model` (MiniLM, required — `models_loaded` flips True only if MiniLM loaded), `summary_pipeline` (Flan-T5, best-effort — degrades the explanation generator to fact-pack templates), and `ner_pipeline` (`jjzha/escoxlmr_skill_extraction`, best-effort — degrades the skill extractor to the Flan-T5 LLM fallback then to no-op). Mirror cv-generation's lifespan and per-model try/except patterns exactly.
8. **Write `services/skill_extractor.py`** before the gap analyser, because the analyser depends on it. Mirror `cv-generation/services/keyword_extractor.py` line by line: `_normalise`, `_validate_against_catalog`, `_ner_extract`, `_llm_extract`, then `extract_from_bio()` and `extract_resource_skill()` from §6.7. Test the catalog-validation path before moving on — an extractor that surfaces non-canonical names will pollute every downstream comparison.
9. **Write `services/match_consumer.py`** before the gap analyser, because the orchestrator calls it first per §6.0. Single async helper `fetch_match_breakdown(profile_id, opportunity_id) -> MatchBreakdown | None`. `httpx.AsyncClient`, 5s timeout, no retry, returns `None` on any exception. Test the success path, the 5xx fallback, the timeout fallback, and the network-error fallback — all four MUST return `None`, never raise. The orchestrator interprets `None` as "fall through to local analyser and flip `consistencyMode = 'fallback'`".
10. **Write `services/skill_gap_analyser.py`** with the two-stage match path from §6.1 (exact lowercase → MiniLM cosine fallback). The analyser MUST call `skill_extractor.extract_from_bio()` at the start of `compute_skill_deficit` and merge the inferred skills into the profile-skill list before either match stage runs. **Important**: in opportunity-driven mode the analyser's `missing` output is for enrichment only — the orchestrator overrides it with the matching-engine's authoritative list. The analyser still produces `proficiencyShortfalls` and `aliasHints` which DO survive into the response. Unit-test the synonym hit, the near-miss reject, the bio-augmentation path, and the `semantic_model=None` graceful path before moving on.
11. **Write the resource aggregator package**:
    1. `base.py` — `ResourceCandidate` dataclass, scoring math, `Provider` Protocol.
    2. `curated_provider.py` — file load, never fails.
    3. `youtube_provider.py`, `coursera_provider.py`, `edx_provider.py` — async httpx, defensive on every error.
    4. `__init__.py` exposes `aggregate_resources(skill, semantic_model)` that fans out, merges, scores, orders, and calls `skill_extractor.extract_resource_skill()` to populate `bridgesSkill` for any resource where the provider response did not declare one.
    5. Seed `data/curated_resources.json` with the ten-skill catalog described in §6.4.
12. **Write `services/explanation_generator.py`** mirroring `summary_generator.py` line by line — same imports, same `GENERIC_FILLER` shape, same three-tier fallback. Test that pulling the model handle (mock `ai_models.summary_pipeline = None`) still produces non-empty `whyThisCourse` and `pathwayRationale` strings via the fact-pack path.
13. **Write `services/progress_tracker.py`.** Upsert path, audit doc, matching feedback (best-effort).
14. **Write `services/matching_feedback.py`** as a thin hook. The matching-engine has no cache and reads `profileskills` from Mongo on every score request, so the feedback channel is the database itself — `progress_tracker`'s upsert is what makes the next match call return improved scores. This module's job today is to log the upsert with the affected `userId` and `skillName` (audit trail for "did learning actually move match scores?"). It exposes a single async no-op-by-default function so a future matching-engine cache-invalidation endpoint can be wired without changing callers. **Do not** invent an HTTP call to `/api/match/recommendations/refresh/{userId}` — that endpoint does not exist on the matching-engine.
15. **Rewrite `services/taxonomy_service.py`** with the recommendations-driven Dashboard Fit from §6.5 — call `${MATCHING_SERVICE_URL}/api/match/recommendations/{userId}`, bucket by `Opportunity.category`, derive `fitScore` and per-category `missingSkills` from the matching-engine output. Implement the local fallback path too. Unit-test both the happy path (matching-engine returns 8 opps across 3 categories → 3 buckets, fitScore matches the mean of returned scores, missingSkills are frequency-sorted) and the fallback path (matching-engine returns 5xx → consistencyMode flips, local MiniLM computation runs).
16. **Write `services/learning_path_generator.py`.** Numbered comment blocks Step 1 → Step 6 from SDD §5.4 plus a Step 0 that calls `match_consumer.fetch_match_breakdown()` whenever an `opportunityId` is in scope. The matching-engine's `missingSkills` is the input to the resource aggregator; the analyser's local `missing` output is discarded in this mode but its `proficiencyShortfalls` and `aliasHints` survive into the response. Custom error class. Returns the response payload shape from §5.2 — including `consistencyMode`, `matchBreakdown`, `aliasHints`, per-resource `whyThisCourse`, and top-level `pathwayRationale`.
17. **Write `main.py`.** Mirror cv-generation: lifespan, rate limiter, internal API key check, exception handlers, all four routes + health.
18. **Write `scripts/preload_models.py`** mirroring cv-generation. **All three** models must be in the preload list: MiniLM (required), Flan-T5-small (required for explanation UX), and the Skill NER model (best-effort with the same DNS pre-flight + per-model try/except as cv-generation). The script exit code remains 0 even if the NER model fails to cache; the runtime falls through to the LLM extraction path.
19. **Write the Dockerfile** mirroring cv-generation.
20. **Write all tests in `tests/`.** Run `pytest` until green.
21. **Update root `docker-compose.yml`** — add the new env vars (including `SEMANTIC_MATCH_THRESHOLD`, `HF_SUMMARY_MODEL`, `HF_SKILL_NER_MODEL`, and `MATCHING_SERVICE_URL`) and the `learning_model_cache` volume to the `learning-engine` service. Add `matching-engine` to `depends_on` since the consistency contract makes it a dependency.
22. **Run an integration smoke test**:
    ```bash
    cd /home/alex/Desktop/BSE26-2-FYP-SBOUP
    docker compose up -d mongodb
    cd ai-services/learning-engine
    uvicorn main:app --host 0.0.0.0 --port 5004 &
    curl -s http://localhost:5004/health
    curl -s -X POST http://localhost:5004/api/learning/generate \
      -H 'Content-Type: application/json' \
      -d '{"userId":"507f1f77bcf86cd799439011","targetSkill":"Python"}'
    ```
    Confirm `models_loaded: true` after warm-up. The second curl must return a non-empty `data.resources` (curated provider guarantees this even offline) AND every resource must have a non-empty `whyThisCourse` AND the response root must have a non-empty `data.pathwayRationale`. If any of those three fields is empty the fact-pack fallback is broken — fix before moving on.
23. **Verify the matching-engine consistency contract end-to-end**. Set up a profile with skills `[React]` (no JavaScript) and an opportunity requiring `[JavaScript, React]`. Call the matching-engine first: `curl -X POST http://localhost:5001/api/match/score -d '{"profileId":"<pid>","opportunityId":"<oid>"}'`. Note the returned `missingSkills` and `breakdown`. Then call the learning-engine: `curl -X POST http://localhost:5004/api/learning/generate -d '{"userId":"<uid>","opportunityId":"<oid>"}'`. Assert: (a) `data.consistencyMode == "matching-engine"`, (b) `data.missingSkills` is byte-for-byte equal to the matching-engine's `missingSkills`, (c) `data.matchBreakdown` is byte-for-byte equal to the matching-engine's `breakdown` (plus the `matchScore` and `modelUsed` fields), (d) every resource in `data.resources` has its `bridgesSkill` ∈ `data.missingSkills`. This is the single most important behavioural test — if it fails, the mobile Match Breakdown card and the learning pathway will show the worker contradictory information.
24. **Verify the matching-engine fallback path**: stop the matching-engine container and re-run the same call. Assert `data.consistencyMode == "fallback"`, the response still has 200 OK with non-empty `data.resources`, and a warning was logged. The service must degrade, not 503.
25. **Verify the alias hints path** (smarter analysis surfaces without overriding): create a profile with skill `Bricklaying` and an opportunity requiring `Masonry`. Call the learning-engine. Assert: (a) `Masonry` IS in `data.missingSkills` (matching-engine says so, learning-engine respects it), (b) `Masonry` ALSO appears in `data.aliasHints[]` with `youMayAlreadyHave: "Bricklaying"` and `similarity >= 0.75`. The worker sees both: "you're missing Masonry" AND "you may already have it as Bricklaying — add it to your profile."
26. **Verify the bio-mining path** (target-skill mode, no opportunity): write a profile with `bio = "I've been doing house painting and minor electrical work for 8 years"` but no `ProfileSkill` rows for `Painting` or `Electrical`. Call `/api/learning/generate` with `targetSkill: "Painting"` (no opportunityId). Assert `consistencyMode == "standalone"`, `Painting` is NOT in `missingSkills`, and the bio-inferred skills appear in some response field for transparency. This proves the NER → catalog-validation → analyser-augmentation pipeline closes the loop in target-skill mode where no matching-engine ground truth exists.
27. **Verify the recommendations-driven Dashboard Fit**: call `/api/learning/dashboard-fit` for a worker who has matching-engine recommendations across multiple categories. Assert each `fittingCategories[]` entry's `fitScore` is the mean of `matchScore` values returned by the matching-engine for that category, and `missingSkills` are frequency-sorted across the bucket.
28. **Verify Node.js still works**: from the server dir, run the existing learning controller through any e2e test that exercises `POST /api/learning/generate` (or trigger it from the mobile UI per §6.2.4).

---

## 13. What "done" looks like

You are done when **every one** of these is true:

- [ ] `tree ai-services/learning-engine` matches §4 exactly.
- [ ] `cd ai-services/learning-engine && pytest -q` is green with zero skips and zero warnings about unmocked I/O.
- [ ] `docker compose up --build learning-engine` builds with no errors and the container's `/health` returns `{"status":"ok","models_loaded":true}` once the MiniLM model is loaded.
- [ ] Calling the four documented endpoints with curl returns the documented payloads for both the `targetSkill` mode and the `opportunityId` mode.
- [ ] The existing Node.js `POST /api/learning/generate` controller call path still returns `learningPath.resources` populated end-to-end (mobile UI test passes).
- [ ] `git diff --stat` for `ai-services/learning-engine/` shows a substantial rewrite (>1500 lines added, old Flask scaffold removed).
- [ ] No file under `ai-services/learning-engine/` references Flask, `flask_cors`, or the hard-coded `LEARNING_RESOURCES` dict from the old scaffold.
- [ ] Every requirement ID from SDD §7 (CAL001..CAL004) appears as a code comment on the function that satisfies it.
- [ ] The SDD §5.4 numbered steps are visible as numbered comment blocks inside `learning_path_generator.py`.
- [ ] **Gap-driven pathway generation is the central flow** — pathways are built from, and ordered by, the list of genuinely missing skills returned by the analyser. The semantic-match step is *only* a refinement that prevents synonyms from polluting that list; it does not replace gap-driven generation. Both behaviours must be exercised by the test suite together (see the two paired tests below).
- [ ] **Synonym refinement test in target-skill mode**: with no `opportunityId`, a profile listing `Bricklaying` searching for `targetSkill: "Masonry"` returns `Masonry` under `aliasHints` (matched to `Bricklaying`, similarity ≥ 0.75), the resulting `missingSkills` is empty, and the pathway is empty (no gap to bridge). This exercises the analyser's local two-stage match path which is authoritative when no matching-engine context is available.
- [ ] **Genuine-gap pathway test (real gap drives generation)**: a profile with `Python` only, matched against an opportunity requiring `Python` + `Pandas` + `NumPy`, returns `Pandas` and `NumPy` under `missingSkills`, and the resulting `resources[]` contains at least one resource per missing skill with `bridgesSkill` set to that skill, ordered foundational-first per skill (per §6.3). `Python` does NOT appear in `bridgesSkill` for any resource — the analyser correctly preserved it as held.
- [ ] **Mixed test in opportunity-driven mode**: a profile with `Bricklaying` only, matched against an opportunity requiring `Masonry` + `Concrete Finishing`. The matching-engine returns `missingSkills: ["Masonry", "Concrete Finishing"]` (it doesn't know `Bricklaying ≈ Masonry`). The learning-engine respects that list — `data.missingSkills == ["Masonry", "Concrete Finishing"]`, the pathway has resources for both — AND surfaces `aliasHints: [{missingSkill: "Masonry", youMayAlreadyHave: "Bricklaying"}]` so the worker can act on it. The breakdown card and the pathway agree; the smart hint sits next to them.
- [ ] **Every resource has a `whyThisCourse` string** that names the specific missing skill it bridges, generated by Flan-T5 when available and by the deterministic fact-pack fallback when not. Field is never empty and never duplicates the resource title.
- [ ] **The pathway-level `pathwayRationale` is present** on every successful `/api/learning/generate` response and references the list of missing skills (so the worker can see *why these resources, in this order*). It changes meaningfully when the input profile or opportunity changes — i.e. it is not a constant string.
- [ ] `services/explanation_generator.py` is structurally a twin of `cv-generation/services/summary_generator.py` — same imports shape, same `GENERIC_FILLER` denylist (extended), same three-tier fallback, same word-count guard.
- [ ] **Three AI models are loaded at startup**: MiniLM, Flan-T5-small, and the Skill NER (`jjzha/escoxlmr_skill_extraction`). `ai_model_manager.py` exposes `semantic_model`, `summary_pipeline`, and `ner_pipeline`. The `/health` endpoint reports the status of each.
- [ ] `services/skill_extractor.py` is structurally a twin of `cv-generation/services/keyword_extractor.py` — same `_normalise`, `_validate_against_catalog`, `_ner_extract`, `_llm_extract` shape. Every NER span returned by the module round-trips through the canonical `Skill.skillName` catalog before exposure; non-canonical spans are dropped, never invented.
- [ ] **Bio-mining test passes**: a profile with `bio = "house painting and minor electrical"` and no formal `Painting`/`Electrical` skills is treated as having both when matched against an opportunity requiring `Painting`. The bio-inferred skills are NOT persisted to `profileskills` — they live only for the request.
- [ ] **Dashboard Fit is recommendations-driven**: `data.fittingCategories[]` is built by bucketing the matching-engine's `/api/match/recommendations/{userId}` output by `Opportunity.category`; each `fitScore` is the mean of `matchScore` across the bucket; per-category `missingSkills` are frequency-sorted across opportunities in that bucket. When the matching-engine is unreachable, `consistencyMode = "fallback"` and the local MiniLM-driven category fit is used.
- [ ] **Resource `bridgesSkill` is populated for every resource**, including those from providers (YouTube, edX) whose responses do not declare it — populated by `skill_extractor.extract_resource_skill()` at aggregation time.
- [ ] **Matching-engine consistency contract holds (§6.0)**. For any opportunity-driven request, the learning-engine's `data.missingSkills` is byte-for-byte equal to the matching-engine's `missingSkills` for the same `(profileId, opportunityId)`. The learning-engine's `data.matchBreakdown` is the matching-engine's `breakdown` plus `matchScore`/`modelUsed`/`shortlistProbability`, passed through unchanged. This is verified by an integration test that calls both services and diffs the responses.
- [ ] **No resource bridges a skill outside the missing list**. For every resource in `data.resources`, `resource.bridgesSkill ∈ data.missingSkills`. The resource aggregator must not return resources for skills the matching-engine considers already present. Build pathways for the gaps the worker actually sees, nothing else.
- [ ] **Alias hints surface but never override**. When the analyser detects a semantic equivalent for a missing skill (Bricklaying↔Masonry), the missing skill stays in `missingSkills` AND the equivalence is reported in `aliasHints[]` with the suggestion to update the worker's profile. The mobile breakdown card still shows the missing chip; the worker is informed they may already have the skill.
- [ ] **Fallback mode is graceful**. When the matching-engine is unreachable (down, 5xx, timeout), the response has 200 OK with `data.consistencyMode = "fallback"`, populated `data.resources`, and a warning logged. The service does not 503.

---

## 14. Things to avoid

- **Do not** invent a new ML approach (BERT-large, custom training, RL agent, etc.). Use sentence-transformers MiniLM for semantic relevance and a TF-IDF / keyword-overlap fallback. Same toolset cv-generation already uses.
- **Do not** call any LLM for ranking, gap detection, or resource selection. Those paths use MiniLM (semantic similarity) and the deterministic scoring math from §6.2 only. Flan-T5 is used in two places: (1) inside `services/explanation_generator.py` to render the §6.2.4 "WHY THIS COURSE?" rationale and the pathway header, and (2) as a *fallback* inside `services/skill_extractor.py` when the dedicated NER model fails to load. It is never used for ranking. Ranking, gap analysis, and pathway *content* must remain fully functional with `HF_SUMMARY_MODEL` unset — only the explanation text degrades to fact-pack templates and the bio-mining path degrades to "no inferred skills" in that case.
- **Do not** persist bio-inferred skills to the `profileskills` collection. They are inferred at request time and exposed to the request only. Persistence requires explicit user consent through the existing Node.js profile flow; an AI service must not bypass that gate.
- **Do not** invent skill names. Every skill name surfaced by the service — in `missingSkills`, `bridgesSkill`, `aliasHints`, or anywhere else — must round-trip through the canonical `Skill.skillName` catalog. The Skill NER is fenced by `_validate_against_catalog` for exactly this reason; do not bypass that fence.
- **Do not** recompute, override, dedupe, or reorder `missingSkills` for opportunity-driven requests. The matching-engine is authoritative per §6.0. The mobile Match Breakdown card and the learning pathway both render from this list — if the learning-engine produces a different list, the worker sees two contradictory views of the same opportunity. This is the single bug §6.0 exists to prevent.
- **Do not** silently fall through to local computation when the matching-engine is reachable but slow. The 5s timeout in `match_consumer.py` is a deliberate ceiling; failures inside that window count as fallback (and surface in `consistencyMode`). Do not extend the timeout, do not retry — the worker would rather see a fast fallback with a marker than a 30s spinner.
- **Do not** rename the existing endpoint `/api/learning/generate` or change the port `5004`.
- **Do not** modify any file outside `ai-services/learning-engine/` except the single `learning-engine` block in `docker-compose.yml`.
- **Do not** persist anything to the `LearningPath` Mongoose collection from this Python service — Node.js owns it. You may write to a new `skillgaplogs` collection (per SDD §5.4 step 5) and to `learningprogress` (audit), and you may upsert into `profileskills` (per SDD §3.2.5 progress feedback). Document each write in the relevant module docstring.
- **Do not** add Cloudflare anything. Use direct HTTPS to provider APIs. (This applies project-wide.)
- **Do not** add emojis, decorative comments, or "implementation notes" markdown unless explicitly requested.

---

## 15. After you finish, prepare a summary

Write a short `IMPLEMENTATION_NOTES.md` at `ai-services/learning-engine/IMPLEMENTATION_NOTES.md` (≤ 50 lines) covering only:

1. The five most important non-obvious decisions you made and why (e.g. how you handled missing required-skill levels, free-detection on Coursera, what happens when YouTube quota is exhausted mid-request).
2. Known limitations (e.g. providers without ratings → quality score defaults to 0.5).
3. What the next maintainer would change first if usage grows 10× (rate-limit cache, provider response cache, async batch fetch in dashboard-fit, etc.).

Do **not** write a long architecture overview — the SDD already contains that.

---

End of prompt. Begin by reading every file in §2 in order, then execute §12 step by step. Ask no clarifying questions; the SDD plus the cv-generation reference implementation are authoritative.
