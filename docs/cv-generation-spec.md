# SBOUP CV Generation AI Service — Implementation Spec (Revised)

This is the revised, codebase-aligned, deployment-realistic version of the
CV Generation service spec. It replaces the earlier draft. Changes from the
earlier draft are flagged in `> Revision note:` callouts so reviewers can
see what moved and why.

---

## 1. Architectural context

The CV Generation service is a Python microservice in the SBOUP Intelligence
Layer. It:

- Exposes an internal REST API consumed only by the Node.js Application
  Services Layer (`server/`). It is never called directly by the mobile or
  web clients.
- Reads worker profile data from MongoDB (collections: `Profile`,
  `ProfileSkill`, `Skill`, `Experience`, `Education`, `Preference`,
  `UserCV`, `Opportunity`).
- Uses Hugging Face transformer models for semantic ranking, skill
  extraction, and summary generation.
- Generates a PDF CV via ReportLab.
- Uploads to cloud object storage (S3-compatible by default) and returns a
  short-lived pre-signed URL.
- Persists a `UserCV` document matching the existing Mongoose schema.

> **Revision note (deployment reality):** The original spec said
> "MongoDB Atlas". The deployed project uses local MongoDB in Docker for
> development (`mongodb://localhost:27017/sboup_dev`, see
> [docker-compose.yml](../docker-compose.yml)). Atlas can be swapped in
> later by changing `MONGODB_URI` only — no code change.

### Stack

| Concern | Choice | Notes |
|---|---|---|
| Language | Python 3.11 | |
| Web framework | FastAPI | replaces existing Flask service |
| AI backbone | Hugging Face Transformers | three models, see §2 |
| PDF | ReportLab Platypus | A4, brand colours |
| MongoDB driver | `motor` (async) | |
| Cloud storage | `boto3` (S3); `azure-storage-blob` optional | selectable via env |
| Config | `python-dotenv` | |
| Container | Dockerfile, Docker Compose, Kubernetes-ready | |

---

## 2. The three AI models — corrected

> **Revision note (model correctness):** The original spec listed
> `jjzha/jobbert-base-cased` for token-classification. That model has no
> classification head — it is a base masked-LM. Calling
> `pipeline("token-classification", model="jjzha/jobbert-base-cased")`
> returns generic `LABEL_0`/`LABEL_1` tags. Replaced with a proper skill
> NER model below. Flan-T5-base also dropped to Flan-T5-small to keep the
> Docker image and CPU latency within reason.

All three models are downloaded at image build time and cached locally.
No network calls at inference.

### Model 1 — Semantic similarity (kept)

| | |
|---|---|
| ID | `sentence-transformers/all-MiniLM-L6-v2` |
| Library | `sentence-transformers` |
| Disk | ~80 MB |
| Use | Encodes opportunity text and each `Experience.description` to dense vectors; cosine similarity drives Experience reordering for tailored CVs. |
| Why | TF-IDF doesn't capture meaning. A worker writing "supervised five builders" should match a "site foreman" role even with no shared vocabulary. |
| Latency on CPU | <100 ms per encoding. |

### Model 2 — Skill NER (replaced)

| | |
|---|---|
| ID (primary) | `algiraldohe/lm-ner-skills-recognition` |
| Library | `transformers` (`pipeline("token-classification", aggregation_strategy="simple")`) |
| Disk | ~440 MB |
| Use | Token-classification head fine-tuned for skill extraction. Run over `Opportunity.description` + concatenated `requiredSkills` text to produce a ranked list of skill spans. |
| Why | Has an actual classification head fine-tuned on skill annotations (unlike `jjzha/jobbert-base-cased`). |
| Latency on CPU | ~1–2 s per opportunity description. |
| **Fallback if unavailable** | Use Model 3 (Flan-T5-small) with a structured prompt: `"Extract skills from this job description as a JSON array. Description: {desc}"`. Then validate extracted strings against the existing `Skill` catalog already populated by the [skillSuggester service](../server/src/services/skillSuggester.service.js). This avoids hard dependency on a single HF model ID. |

### Model 3 — Summary generation (downsized)

| | |
|---|---|
| ID | `google/flan-t5-small` |
| Library | `transformers` (`pipeline("text2text-generation")`) |
| Disk | ~300 MB (down from ~990 MB for `flan-t5-base`) |
| Use | Generates 2–3 sentence professional summary from structured prompts. |
| Why | Instruction-tuned, follows structured prompts, runs on CPU. The `small` variant is ~3× faster on CPU and produces summaries good enough for a CV header for the SBOUP target user (informal/skilled workers). |
| Latency on CPU | 3–8 s per 100-token summary on a 4-core x86. **Honest expectation** — this is the dominant cost in CV generation. |
| **Hallucination caveat** | Even with constrained prompts, Flan-T5-small occasionally inserts filler ("highly motivated", "extensive experience"). Mitigation: post-process to strip a denylist of generic phrases before rendering, log the raw output for debugging, and render the worker's actual `Profile.bio` verbatim *next to* the AI summary (not blended into it) when bio is non-empty. |

> **Revision note (bio handling):** The original spec said "if bio > 50
> chars, use bio as base and let Flan-T5 refine it". This often produces
> *worse* output than the bio alone for a 250M-param model. Replaced with
> the rule below.

#### Bio rule (replaces original)

- If `Profile.bio` is **≥ 50 chars**: render the bio verbatim as the
  Professional Summary. Do not pass it through Flan-T5.
- If `Profile.bio` is **< 50 chars** or empty: generate a summary from
  Flan-T5 using the structured prompt below.
- The AI never rewrites human-authored content. It only fills gaps.

#### Summary prompt (baseline)

```
Write a 2–3 sentence professional summary in third person for a CV.
Person: {title}. Location: {location}.
Top skills: {top 3 primary ProfileSkill names}.
Most recent role: {jobTitle} at {companyName} for {durationMonths} months.
Constraints: do not invent credentials, certifications, or employers.
Use only the facts provided.
```

#### Summary prompt (tailored — adds opportunity context)

```
Write a 2–3 sentence professional summary in third person for a CV
targeting a {opportunity.title} role.
Person: {title}.
Relevant skills (matched against role): {matched ProfileSkill names}.
Top role keywords: {top 3 from Model 2 extraction}.
Constraints: do not invent credentials. Use only the facts provided.
```

### Image-size honesty check

| Component | Disk |
|---|---|
| `python:3.11-slim` base | ~150 MB |
| Torch CPU + transformers + sentence-transformers + reportlab + boto3 | ~900 MB |
| MiniLM | ~80 MB |
| Skill NER (Model 2) | ~440 MB |
| Flan-T5-small | ~300 MB |
| spaCy `en_core_web_sm` | ~50 MB |
| **Total image** | **~1.9 GB** |

Down from the ~3 GB the original spec implied. First build downloads
~820 MB of model weights from `huggingface.co`. **Mount a host volume
on `HF_MODEL_CACHE_DIR` so subsequent rebuilds don't re-download.**

---

## 3. Data schema — corrected to match actual Mongoose models

> **Revision note (schema accuracy):** The original spec listed
> conceptual fields that don't match the Mongoose schemas in
> [server/src/models/](../server/src/models/). Below are the *actual*
> fields the Python service must read/write.

### Profile (`profiles`) — see [Profile.js](../server/src/models/Profile.js)
```
_id, userId, title, bio, portfolioItems[{title,description,fileUrl,fileType,uploadedAt}],
location, visibility, createdAt, updatedAt
```

### ProfileSkill (`profileskills`)
```
_id, profileId, skillId, proficiencyLevel(beginner|intermediate|advanced|expert),
classification(primary|secondary)
```

### Skill (`skills`)
```
_id, skillName, category, isExternal, isCustom, source
```
> Note: `numberOfYears` is on `ProfileSkill` / `Experience`, not `Skill`.

### Experience (`experiences`)
```
_id, profileId, jobTitle, companyName, category, startDate, endDate,
durationMonths, description
```

### Education (`educations`)
```
_id, profileId, institution, qualification, fieldOfStudy, startYear, endYear
```

### Preference (`preferences`)
```
_id, profileId, personalityTraits[{trait,level}], workStyle, remotePreference,
learningWillingness
```

### Opportunity (`opportunities`)
```
_id, companyId, title, category, requiredSkills[ObjectId→Skill], description,
location, compensationRange, deadline, fraudRiskScore, status, createdAt
```

### UserCV (`usercvs`) — see [UserCV.js](../server/src/models/UserCV.js)
```
_id, userId, profileId, opportunityId(nullable),
templateType(chronological|skills_based|portfolio_focused),
cvFieldTarget(Mixed-snapshot, default {}),
description(maxlen 500),
fileUrl(required, maxlen 500),
fileFormat(pdf|docx|html, default pdf),
generatedAt
```

> **Revision note (cvFieldTarget):** The original spec treated
> `cvFieldTarget` as a string label ("Carpenter"). The actual model defines
> it as `Mixed` — a snapshot of which sections/skills/experiences were
> rendered, used for deterministic regeneration. Spec aligned: the request
> body uses a separate `targetField` (string label) for the user-facing
> target, while `cvFieldTarget` (object) is computed by the service and
> stored.

---

## 4. API contract — non-breaking with existing Node.js code

> **Revision note (no breaking changes):** The Node.js
> [ml.service.js:78](../server/src/services/ml.service.js#L78) currently
> calls `${CV_GENERATION_SERVICE_URL}/api/cv/generate`. Replacing this
> with `/cv/generate/baseline` and `/cv/generate/tailored` would break
> production. Instead, **keep `/api/cv/generate` as the contract** and let
> the request body's `opportunityId` field decide baseline vs tailored.
> The Node.js controller does not need to change.

### Endpoint 1 — Generate CV

`POST /api/cv/generate` — internal, requires `X-Internal-API-Key` header.

Request:
```json
{
  "userId": "string (ObjectId)",
  "profileId": "string (ObjectId)",
  "templateType": "chronological | skills_based | portfolio_focused",
  "opportunityId": "string (ObjectId) | null",
  "targetField": "string (e.g. 'Carpenter')",
  "selectedData": {
    "workExperience": true,
    "skillsAndCompetencies": true,
    "education": true,
    "communityWork": false
  },
  "description": "string (optional)"
}
```

If `opportunityId` is non-null → tailored flow (Models 1, 2, 3).
If `opportunityId` is null → baseline flow (Model 3 only).

Response:
```json
{
  "ok": true,
  "data": {
    "fileUrl": "string (pre-signed, 1 hour TTL)",
    "fileFormat": "pdf",
    "cvFieldTarget": { "renderedSections": [...], "skillIds": [...], "experienceIds": [...] }
  }
}
```

### Endpoint 2 — Health

`GET /health` →
```json
{ "status": "ok", "models_loaded": true }
```

`models_loaded` is true only when **all three** transformer models are
fully initialised. Used for the Kubernetes readiness probe.

> **Revision note:** History endpoint (`GET /cv/history/{userId}`) is
> dropped from the Python service. The Node.js layer already implements
> [GET /api/cv](../server/src/controllers/cv.controller.js#L41) reading
> `UserCV` directly. Two services owning the same query is duplication.

---

## 5. Algorithm — same shape as original, with realistic substitutions

### Step 1 — Validate
- 422 if `userId`/`profileId` missing or not found.
- 400 if `templateType` not in enum.
- 503 if models not loaded.

### Step 2 — Aggregate
Use `motor` to fetch Profile + ProfileSkill+Skill (joined) + Experience +
Education + Preference for the `profileId`. Build a `ProfileAggregate`
dataclass.

### Step 3 — AI processing

**3a — Summary (Model 3):** apply the Bio Rule above. If AI is used, run
Flan-T5-small with the appropriate prompt; strip generic-filler denylist
phrases before returning.

**3b — Keyword extraction (Model 2, tailored only):** run skill NER over
`Opportunity.description + requiredSkills.map(skillName).join(', ')`.
Take all spans with `score ≥ 0.5`, dedupe, rank by frequency. **Validate
each extracted span against the existing `skills` collection** — if a
near-match exists (case-insensitive `skillName`), use the canonical name.
This piggybacks on the ESCO-populated catalog and reduces hallucinated
skill names.

**3c — Section reordering (Model 1, tailored only):**
- Encode `Opportunity.title + ". " + description + ". " + top-5-keywords`
  as one query embedding.
- Encode each Experience description.
- Sort experiences by descending cosine similarity.
- Sort `ProfileSkill` entries: skills whose `skillId` is in
  `Opportunity.requiredSkills` first; among those, primary > secondary;
  remaining skills follow original order.

For baseline CVs, Experience is sorted by `startDate` descending and
ProfileSkill by `classification` (primary first) then alphabetically.

### Step 4 — Render PDF

Three template renderers in `templates/`. All use ReportLab Platypus, A4
(210mm × 297mm), 20mm margins, brand colours (orange `#F97316`, dark
`#1F2937`, header bg `#FFF7ED`).

| Template | Sections (in order) |
|---|---|
| `chronological` | Header → Summary → Experience (sorted) → Education → Skills → [Community Work] |
| `skills_based` | Header → Summary → Core Competencies (grouped by `Skill.category`) → Experience (condensed) → Education → [Community Work] |
| `portfolio_focused` | Header → Summary → Portfolio Highlights (`portfolioItems[]`) → Skills → Experience (condensed) → Education |

Sections whose `selectedData[key]` flag is `false` are omitted.

### Step 5 — Validate
- Reject (500 `CV_RENDER_FAILED`) only if PDF byte stream is empty.
- Log structured warnings (don't reject) for: empty Experience list,
  empty Skill list, summary < 30 words.

### Step 6 — Upload + URL

- Upload to S3 key `cvs/{userId}/{cvId}.pdf` (the cvId is generated
  client-side as a `uuid4` *before* DB insert so the same id is used in
  both the S3 key and the `UserCV._id`).
- Generate pre-signed URL with **TTL = 3600 seconds (1 hour)**, not 7 days.

> **Revision note (URL TTL):** 7-day pre-signed URLs for documents
> containing PII (names, contact info, work history) is a leak risk —
> anyone who obtains the URL via screenshot/log/copy-paste can download
> for a week with no auth. Tightened to 1 hour. The mobile client should
> request a fresh URL via the existing authenticated
> [GET /api/cv/:id](../server/src/controllers/cv.controller.js#L52)
> endpoint, which the Node.js layer can wire to a regenerate-URL helper
> on the Python service if needed.

> **Revision note (HEAD validation dropped):** The original spec said to
> HEAD-check the pre-signed URL before returning. Pre-signed URLs are
> generated client-side from the bucket policy — a HEAD-check after
> generation almost always succeeds (or fails for transient reasons),
> and doesn't catch the actual cause of "Could not open download link"
> on mobile, which is usually a content-type / Android intent issue.
> Set `Content-Type: application/pdf` and
> `Content-Disposition: attachment; filename="cv-{cvId}.pdf"` on upload
> instead — that's what mobile actually needs.

If upload or pre-signing throws: respond `502 CV_STORAGE_FAILED` /
`502 URL_GENERATION_FAILED`. **Do not write the UserCV document if either
fails.**

### Step 7 — Return cvId; Node.js owns the DB write

The Python service is **stateless w.r.t. UserCV**. It returns the generated
`cvId` (24-char hex, ObjectId-compatible) so the Node.js layer can use it
as the `_id` of its own `UserCV.create()`. This avoids two services
writing to the same collection — Node.js owns Mongoose schemas, Python
just produces artifacts.

> **Implementation revision (2026-05-04):** The original spec said
> Python should insert UserCV. During implementation we realised this
> was a layering violation: the Node.js controller already does the
> insert post-call, and having both layers write means the Python
> service has to know about Mongoose-shaped fields. Cleaner: Python
> returns `{ cvId, fileUrl, fileFormat, cvFieldTarget }`, Node.js
> writes the row using cvId as `_id` so the file URL and DB record
> share an identity. See
> [server/src/controllers/cv.controller.js:14-39](../server/src/controllers/cv.controller.js#L14-L39).

Response from §4 is what the Python service emits.

---

## 6. File structure

```
ai-services/cv-generation/
├── Dockerfile
├── requirements.txt
├── .env.example
├── main.py                     # FastAPI app + lifespan
├── config.py
├── models/
│   ├── request_models.py       # Pydantic request/response
│   └── db_models.py            # ProfileAggregate dataclass
├── services/
│   ├── ai_model_manager.py     # singleton; loads 3 models in lifespan
│   ├── profile_service.py      # motor fetch + aggregate
│   ├── summary_generator.py    # Flan-T5-small + bio rule
│   ├── keyword_extractor.py    # Skill NER + catalog validation
│   ├── semantic_ranker.py      # MiniLM + cosine
│   ├── cv_generator.py         # orchestrates §5
│   └── storage_service.py      # boto3 upload + presign
├── templates/
│   ├── base_template.py        # brand colours, layout helpers
│   ├── chronological.py
│   ├── skills_based.py
│   └── portfolio_focused.py
├── database/
│   └── mongo_client.py         # motor singleton
└── tests/
    ├── test_ai_model_manager.py
    ├── test_summary_generator.py
    ├── test_keyword_extractor.py
    ├── test_semantic_ranker.py
    ├── test_cv_generator.py
    └── test_api.py
```

---

## 7. requirements.txt

```
fastapi>=0.111.0
uvicorn[standard]>=0.29.0
motor>=3.4.0
pydantic>=2.7.0
python-dotenv>=1.0.0
sentence-transformers>=2.7.0
transformers>=4.41.0
torch>=2.3.0,<2.5.0           # CPU wheel; pin to avoid surprise breaks
spacy>=3.7.0
reportlab>=4.2.0
boto3>=1.34.0
azure-storage-blob>=12.20.0   # optional, only loaded when STORAGE_BACKEND=azure
slowapi>=0.1.9                 # rate-limiter for FastAPI
pytest>=8.2.0
pytest-asyncio>=0.23.0
moto>=5.0.0                    # mock S3 in tests
```

---

## 8. .env.example

```
MONGODB_URI=mongodb://localhost:27017/sboup_dev
MONGODB_DB_NAME=sboup_dev
INTERNAL_API_KEY=change-me

HF_MODEL_CACHE_DIR=/app/model_cache
HF_SEMANTIC_MODEL=sentence-transformers/all-MiniLM-L6-v2
HF_SKILL_NER_MODEL=algiraldohe/lm-ner-skills-recognition
HF_SUMMARY_MODEL=google/flan-t5-small
HF_SUMMARY_MAX_NEW_TOKENS=120

STORAGE_BACKEND=s3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
S3_BUCKET_NAME=sboup-cv-storage

AZURE_STORAGE_CONNECTION_STRING=
AZURE_BLOB_CONTAINER_NAME=sboup-cvs

CV_PRESIGNED_URL_EXPIRY_SECONDS=3600
RATE_LIMIT_PER_USER_PER_MINUTE=3

PORT=5003
LOG_LEVEL=INFO
TRANSFORMERS_OFFLINE=1
HF_HUB_OFFLINE=1
```

> **Revision note (port):** 5003 to match
> [docker-compose.yml](../docker-compose.yml). Original spec said 8001.

> **Revision note (offline env):** Both `TRANSFORMERS_OFFLINE=1` *and*
> `HF_HUB_OFFLINE=1` are needed; sentence-transformers checks the latter.

---

## 9. Dockerfile

Use `python:3.11-slim` base. Install only what's actually needed:

```
libpango-1.0-0 libcairo2 libffi-dev shared-mime-info
```

> **Revision note:** Original spec listed `libgdk-pixbuf2.0-0`. Not used
> by ReportLab. Removed.

Steps:

1. `pip install -r requirements.txt`
2. `python -m spacy download en_core_web_sm`
3. Pre-download all three HF models into `${HF_MODEL_CACHE_DIR}` so the
   image is fully self-contained:

```python
RUN python -c "
from sentence_transformers import SentenceTransformer
from transformers import pipeline, AutoTokenizer, AutoModelForSeq2SeqLM
import os
cache = os.environ.get('HF_MODEL_CACHE_DIR', '/app/model_cache')

SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2',
                    cache_folder=cache)

pipeline('token-classification',
         model='algiraldohe/lm-ner-skills-recognition',
         aggregation_strategy='simple',
         model_kwargs={'cache_dir': cache})

AutoTokenizer.from_pretrained('google/flan-t5-small', cache_dir=cache)
AutoModelForSeq2SeqLM.from_pretrained('google/flan-t5-small', cache_dir=cache)
print('All models cached.')
"
```

4. `ENV TRANSFORMERS_OFFLINE=1 HF_HUB_OFFLINE=1`
5. `EXPOSE 5003`
6. `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5003"]`

---

## 10. AI Model Manager — lifespan pattern

> **Revision note:** `@app.on_event("startup")` is deprecated in FastAPI
> 0.111. Use the lifespan context manager.

```python
# services/ai_model_manager.py
from contextlib import asynccontextmanager
from sentence_transformers import SentenceTransformer
from transformers import pipeline, AutoTokenizer, AutoModelForSeq2SeqLM
import os, logging

logger = logging.getLogger(__name__)

class AIModelManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.semantic_model = None
            cls._instance.ner_pipeline = None
            cls._instance.summary_pipeline = None
            cls._instance._models_loaded = False
        return cls._instance

    def load_models(self):
        cache = os.getenv("HF_MODEL_CACHE_DIR", "/app/model_cache")
        logger.info("Loading semantic model")
        self.semantic_model = SentenceTransformer(
            os.getenv("HF_SEMANTIC_MODEL"), cache_folder=cache
        )
        logger.info("Loading skill NER pipeline")
        try:
            self.ner_pipeline = pipeline(
                "token-classification",
                model=os.getenv("HF_SKILL_NER_MODEL"),
                aggregation_strategy="simple",
                model_kwargs={"cache_dir": cache},
            )
        except Exception as e:
            logger.warning("Skill NER failed to load: %s. Falling back to Flan-T5 prompt-based extraction.", e)
            self.ner_pipeline = None  # keyword_extractor.py handles None
        logger.info("Loading summary pipeline")
        tok = AutoTokenizer.from_pretrained(os.getenv("HF_SUMMARY_MODEL"), cache_dir=cache)
        mdl = AutoModelForSeq2SeqLM.from_pretrained(os.getenv("HF_SUMMARY_MODEL"), cache_dir=cache)
        self.summary_pipeline = pipeline("text2text-generation", model=mdl, tokenizer=tok)
        self._models_loaded = True
        logger.info("Models loaded")

    @property
    def models_loaded(self):
        return self._models_loaded

ai_models = AIModelManager()

@asynccontextmanager
async def lifespan(app):
    ai_models.load_models()
    yield
    # No teardown needed — process exit reclaims memory.
```

```python
# main.py
from fastapi import FastAPI
from services.ai_model_manager import lifespan, ai_models

app = FastAPI(lifespan=lifespan)

@app.get("/health")
async def health():
    return {"status": "ok", "models_loaded": ai_models.models_loaded}
```

---

## 11. Error handling

All errors return:
```json
{ "error": "ERROR_CODE", "message": "human-readable explanation" }
```

| Code | HTTP | When |
|---|---|---|
| `PROFILE_NOT_FOUND` | 404 | profile/user not in MongoDB |
| `INVALID_TEMPLATE` | 400 | `templateType` not in enum |
| `MODELS_NOT_READY` | 503 | `ai_models.models_loaded` is False |
| `CV_RENDER_FAILED` | 500 | empty PDF byte stream |
| `CV_STORAGE_FAILED` | 502 | upload exception |
| `URL_GENERATION_FAILED` | 502 | pre-sign exception |
| `RATE_LIMITED` | 429 | per-user limit exceeded |

All errors logged as structured JSON: `userId`, `profileId`, `error_code`,
`timestamp`, `detail`, `requestId`.

---

## 12. Rate limiting

> **Revision note (new section):** A CPU-bound endpoint with no rate
> limit is a self-DoS vector. The original spec didn't mention this.

Use `slowapi`, key on `userId`, default 3 requests/minute per user
(configurable via `RATE_LIMIT_PER_USER_PER_MINUTE`). Return 429
`RATE_LIMITED` when exceeded.

---

## 13. Mobile UI alignment

Mobile checkboxes map to `selectedData`:

| Checkbox | Field |
|---|---|
| Work Experience | `selectedData.workExperience` |
| Skills & Competencies | `selectedData.skillsAndCompetencies` |
| Education | `selectedData.education` |
| Community Work | `selectedData.communityWork` |

Template cards map to `templateType` enum values.

For the "Could not open download link" error: set
`Content-Type: application/pdf` and `Content-Disposition: attachment;
filename="cv-{cvId}.pdf"` on the S3 upload. The mobile client should
open the URL in the system browser, not in an in-app webview, otherwise
Android may interpret the response as text. (No HEAD validation needed.)

---

## 14. Implementation sequence

The same incremental order as the original, tightened:

1. **FastAPI skeleton + `/health`** — verify it runs on port 5003 and
   returns `models_loaded: false`.
2. **AIModelManager + lifespan** — `models_loaded: true` after startup.
   Test each model with a one-line fixture.
3. **MongoDB client + `profile_service.py`** — fetch a real
   `ProfileAggregate` from the dev database, assert all sub-collections
   present.
4. **AI services** — `summary_generator.py` (with bio rule),
   `keyword_extractor.py` (with catalog validation + Flan-T5 fallback),
   `semantic_ranker.py`. Unit-test each.
5. **Base template + `chronological.py`** — generate a PDF from a
   hardcoded `ProfileAggregate`, assert non-empty bytes.
6. **storage_service.py** — `moto` for tests; verify upload + presign +
   correct content-type/disposition headers.
7. **`cv_generator.py`** — orchestrate baseline + tailored. Integration
   test against dev MongoDB.
8. **`skills_based.py` + `portfolio_focused.py`**.
9. **`POST /api/cv/generate`** — wire to `cv_generator`. Integration
   test all error codes and all three template types.
10. **Dockerfile** — build, confirm `/app/model_cache` is populated,
    `/health` returns true within 60s, end-to-end POST returns a
    downloadable URL.

After each step, summarise what was built and what differs from this
spec, then state what step N+1 will produce.

---

## Summary of changes from the original draft

| # | Original | Revised | Why |
|---|---|---|---|
| 1 | `jjzha/jobbert-base-cased` for token-classification | `algiraldohe/lm-ner-skills-recognition` + Flan-T5 fallback | The original model has no classification head |
| 2 | `flan-t5-base` (~990 MB) | `flan-t5-small` (~300 MB) | Image size + CPU latency |
| 3 | `cvFieldTarget: string` in request | `targetField: string` in request, `cvFieldTarget: object` in DB | Match actual Mongoose schema |
| 4 | New endpoints `/cv/generate/baseline`, `/cv/generate/tailored` | Keep `/api/cv/generate`, branch on `opportunityId` | Don't break existing Node.js callers |
| 5 | 7-day pre-signed URL | 1-hour TTL | PII leak risk |
| 6 | HEAD-validate URL before returning | Drop validation; set Content-Type/Disposition on upload | HEAD-check is tautological; mobile error has different cause |
| 7 | `@app.on_event("startup")` | `lifespan` context manager | FastAPI 0.111 deprecation |
| 8 | "<3s summary on CPU" | "3–8s on CPU" | Honest expectation |
| 9 | Refine bio with Flan-T5 if > 50 chars | Use bio verbatim if ≥ 50 chars; only generate when missing | Small LLMs degrade good human-written bios |
| 10 | `MongoDB Atlas` | Local Docker MongoDB | Match deployment |
| 11 | Port 8001 | Port 5003 | Match docker-compose |
| 12 | No rate limit | `slowapi`, 3/min/user | Self-DoS protection |
| 13 | History endpoint duplicated | Drop; Node.js already owns it | DRY |
| 14 | `libgdk-pixbuf2.0-0` system dep | Removed | Unused by ReportLab |
| 15 | Schema fields wrong (numberOfYears on Skill, etc.) | Aligned with [server/src/models/](../server/src/models/) | Schema accuracy |
