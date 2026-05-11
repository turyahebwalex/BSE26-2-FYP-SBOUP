# SBOUP Learning Engine AI Service — Implementation Spec

This is the codebase-aligned, deployment-realistic specification for the
Learning Engine service. It is a sibling to
[cv-generation-spec.md](cv-generation-spec.md) — the two services are
deliberately structurally identical so a contributor familiar with one
can navigate the other without re-learning conventions. Differences from
the original guidelines pinned in
[ai-services/learning-engine/learning-engine guidelines.md](../ai-services/learning-engine/learning-engine%20guidelines.md)
are flagged in `> Revision note:` callouts.

---

## 1. Architectural context

The Learning Engine is a Python microservice in the SBOUP Intelligence
Layer, implementing the **Continuous and Adaptive Learning Module**
described in SDD §3.2.5 and §5.4. It:

- Exposes an internal REST API consumed by the Node.js Application
  Services Layer (`server/`). The mobile and web clients never call it
  directly.
- Reads worker profile, opportunity, and skill catalog data from MongoDB
  (collections: `profiles`, `profileskills`, `skills`, `opportunities`,
  `users`, `learningpaths`).
- Calls the **matching-engine** (`http://matching-engine:5001`) as the
  authoritative source of `missingSkills[]` for any opportunity-driven
  request. The §6.0 consistency contract is the single most important
  behavioural rule in this service.
- Uses three Hugging Face transformer models for semantic skill
  matching, "WHY THIS COURSE?" rationale generation, and NER-based bio
  mining.
- Aggregates learning resources from three external providers
  (YouTube Data API v3, Coursera, edX) plus an offline curated JSON
  catalog.
- Persists `skillgaplogs` (audit, per SDD §5.4 step 5) and
  `learningprogress` (audit) collections. It **upserts** into
  `profileskills` when a worker completes a resource. It does **not**
  write to `learningpaths` — Node.js owns that collection.

> **Revision note (no LearningPath writes):** The original guidelines
> implied this service could touch `learningpaths`. Aligned with the
> cv-generation pattern: Node.js owns Mongoose schemas, Python returns
> artefacts. The learning-engine emits `resources[]` shaped to fit the
> Node.js `LearningPath.resources` subdoc; the Node.js controller does
> the insert.

### Stack

| Concern | Choice | Notes |
|---|---|---|
| Language | Python 3.11 | |
| Web framework | FastAPI | mirrors cv-generation |
| AI backbone | Hugging Face Transformers + sentence-transformers | three models, see §2 |
| HTTP client | `httpx.AsyncClient` | matching-engine + provider APIs |
| MongoDB driver | `motor` (async) | |
| Rate limiter | `slowapi` | keyed on `userId` |
| Config | `python-dotenv` | |
| Container | Dockerfile, Docker Compose, GHCR | |

---

## 2. The three AI models

> **Revision note (NER model swap):** The original guidelines specified
> `jjzha/escoxlmr_skill_extraction` (XLM-R-large, ~2.2 GB on disk). That
> single model dominated the published image at ~2.9 GB compressed,
> which was painful to pull on throttled campus links. Swapped to
> `jjzha/jobbert_skill_extraction` (BERT-base, ~440 MB) — same author,
> same task, ~5x smaller. Runtime has a graceful fallback to Flan-T5
> prompt extraction if the swap fails to load, so degradation is
> tolerated, not fatal.

> **Revision note (no in-build preload):** The original guidelines
> required `RUN python scripts/preload_models.py` in the Dockerfile to
> bake weights into the image. Removed during the image-shrink refactor:
> the runtime fetches models on first request into the persistent
> `learning_model_cache` Docker volume. One-time cost per host, then
> instant on every restart. The published image dropped from ~2.9 GB →
> ~430 MB compressed. The preload script is retained as a manual
> offline-prep tool (`python scripts/preload_models.py` inside the
> container).

All three models are held by a singleton AI Model Manager loaded in the
FastAPI lifespan. MiniLM is **required** — if it fails to load the
service comes up unhealthy (`models_loaded: false`). The other two are
**best-effort** — failures degrade specific features without taking the
service down.

### Model 1 — Semantic similarity (required)

| | |
|---|---|
| ID | `sentence-transformers/all-MiniLM-L6-v2` |
| Library | `sentence-transformers` |
| Disk | ~90 MB |
| Use | (a) Synonym-tolerant skill matching in `compute_skill_deficit` — cosine cutoff `SEMANTIC_MATCH_THRESHOLD=0.75`. (b) Resource relevance scoring against `"<skillName> tutorial"`. (c) Local fallback for Dashboard Fit when the matching-engine is down. |
| Why | String-equal skill match fails informal workers: a profile listing "bricklaying" should match an opportunity requiring "masonry" (≈0.81 cosine on MiniLM). |
| Latency on CPU | <100 ms per encoding. Profile embeddings are batched in a single `.encode()` call — per-skill encoding inside the loop is ~10× slower for typical 5–30 skill profiles. |

### Model 2 — Explanation generation (best-effort but heavily used)

| | |
|---|---|
| ID | `google/flan-t5-small` |
| Library | `transformers` (`pipeline("text2text-generation")`) |
| Disk | ~300 MB |
| Use | (a) Per-resource "WHY THIS COURSE?" rationale (§6.2.4 panel D). (b) Pathway-level header rationale. (c) Fallback JSON-array extraction for the skill extractor when NER is unavailable. |
| Why | Workers see *why* this sequence was chosen for them, not just a list of links. Same model already proven in cv-generation. |
| Latency on CPU | 3–8 s per generation. For a typical 6-resource pathway that's 7 calls (1 pathway + 6 per-resource), ≈3–6 s total. Acceptable for an interactive request; no batching, no async parallelism (the `transformers` pipeline is not thread-safe across concurrent generations). |
| **Hallucination caveat** | Flan-T5-small echoes prompt fragments back as output more often than larger variants. Mitigation: same three-tier fallback as cv-generation — LLM → strip `GENERIC_FILLER` denylist → deterministic fact-pack template if output is < 8 words after stripping. The field is **never empty** even when `HF_SUMMARY_MODEL` is unset. |

### Model 3 — Skill NER (best-effort, gracefully degrades)

| | |
|---|---|
| ID | `jjzha/jobbert_skill_extraction` |
| Library | `transformers` (`pipeline("token-classification", aggregation_strategy="simple")`) |
| Disk | ~440 MB |
| Use | (a) `extract_from_bio(profile)` mines `Profile.bio` for skills the worker hasn't formally declared as `ProfileSkill`. The gap analyser merges these into the profile-skill list before either match stage runs. (b) `extract_resource_skill(resource)` populates `bridgesSkill` for provider responses (YouTube, edX) that don't declare it. |
| Why | Informal workers describe skills in prose. A bio like "I've been doing house painting and minor electrical work for 8 years" should count toward fit without forcing the worker to also fill in structured skill rows. |
| **Fallback chain** | (1) NER pipeline if loaded → aggregate spans with `score ≥ 0.5`, dedupe. (2) NER unavailable → Flan-T5 prompt: `"Extract a JSON array of distinct, short skill names from: <text>"`. (3) Both unavailable → return `[]` / `None`. Service still works; only the bio-mining feature degrades. |
| **Catalog validation (mandatory)** | Every NER span round-trips through `_validate_against_catalog`. Spans that don't match a canonical `Skill.skillName` are dropped, not invented. Same guardrail as cv-generation's `keyword_extractor.py`. |

### Image-size honesty check (post-shrink)

| Component | Disk |
|---|---|
| `python:3.11-slim` base + apt libs (`libffi-dev` only) | ~150 MB |
| torch CPU + transformers + sentence-transformers + httpx + motor | ~700 MB |
| Application code | ~5 MB |
| **Image total (no models baked in)** | **~860 MB on disk** |
| **Image total (registry-compressed)** | **~430 MB** |
| MiniLM weights (downloaded to volume at runtime) | ~90 MB |
| Flan-T5-small weights (downloaded to volume at runtime) | ~300 MB |
| jobbert weights (downloaded to volume at runtime) | ~440 MB |
| **`learning_model_cache` volume after first run** | **~830 MB persistent** |

Down from ~2.9 GB published before the image-shrink refactor. The
volume is reused across rebuilds, so the only host-pulling pain is the
initial 430 MB image pull plus the ~830 MB one-time runtime download.

---

## 3. Data schema

Same Mongoose models as cv-generation reads. Quoted by collection name
to match the conventions in the codebase.

### Profile (`profiles`)
```
_id, userId, title, bio, portfolioItems[...], location, visibility,
createdAt, updatedAt
```

### ProfileSkill (`profileskills`)
```
_id, profileId, skillId, proficiency(beginner|intermediate|advanced|expert),
classification(primary|secondary|bio_inferred)
```

> **Revision note (`bio_inferred`):** A new classification value
> documented as the convention for skills detected by NER over
> `Profile.bio`. These records exist **only for the duration of the
> request** — they are never persisted. Persistence requires explicit
> `ProfileSkill` writes through the Node.js profile flow (the user's
> consent gate). An AI service must not bypass that gate.

### Skill (`skills`)
```
_id, skillName, category, isExternal, isCustom, source
```

### Opportunity (`opportunities`)
```
_id, companyId, title, category, requiredSkills[ObjectId→Skill],
experienceLevel(entry|mid|senior), description, location,
compensationRange, status, createdAt
```

> **Revision note (required-level inference):** `Opportunity.requiredSkills`
> stores only skill IDs, not levels. The gap analyser reads
> `Opportunity.experienceLevel` if present and maps
> `entry|mid|senior → intermediate|advanced|expert`. If absent, defaults
> to `intermediate`. Documented in the function docstring.

### Collections this service writes

| Collection | Purpose | Written from |
|---|---|---|
| `skillgaplogs` | SDD §5.4 step 5 — audit log of every pathway generation | `learning_path_generator._log_skill_gap` |
| `learningprogress` | Audit log of resource completions | `progress_tracker.mark_resource_completed` |
| `profileskills` | Upsert when a worker completes a resource that bridges a missing skill | `progress_tracker.mark_resource_completed` |

The service does **not** touch `learningpaths` — Node.js owns it.

---

## 4. API contract

All routes return the structured envelope used by cv-generation. Errors
always look like `{ "error": "CODE", "message": "..." }`. All routes
accept `X-Internal-API-Key` and enforce it when `INTERNAL_API_KEY` is
non-empty.

### Endpoint 1 — Health

`GET /health`

```json
{
  "status": "ok",
  "models_loaded": true,
  "semantic_model_loaded": true,
  "summary_pipeline_loaded": true,
  "ner_pipeline_loaded": true
}
```

> **Revision note (per-model flags):** The original guidelines specified
> a single `models_loaded` boolean. Expanded to report per-model status
> so the operator can tell *which* model failed when something degrades.
> `models_loaded` remains the gating flag (true iff MiniLM is up — the
> only required model).

### Endpoint 2 — Generate learning pathway

`POST /api/learning/generate` — backward-compatible with the existing
[server/src/services/ml.service.js](../server/src/services/ml.service.js)
call shape.

Request:
```json
{
  "userId": "ObjectId string",
  "targetSkill": "Python",
  "opportunityId": "ObjectId string"
}
```

Exactly one of `targetSkill` or `opportunityId` is required. If both,
`opportunityId` wins and `targetSkill` is treated as a hint.

Response:
```json
{
  "ok": true,
  "data": {
    "consistencyMode": "matching-engine | standalone | fallback",
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
    "pathwayRationale": "Two-sentence Flan-T5 explanation of the chosen sequence.",
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
        "whyThisCourse": "One-to-two sentence Flan-T5 rationale.",
        "isCompleted": false
      }
    ],
    "skillGapLogId": "ObjectId string"
  }
}
```

`resources[]` is a strict superset of the Mongoose `LearningPath.resources`
subdoc. Mongoose strips unknown keys, so the extra fields
(`relevanceScore`, `finalScore`, `bridgesSkill`, `whyThisCourse`,
`priceLabel`, `difficultyLevel`, `rating`) are safe. The required core
six are `title`, `url`, `provider`, `cost`, `estimatedDuration`, `type`
(one of `video|course|article|tutorial`).

### Endpoint 3 — Skill gap analysis (no resource fetch, no DB write)

`POST /api/learning/skill-gaps`

Request:
```json
{ "profileId": "ObjectId", "opportunityId": "ObjectId" }
```

Response:
```json
{
  "ok": true,
  "data": {
    "consistencyMode": "matching-engine | fallback",
    "missingSkills": ["JavaScript", "React"],
    "matchBreakdown": { /* matching-engine breakdown, passed through */ },
    "proficiencyShortfalls": [
      { "skill": "Python", "current": "beginner", "required": "advanced" }
    ],
    "aliasHints": [ /* enrichment, never authoritative */ ],
    "totalGapScore": 1.0
  }
}
```

### Endpoint 4 — Dashboard fit (drives §6.2.4 worker dashboard)

`POST /api/learning/dashboard-fit`

Request: `{ "userId": "ObjectId" }`

Response:
```json
{
  "ok": true,
  "data": {
    "consistencyMode": "matching-engine | fallback",
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

Derived from
`GET ${MATCHING_SERVICE_URL}/api/match/recommendations/{userId}` —
bucketed by `Opportunity.category`, with `fitScore` = mean of
`matchScore` across the bucket and `missingSkills` frequency-sorted.
Local MiniLM fallback runs when the matching-engine is unreachable.

### Endpoint 5 — Mark progress

`POST /api/learning/progress`

Request:
```json
{
  "userId": "ObjectId",
  "learningPathId": "ObjectId",
  "resourceUrl": "string",
  "isCompleted": true
}
```

Upserts the worker's `ProfileSkill` for the resource's `bridgesSkill`
(bumping proficiency one level if the user has no record, else recording
the completion in `learningprogress`). The matching-engine reads
`profileskills` fresh on every score call, so the next match-score call
automatically reflects the new skill state — the feedback loop closes
through the database, no HTTP cache-invalidation needed.

Response: `{ "ok": true, "data": { "profileSkillsUpdated": 1 } }`

---

## 5. The §6.0 consistency contract — read before §6.1

The mobile **Match Breakdown card** on the
[Discover](../mobile/src/screens/worker/DiscoverScreen.js) and
[OpportunityDetail](../mobile/src/screens/worker/OpportunityDetailScreen.js)
screens is rendered directly from the matching-engine's
`POST /api/match/score` response. The "Skills you are missing" chips on
that card and the skills the learning-engine builds pathways for
**must be identical** when the worker is looking at the same
opportunity. If they diverge, the worker sees two contradictory views.

### The rule

For any **opportunity-driven** request:

1. The learning-engine **first** calls the matching-engine at
   `POST ${MATCHING_SERVICE_URL}/api/match/score` with
   `{ profileId, opportunityId }`.
2. The returned `missingSkills[]` is **authoritative**. Pathways are
   built for exactly those skill names, in that order. No semantic
   match, no NER, no bio mining may add, drop, or rename items in that
   list.
3. The matching-engine's full `breakdown` and `matchScore` are passed
   through verbatim under `data.matchBreakdown` — clients can render
   the same card from one learning-engine call instead of two round
   trips.
4. If the matching-engine call fails (network, 5xx, timeout), the
   service falls through to its own `skill_gap_analyser` and sets
   `data.consistencyMode = "fallback"`. The client knows the card may
   differ. The service does not 503.

For **target-skill** requests (no `opportunityId`), the matching-engine
has nothing to say. The local analyser is the source of truth and
`consistencyMode = "standalone"`.

### The enrichment layer

Semantic skill matching, NER bio mining, and proficiency analysis
**do not override** the matching-engine's `missingSkills`. They run in
parallel and surface in a separate `data.aliasHints[]` array:

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

The mobile UI surfaces these as a soft "did you mean…?" prompt under
the missing-skills list. The chips themselves still come from
`missingSkills`. The learning-engine's smarter analysis becomes a tool
for the worker to improve their profile, not a source of UI
inconsistency.

### `services/match_consumer.py`

Single async helper `fetch_match_breakdown(profile_id, opportunity_id)`.
`httpx.AsyncClient` with a **5 s timeout**, **no retry** — failures
inside the window count as fallback. On any exception returns `None`;
the orchestrator interprets that as "fall through to local analyser".

> The 5 s timeout is a deliberate ceiling. Don't extend it. Don't retry.
> The worker would rather see a fast fallback marker than a 30 s
> spinner.

---

## 6. Algorithm — module-by-module

### 6.1 Skill Gap Analyser

Two roles depending on context:

- **Opportunity-driven mode** — matching-engine is authoritative. The
  analyser produces `aliasHints[]` and `proficiencyShortfalls[]` only.
- **Target-skill mode** — the analyser computes `missingSkills` itself
  using a two-stage match.

The two-stage match:

1. **Exact lowercase match** (cheap, deterministic) — `profile_index`
   keyed on `skillName.lower()`.
2. **MiniLM cosine fallback** — if exact match fails, embed the
   required skill name and compare against the batched profile-skill
   embeddings. Hit if `similarity ≥ SEMANTIC_MATCH_THRESHOLD` (default
   `0.75`).

```python
total_gap_score = (len(missing) + 0.5 * len(shortfalls)) / max(1, len(required))
```

**Why 0.75:** MiniLM places truly synonymous short phrases
(bricklaying/masonry, joiner/carpenter, web designer/UI designer) at
0.78–0.92 cosine; related-but-distinct skills (Python/JavaScript) at
0.55–0.70; unrelated below 0.40. 0.75 sits cleanly inside the synonym
band. Tunable via `SEMANTIC_MATCH_THRESHOLD` env var.

**Bio augmentation:** at the start of `compute_skill_deficit`, the
analyser calls `skill_extractor.extract_from_bio(profile)` and merges
the inferred skills into the profile-skill list before either match
stage runs. The semantic-match path sees the augmented list.

### 6.2 Resource Aggregator scoring

For each candidate from each provider:

```
relevanceScore  ∈ [0,1] — semantic cosine(query="<skill> tutorial",
                                          doc=title + description)
                          using MiniLM. Falls back to keyword overlap
                          if MiniLM is None.
qualityScore    ∈ [0,1] — normalised(rating/5) *
                          sqrt(1 + log10(1 + reviewCount)) / constant,
                          capped at 1.
costScore       ∈ {1.0 if cost==0 else 0.4} — strong free preference
                          per SDD §3.2.5 (CAL003).
difficultyScore ∈ [0,1] — beginner=1.0, intermediate=0.7, advanced=0.4

finalScore = 0.5*relevanceScore
           + 0.2*qualityScore
           + 0.2*costScore
           + 0.1*difficultyScore
```

> The SDD §5.4 step 4 specifies `0.7*relevance + 0.3*difficulty`. The
> formula above extends that to honour the SDD §3.2.5 prose ("filter by
> relevance, cost, learner ratings, completion rates"). Documented as a
> deliberate extension in the function docstring.

### 6.3 Pathway ordering

After scoring, candidates are grouped by `bridgesSkill`. Within each
group: sort by `(difficultyScore desc, finalScore desc)` so beginner
content comes before advanced. Top 3 per skill. Concatenate groups in
the same order as `missingSkills`.

### 6.4 Provider behaviour

| Provider | Endpoint | Free-detection | Skip on |
|---|---|---|---|
| YouTube | `https://www.googleapis.com/youtube/v3/search` (`q="<skill> tutorial"`, `type=video`, `videoDuration=long`, `maxResults=5`) | All long-form tutorials → `cost=0` | `YOUTUBE_API_KEY` empty, HTTP 403/429 |
| Coursera | `${COURSERA_BASE_URL}/courses.v1?q=search&query=<skill>` | Only `cost=0` if landing copy explicitly mentions financial aid/audit-free; else `cost=null`, `priceLabel="Paid (audit may be free)"`. **No invented prices.** | 4xx/5xx, timeout |
| edX | `${EDX_BASE_URL}/courses/v1/courses/?search_term=<skill>` | Same free-detection rule | 4xx/5xx, timeout |
| Curated | `data/curated_resources.json` — keyed by skill name | Pre-seeded for 10 SBOUP categories | Never fails; always available offline |

All providers return `list[ResourceCandidate]`; the aggregator merges,
**dedupes by `url`**, scores, orders, and calls
`skill_extractor.extract_resource_skill()` to populate `bridgesSkill`
for any resource where the provider didn't declare one.

### 6.5 Dashboard Fit (derived from matching-engine recommendations)

Pipeline:

1. `GET ${MATCHING_SERVICE_URL}/api/match/recommendations/{userId}` →
   top-ranked opportunities (matching-engine returns up to 20 with
   `matchScore ≥ 5`).
2. Bucket by `Opportunity.category` (single Mongo lookup —
   recommendations only carry `opportunityId`, `title`, `matchScore`,
   `missingSkills`).
3. For each bucket:
   - `fitScore = mean(matchScore) / 100` (normalise 0–100 → 0–1)
   - `matchingOpportunityCount = len(bucket)`
   - `missingSkills = Counter(skill for opp in bucket for skill in opp.missingSkills).most_common()` — frequency-sorted, as SDD §3.2.5 mandates ("missing the skills the most opportunities ask for first").
4. Filter to `fitScore ≥ 0.4`, order by `fitScore desc`.
5. **Optional enrichment**: run NER bio-mining + MiniLM semantic match
   against the union of category `missingSkills`. Surface results as
   `aliasHints[]` per category. Never remove or rename a skill in
   `missingSkills`; only suggest profile updates.

If the recommendations endpoint is unavailable, fall through to local
computation using `Opportunity` documents directly (bucket published
opportunities by category, run MiniLM cosine over category skill
rosters) and set `consistencyMode: "fallback"`.

> **Why derive from matching-engine:** Per §5, the matching-engine is
> the source of truth for any per-opportunity gap. Dashboard Fit is a
> per-category aggregate of those per-opportunity facts. Computing it
> independently would produce a category-level view that disagrees
> with the per-opportunity Match Breakdown card the worker sees on
> tap-through.

### 6.6 Explanation Generator

Structural twin of
[cv-generation/services/summary_generator.py](../ai-services/cv-generation/services/summary_generator.py).
Same imports, same `GENERIC_FILLER` denylist (extended with
`"highly recommended"`, `"industry-leading"`, `"cutting-edge"`,
`"world-class"`), same three-tier fallback, same 8-word output guard.

Two public functions:

- `explain_resource(resource, missing_skill, profile, opportunity=None) -> str`
  — 1–2 sentence rationale naming the gap being bridged.
- `explain_pathway(deficit, ordered_resources, profile, opportunity=None) -> str`
  — 2–3 sentence header framing the journey.

**Fallback chain (mandatory):**
1. Flan-T5 with the structured prompt (no invented credentials).
2. Strip `GENERIC_FILLER`.
3. If output < 8 words, deterministic fact-pack:
   `f"Bridges the {missing_skill} gap. {difficultyLevel.capitalize()}-level {type} from {provider}."`

The `whyThisCourse` and `pathwayRationale` fields are **never empty**
even when `HF_SUMMARY_MODEL` is unset.

**Performance:** for a 6-resource pathway → 7 Flan-T5 calls → ~3–6 s
on CPU. No batching, no async parallelism (pipeline not thread-safe).

> **Caching opportunity (deferred):** per-resource explanations are
> deterministic given `(resource.url, missing_skill)`. A Redis cache
> keyed on that tuple would eliminate ~80 % of LLM calls in steady
> state. Defer until production load measurement justifies it.

### 6.7 Skill Extractor

Structural twin of
[cv-generation/services/keyword_extractor.py](../ai-services/cv-generation/services/keyword_extractor.py).
Same `_normalise`, `_validate_against_catalog`, `_ner_extract`,
`_llm_extract` shape.

- `extract_from_bio(profile) -> list[SkillRef]` — runs NER on
  `profile.bio`, validates against the canonical `skills` collection,
  filters out skills the profile already declares as `ProfileSkill`,
  returns records with `proficiency="intermediate"` and
  `classification="bio_inferred"`.
- `extract_resource_skill(resource) -> str | None` — runs NER on
  `resource.title + resource.description`, returns the
  highest-confidence canonical skill name. Called only when the
  provider response didn't already declare `bridgesSkill`.

Every NER span round-trips through `_validate_against_catalog`. Spans
not matching a canonical `Skill.skillName` are **dropped, not invented**.

---

## 7. Configuration (`config.py`)

```
MONGODB_URI=mongodb://localhost:27017/sboup_dev
MONGODB_DB_NAME=sboup_dev
INTERNAL_API_KEY=

# AI models
HF_MODEL_CACHE_DIR=/app/model_cache
HF_SEMANTIC_MODEL=sentence-transformers/all-MiniLM-L6-v2
HF_SUMMARY_MODEL=google/flan-t5-small
HF_SUMMARY_MAX_NEW_TOKENS=80
HF_SKILL_NER_MODEL=jjzha/jobbert_skill_extraction
SEMANTIC_MATCH_THRESHOLD=0.75

# Resource providers
YOUTUBE_API_KEY=
COURSERA_BASE_URL=https://api.coursera.org/api
EDX_BASE_URL=https://courses.edx.org/api
PROVIDER_HTTP_TIMEOUT_SECONDS=8

# Matching-engine consistency contract
MATCHING_SERVICE_URL=http://localhost:5001
MATCHING_SERVICE_TIMEOUT_SECONDS=5

# Networking
PORT=5004
LOG_LEVEL=INFO
RATE_LIMIT_PER_USER_PER_MINUTE=10

# HF offline toggles (mirror cv-generation)
TRANSFORMERS_OFFLINE=0
HF_HUB_OFFLINE=0
```

> **Revision note (port):** 5004 to match
> [docker-compose.yml](../docker-compose.yml) and the existing
> `LEARNING_SERVICE_URL` env on the Node.js server.

> **Revision note (NER default):** `jjzha/jobbert_skill_extraction`,
> not the original `jjzha/escoxlmr_skill_extraction`. See §2 for the
> reasoning.

---

## 8. Dockerfile

`python:3.11-slim` base. Install only what's required (`libffi-dev` is
enough — no Cairo/Pango here, we don't render PDFs).

Resilience patterns mirrored from cv-generation:
- BuildKit `--mount=type=cache,target=/root/.cache/pip` so partially
  downloaded wheels survive across builds.
- Shell-level 5-attempt retry loop around `pip install` — pip's
  `--retries` only retries the current HTTP request, not the resolve as
  a whole, so a hard timeout still fails the RUN otherwise.
- `--extra-index-url https://download.pytorch.org/whl/cpu` and
  `torch==2.4.1+cpu` to avoid the ~800 MB CUDA wheel.

**Models are NOT baked in.** The original guidelines had a `RUN python
scripts/preload_models.py` step; removed during the image-shrink
refactor. The runtime fetches the three models on first request into
the `learning_model_cache` Docker volume mounted at `/app/model_cache`
(see docker-compose). One-time per host, then reused across rebuilds.

To preload manually before going offline:
```bash
docker exec sboup-learning python scripts/preload_models.py
```

`EXPOSE 5004` /
`CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5004"]`.

---

## 9. File structure

```
ai-services/learning-engine/
├── Dockerfile
├── requirements.txt
├── .env.example
├── pytest.ini
├── pyrightconfig.json
├── conftest.py
├── main.py                     # FastAPI app + lifespan
├── config.py
├── database/
│   ├── __init__.py
│   └── mongo_client.py
├── models/
│   ├── __init__.py
│   ├── db_models.py            # dataclasses: WorkerSkillState, SkillGap,
│   │                           # ResourceCandidate, LearningPathDraft,
│   │                           # OpportunityFit, CategoryFit
│   └── request_models.py       # Pydantic request/response + error envelope
├── services/
│   ├── __init__.py
│   ├── ai_model_manager.py     # singleton; loads MiniLM + Flan-T5 + NER
│   ├── profile_service.py      # MongoDB reads
│   ├── taxonomy_service.py     # category-rollup Dashboard Fit
│   ├── match_consumer.py       # §5 consistency contract
│   ├── skill_extractor.py      # §6.7 NER + LLM fallback
│   ├── skill_gap_analyser.py   # §6.1 two-stage match
│   ├── resource_aggregator/
│   │   ├── __init__.py         # aggregate_resources()
│   │   ├── base.py             # Provider Protocol + scoring math
│   │   ├── youtube_provider.py
│   │   ├── coursera_provider.py
│   │   ├── edx_provider.py
│   │   └── curated_provider.py
│   ├── explanation_generator.py # §6.6 WHY THIS COURSE + pathway header
│   ├── progress_tracker.py     # §3.2.5 progress tracker
│   ├── matching_feedback.py    # thin hook (audit-log today, HTTP later)
│   └── learning_path_generator.py # §5.4 GenerateLearningPath orchestrator
├── data/
│   └── curated_resources.json
├── scripts/
│   ├── __init__.py
│   └── preload_models.py       # manual offline-prep tool
└── tests/
    ├── __init__.py
    ├── test_api.py
    ├── test_skill_gap_analyser.py
    ├── test_resource_aggregator.py
    ├── test_learning_path_generator.py
    ├── test_explanation_generator.py
    ├── test_skill_extractor.py
    ├── test_match_consumer.py
    └── test_progress_tracker.py
```

---

## 10. requirements.txt

```
--extra-index-url https://download.pytorch.org/whl/cpu

fastapi>=0.111.0
uvicorn[standard]>=0.29.0
motor>=3.4.0
pymongo>=4.7.0
pydantic>=2.7.0
python-dotenv>=1.0.0
sentence-transformers>=2.7.0,<5.0
transformers>=4.41.0,<5.0
huggingface_hub>=0.23.0,<1.0
torch==2.4.1+cpu
slowapi>=0.1.9
httpx>=0.27.0
numpy>=1.26.0,<3.0
pytest>=8.2.0
pytest-asyncio>=0.23.0
respx>=0.21.0
```

> **Revision note (no `reportlab`, no `boto3`):** The learning-engine
> generates no PDFs and stores no artefacts. Removed from
> requirements compared to cv-generation.

---

## 11. AI Model Manager — lifespan pattern

Same pattern as cv-generation. Three model handles:
- `semantic_model` (MiniLM) — required. `models_loaded` flips True only
  if this succeeds.
- `summary_pipeline` (Flan-T5-small) — best-effort. Failure degrades the
  explanation generator to fact-pack templates.
- `ner_pipeline` (jobbert) — best-effort. Failure degrades the skill
  extractor to the Flan-T5 LLM fallback, then to no-op.

Each model load is wrapped in try/except with a `logger.warning` on
failure. `models_loaded` reports MiniLM only; per-model flags are
surfaced through `/health` for operator visibility.

```python
@asynccontextmanager
async def lifespan(app):
    ai_models.load_models()
    yield
```

---

## 12. Error handling

All errors return:
```json
{ "error": "ERROR_CODE", "message": "human-readable explanation" }
```

| Code | HTTP | When |
|---|---|---|
| `PROFILE_NOT_FOUND` | 404 | userId/profileId not in MongoDB |
| `OPPORTUNITY_NOT_FOUND` | 404 | opportunityId not in MongoDB |
| `INVALID_REQUEST` | 422 | neither `targetSkill` nor `opportunityId` provided |
| `MODELS_NOT_READY` | 503 | `ai_models.models_loaded` is False |
| `RATE_LIMITED` | 429 | per-user limit exceeded |
| `INTERNAL_ERROR` | 500 | unhandled exception |

All errors logged as structured JSON with `userId`/`profileId`,
`error_code`, `consistencyMode`, `timestamp`, `detail`.

> Note: `MATCHING_ENGINE_UNREACHABLE` is **not** a returned error. It
> degrades silently to `consistencyMode: "fallback"` with a 200 OK, per
> §5 — the service must not 503 when the matching-engine is down.

---

## 13. Rate limiting

`slowapi`, keyed on `userId`, default **10 requests/minute per user**
(configurable via `RATE_LIMIT_PER_USER_PER_MINUTE`). Higher than
cv-generation (3/min) because pathway generation is less expensive than
PDF rendering, and the §6.2.4 worker dashboard makes multiple calls per
session.

---

## 14. Mobile UI alignment

The §6.2.4 Upskill screen consumes the following fields:

| Wireframe element | Response field |
|---|---|
| "X critical gaps" badge | `data.criticalGapCount` |
| Analysis summary line | `data.analysisSummary` |
| Pathway header text | `data.pathwayRationale` |
| Resource cards | `data.resources[]` |
| "WHY THIS COURSE?" panel | `resources[i].whyThisCourse` |
| Bridge-skill chip | `resources[i].bridgesSkill` |
| Price label / Free badge | `resources[i].priceLabel` + `cost` |
| Difficulty pill | `resources[i].difficultyLevel` |
| "Did you mean…?" hint under missing-skills | `data.aliasHints[]` |

The mobile Match Breakdown card on Discover / OpportunityDetail renders
from `data.matchBreakdown` (passed through verbatim from the
matching-engine) — one learning-engine call replaces two round trips.

---

## 15. Implementation sequence

The dependency-ordered execution plan committed in §12 of the
[guidelines](../ai-services/learning-engine/learning-engine%20guidelines.md):

1. `config.py` + `.env.example`.
2. `database/mongo_client.py`.
3. `models/request_models.py` + `models/db_models.py`.
4. `services/profile_service.py` + `services/taxonomy_service.py`.
5. `services/ai_model_manager.py` (three-model lifespan).
6. `services/skill_extractor.py` (canonical-catalog validation tested
   first — non-canonical names pollute every downstream comparison).
7. `services/match_consumer.py` (success / 5xx / timeout / network-error
   fallback all → `None`, never raise).
8. `services/skill_gap_analyser.py` (two-stage match, bio-augmentation,
   `semantic_model=None` graceful path).
9. `services/resource_aggregator/` package.
10. `services/explanation_generator.py` (three-tier fallback verified
    against `ai_models.summary_pipeline = None`).
11. `services/progress_tracker.py` + `services/matching_feedback.py`.
12. `services/learning_path_generator.py` (numbered §5.4 step
    comments + Step 0 calling `match_consumer`).
13. `main.py` (lifespan, rate limiter, all five routes).
14. `scripts/preload_models.py` (manual offline-prep tool).
15. `Dockerfile`.
16. `tests/` — all green with no MongoDB, no HF models on disk, no
    internet.
17. Update root `docker-compose.yml` (env vars + `learning_model_cache`
    volume + `depends_on: matching-engine`).

---

## 16. Summary of revisions from the original guidelines

| # | Original guideline | Deployed implementation | Why |
|---|---|---|---|
| 1 | NER model: `jjzha/escoxlmr_skill_extraction` (XLM-R-large, ~2.2 GB) | `jjzha/jobbert_skill_extraction` (BERT-base, ~440 MB) | Image-shrink refactor — ~5x smaller, same author, same task |
| 2 | Dockerfile: `RUN python scripts/preload_models.py` baking models into image | Models fetched at runtime into `learning_model_cache` volume | Cut compressed image from ~2.9 GB to ~430 MB; preload script kept as manual tool |
| 3 | `/health` returns `{status, models_loaded}` | Adds `semantic_model_loaded`, `summary_pipeline_loaded`, `ner_pipeline_loaded` | Per-model visibility for operators when degradation occurs |
| 4 | Implied that the service writes `LearningPath` docs | Service does **not** touch `learningpaths`; Node.js owns the collection | Consistent with cv-generation's layering — Python emits artefacts, Node.js writes |
| 5 | Top-level `resources` mirror at response root for one release cycle | Implemented under `data.resources` only | Node.js controller already reads `response.data.resources` |
| 6 | Original `Skill.numberOfYears` field references | Schema aligned with actual Mongoose models — `numberOfYears` lives on `ProfileSkill`/`Experience` | Schema accuracy |

---

End of spec. The companion implementation notes
([IMPLEMENTATION_NOTES.md](../ai-services/learning-engine/IMPLEMENTATION_NOTES.md))
capture the five most important non-obvious decisions made during build
and the limitations a future maintainer should know about first.
