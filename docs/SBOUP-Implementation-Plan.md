# SBOUP — Skills-Based Opportunity Unleashing Platform
## Implementation Plan — 2-Week AI & Logic Sprint

| Field | Value |
|---|---|
| **Project** | BSE26-2-FYP-SBOUP |
| **Academic Year** | 2025–2026 |
| **Document Version** | 3.0 (Re-scoped: 2-Week Sprint, Revised Ownership) |
| **Date** | 2026-04-21 |
| **Sprint Window** | 2026-04-22 → 2026-05-05 (10 working days, excluding Sundays) |
| **Source of Truth for Requirements** | SBOUP Software Design Document (SDD), Chapters 3–7 |

---

## Table of Contents

1. [Scope & Re-scoping Rationale](#1-scope--re-scoping-rationale)
2. [What Is Already Delivered](#2-what-is-already-delivered)
3. [Revised Ownership (Priority vs Last)](#3-revised-ownership-priority-vs-last)
4. [Week 1 — Priority Features (Days 1–5)](#4-week-1--priority-features-days-15)
5. [Week 2 — Last Features + Integration & UAT (Days 6–10)](#5-week-2--last-features--integration--uat-days-610)
6. [SDD Requirements Traceability Coverage](#6-sdd-requirements-traceability-coverage)
7. [Per-Member Responsibility Matrix](#7-per-member-responsibility-matrix)
8. [Definition of Done](#8-definition-of-done)

---

## 1. Scope & Re-scoping Rationale

Version 3.0 supersedes the 26-day schedule in v2.0 with a **10 working-day sprint** and swaps several ownership assignments to match team preferences expressed on 2026-04-21:

- **Turyahebwa Alex** — **CV generation (priority, Week 1)** + **Learning engine (last, Week 2)**.
- **Yapyeko Rebecca** — **Fraud detection (main owner)**; leads model, thresholds, and audit trail.
- **Nakanwagi Vanesa** — **Communication (messaging + notifications)** + **Fraud detection (parity with Rebecca)**. Parity means shared ownership of training code, evaluation, and admin moderation views — not a helper role.
- **Lutalo Allan** — **Matching engine (priority, Week 1)** + **Chatbot (last, Week 2)**.

Completed frontend (web + mobile) remains out of scope as a standalone track — each member polishes only the screens/pages that surface their own module.

**Ordering rule:** "Priority" features must reach a trained model + working end-to-end flow by end of **Day 5 (Fri, Week 1)**. "Last" features are implemented in **Days 6–9 (Week 2)** against the already-integrated platform. **Day 10** is reserved for integration tests, accuracy reporting, and supervisor-style UAT — **no new features after Day 9**.

---

## 2. What Is Already Delivered

Verified against the current working tree (`git status`, `server/src/**`, `client/src/**`, `mobile/src/**`, `ai-services/**/app/main.py`).

### Frontend (Web + Mobile) — Code-complete

| Area | Web (client/) | Mobile (mobile/) |
|---|---|---|
| Auth screens | Login, Register, ForgotPassword, ResetPassword, VerifyEmail | LoginScreen, RegisterScreen |
| Worker journey | Dashboard, Discover, OpportunityDetail, Applications, CV, Learning, Profile, EditProfile, Messages, Chat, Notifications | WorkerDashboard, Discover, OpportunityDetail, Applications, GenerateCV, Learning, Profile, EditProfile, Messages, Chat, Notifications |
| Employer journey | Dashboard, PostOpportunity, ManageOpportunities, ViewApplications, Profile, Messages | EmployerDashboard, PostOpportunity, ManageOpportunities, ViewApplications, Profile, Messages, Chat |
| Admin journey (web only) | AdminDashboard, UserManagement, OpportunityModeration, FraudReports, Reports, Analytics | — (by design, admin is web-only) |
| Cross-cutting | AuthContext, axios instance with interceptors, route guards, Tailwind design tokens | AuthContext, axios service, navigators, shared theme |

### Server (`server/src/`) — Scaffolded; business logic partially wired

- **Models (16 of 16 per SDD §4):** `User`, `LoginAttempt`, `Company`, `Profile`, `ProfileSkill`, `Skill`, `Experience`, `Education`, `Preference`, `Opportunity`, `Application`, `UserCV`, `LearningPath`, `Message`, `Report`, `Notification`.
- **Controllers present:** `admin`, `application`, `auth`, `chatbot`, `company`, `cv`, `learning`, `matching`, `message`, `notification`, `opportunity`, `profile`, `report`, `skill`, `user`.
- **Route files wired** for all of the above under `server/src/routes/`.
- **Services:** `email.service.js`, `notification.service.js`, `storage.service.js`, and a thin HTTP wrapper `ml.service.js` that proxies to the 5 Python services.
- **Seeder** creates the admin account, demo employer, demo worker, 47 skills, and sample data.

### AI Services (`ai-services/`) — Scaffolded, not yet trained

| Service | Port | Current state | Gap |
|---|---|---|---|
| `matching-engine` | 5001 | Cosine on raw skill vectors + naive collaborative count. No TF-IDF training, no location/salary weighting, no model persistence, no evaluation. | Rebuild as SDD §5.4 hybrid CB+CF with trained vectorizer + measured accuracy. |
| `fraud-detection` | 5002 | Rule-based regex only. `RandomForestClassifier` is imported but never trained. No synthetic data, no XGBoost, no persisted model. | Train RF + XGBoost ensemble on labelled data; persist with joblib; expose batch endpoint. |
| `cv-generation` | 5003 | Flask stub; templates folder exists. No NLP summary generation, no PDF rendering verified. | Transformer-backed summary + experience expansion + WeasyPrint PDF + S3 upload. |
| `learning-engine` | 5004 | Flask stub. No Bayesian estimator, no RL policy, no YouTube Data API v3 sourcing. | SDD §5.3 — relevance 0.7 + difficulty 0.3; top-3 per missing skill. |
| `chatbot-service` | 5005 | Flask stub. No intent classifier trained, no NER, no response templates. | TF-IDF + LogReg intent classifier; spaCy NER; template responses; feedback endpoint. |

### Infrastructure

- `docker-compose.yml` orchestrates all 10 containers (Mongo, Redis, backend, 5 AI, web, mobile-dev).
- `.env`/`.env.example` present. JWT (15m access + 7d refresh), bcrypt, account lockout on `LoginAttempt`, RBAC.

---

## 3. Revised Ownership (Priority vs Last)

| Member | Priority Feature (Week 1) | Last Feature (Week 2) | Shared / Parity | UI Polish Scope (own-module only) |
|---|---|---|---|---|
| **Turyahebwa Alex** | `cv-generation` (5003) — transformer summary + WeasyPrint PDF + S3 upload | `learning-engine` (5004) — Bayesian + RL path, YouTube ingestion, top-3 per skill | — | Worker `GenerateCVPage`, `LearningPage`, `WorkerDashboard` UpskillCard |
| **Lutalo Allan** | `matching-engine` (5001) — hybrid CB + CF, TF-IDF training, evaluation harness | `chatbot-service` (5005) — intent classifier (TF-IDF+LogReg→optional distilBERT), NER | — | Worker `DiscoverPage`, `OpportunityDetailPage`; Employer `ViewApplicationsPage` breakdown, `EmployerDashboard` stats; messaging "Bot" thread |
| **Yapyeko Rebecca** | `fraud-detection` (5002) — RF + XGBoost ensemble (lead), synthetic data, persisted models, threshold policy | Fraud integration polish + audit trail + admin review queue | Auth lifecycle (W1-05) | Admin `FraudReportsPage`, `OpportunityModerationPage`, `UserManagementPage` |
| **Nakanwagi Vanesa** | Messaging + Notifications hardening (Socket.io, 10MB cap, FCM, email); `fraud-detection` **parity** (behavioural features, admin moderation endpoints, eval) | Report aggregation polish (3-in-48h auto-removal) | **Fraud detection co-owned with Rebecca** | Worker `MessagesPage`, `ChatPage`, `NotificationsPage`; Admin `ReportsPage` |

> **Parity rule on fraud:** Rebecca owns the model architecture, ensemble training, and threshold policy. Vanesa owns behavioural-signal features (posting velocity, reporter metadata, account age), admin moderation endpoints, and the audit-trail writer. Both members commit training code; both members sign off on the accuracy report. Vanesa does **not** train a separate model — she commits features and evaluation code to Rebecca's repo tree.

> **Own-module UI rule:** each member owns the UI for the module they implement. Allan does not "do frontend" for Rebecca's admin fraud views, and vice versa. If a polish item spans two modules (e.g., Messages ↔ Chatbot), the two owners pair on it.

---

## 4. Week 1 — Priority Features (Days 1–5)

> **Phase goal:** by end of Day 5, every *priority* AI service has a trained model persisted on disk, beats a documented baseline, and is wired into the Node API. Communication hardening (messaging + notifications + fraud audit trail) is production-ready.

### W1-01 · Shared ML Utilities & Evaluation Harness

| Field | Value |
|---|---|
| **Assignee** | Alex (primary) + all members consume it |
| **Estimated Hours** | 4 |
| **Due** | Day 1 (EOD) |
| **Module** | AI Infrastructure |

Build `ai-services/_shared/` containing:

- `data_loader.py` — pulls training snapshots from the live Mongo (`profiles`, `opportunities`, `applications`, `reports`) into pandas DataFrames with deterministic splits (seed 42, 80/20).
- `metrics.py` — `classification_report_dict`, `ranking_metrics` (precision@k, recall@k, NDCG@k), `regression_metrics` (MAE, RMSE).
- `model_registry.py` — `save_model(name, model, metrics)` writes to `ai-services/<service>/models/<name>_<sha>.joblib` with a sibling JSON of metrics.

**Acceptance:** every service imports from `_shared`. Running `python -m _shared.smoke` prints a DataFrame shape for each entity. No sklearn or pandas call lives in more than one place.

### W1-02 · Matching Engine — Dataset, Baseline & Hybrid Model (SDD §5.4)

| Field | Value |
|---|---|
| **Assignee** | Allan |
| **Estimated Hours** | 18 (Days 1–5) |
| **SDD Refs** | IOM001, IOM002, IOM003, IOM004; §5.4 |
| **Accuracy Target** | NDCG@10 ≥ 0.75 on held-out set; final score ≥ 0.85 for a perfectly matched fixture |

1. **Dataset snapshot** (Day 1): `(profileSkills, opportunities.requiredSkills, applications.matchScore)` into `matching-engine/data/train.parquet`; record NDCG@10 / precision@5 for `random` and `pure-cosine` baselines in `models/baseline_metrics.json`.
2. **Content-based skill similarity:** TF-IDF vectorizer fit on `skill.skillName + profileSkill.proficiencyLevel` tokens; cosine similarity between worker vector and opportunity `requiredSkills` vector. Persist `vectorizer.joblib`.
3. **Experience relevance:** sigmoid-normalised years of relevant experience vs `opportunity.minExperienceMonths`, with `category` match bonus.
4. **Collaborative signal:** user-item matrix of `(profileId → opportunityId, applied|hired)`. Implicit-feedback ALS (`implicit` library) or fallback cosine on the sparse matrix. Persist `cf_model.joblib`.
5. **Final weighting per SDD §5.4:** `finalScore = 0.5·skillScore + 0.25·experienceScore + 0.25·collaborativeScore`. Weights configurable via env for tuning.
6. **Endpoints:**
   - `POST /api/match/score` — single profile × opportunity with breakdown and `missingSkills`.
   - `GET /api/match/recommendations/:userId?limit=` — ranked list for worker dashboard.
   - `POST /api/match/top-candidates` — ranked worker list for an opportunity (employer view).
   - `POST /api/match/suggest-skills` — skill suggestions for a job title/description, sourced from co-occurrence in the Opportunity corpus.

**UI polish by Allan (own-module):** `client/src/pages/OpportunityDetailPage.js` and `ViewApplicationsPage.js` breakdown cards render the new `skillScore / experienceScore / collaborativeScore` fields and `missingSkills` as chips. Mirror on mobile `OpportunityDetailScreen`.

### W1-03 · CV Generation — Template Harness & Transformer Pipeline (SDD §5.5)

| Field | Value |
|---|---|
| **Assignee** | Alex |
| **Estimated Hours** | 16 (Days 1–5) |
| **SDD Refs** | URA006, §5.5 |
| **Accuracy Target** | 9 of 10 profile fixtures produce a summary judged "usable" by the team (blind review); zero crashes on minimal profile |

1. **Template harness (Day 1–2):** convert the three Jinja2 templates (Professional / Modern / Classic) in `cv-generation/templates/` to pass a PDF lint test via WeasyPrint; create `tests/fixtures/` with 10 profile JSON fixtures (sparse, average, rich); render each fixture × each template; assert PDF byte length > 20 KB and text layer contains the profile name.
2. **Summary generation:** use a small open transformer (`distilgpt2` or `t5-small`) via `transformers` pipeline. Prompt template: `[full name] is a [latest job title] with [years] years of experience in [top skills], located in [city]. Availability: [availability].` Model rewrites into 3–5 sentences. Persist tokenizer/model locally via `huggingface_hub`.
3. **Experience bullet expansion:** rule-based template + transformer paraphrase. Every bullet must start with an action verb from `data/action_verbs.txt` and end with an outcome or metric when available.
4. **PDF pipeline:** WeasyPrint → S3/Azure Blob upload via `storage.service.js` from the Node side (the Python service returns HTML; Node uploads PDF and writes `UserCV.pdfUrl`). Document the boundary.
5. **Endpoints:**
   - `POST /api/cv/generate` — returns `{ cvId, htmlContent, pdfUrl, sections }`.
   - `POST /api/cv/regenerate-summary` — summary-only endpoint for the "Regenerate" button.
   - `GET /api/cv/templates` — list templates with previews.

**UI polish by Alex (own-module):** `GenerateCVPage.js` — loading skeleton during the 5–10s generation, per-section "Regenerate" buttons backed by `/api/cv/regenerate-summary`, download button wired to `pdfUrl` directly.

### W1-04 · Fraud Detection — Dataset + RF+XGBoost Ensemble (SDD §5.1)

| Field | Value |
|---|---|
| **Assignees** | Rebecca (lead) + Vanesa (parity) |
| **Estimated Hours** | 18 (Rebecca 12h, Vanesa 6h) across Days 1–5 |
| **SDD Refs** | SITM001, SITM002, SITM003; §5.1 |
| **Accuracy Target** | ≥ 85% accuracy, F1 ≥ 0.82 on held-out; precision on `High Risk` class ≥ 0.90 |

**Rebecca (model + threshold policy):**

1. `fraud-detection/scripts/generate_training_data.py` producing ≥ 1,000 labelled opportunity rows (≥ 500 fraudulent, ≥ 500 legitimate) per SDD §5.1 features. Hand-label 100 real opportunities; freeze a 200-row held-out test set.
2. Linguistic features in `features.py`: TF-IDF (unigram + bigram, vocabulary ≤ 5,000), fraud-pattern regex hit count (keep the 12-pattern list as a feature, not as the model).
3. **Model:** `0.5·RandomForest + 0.5·XGBoost` soft-vote ensemble. Train via `python -m app.train`. 5-fold CV. Persist both models + vectorizer + threshold config.
4. **Thresholds per SDD:** fraud score < 30 → auto-publish, 30–70 → admin review, > 70 → auto-block.
5. **Endpoints:**
   - `POST /api/detect` — `{ fraudScore, riskLevel, flags[], featureContributions }` (SHAP top-5).
   - `POST /api/detect/batch` — up to 100 opportunities.
   - `GET /api/model/stats` — accuracy, precision, recall, f1, last trained timestamp.

**Vanesa (parity — behavioural features + admin endpoints):**

1. Behavioural feature module `features/behavioural.py`: posting velocity (count in last 7 days), exposed-contact-info flag, URL count, account age days, prior-report count, verified-company flag, compensation anomaly `(max-min)/max` and `abs(median_per_category - posting_median)`.
2. Admin moderation endpoints on the Node side (`admin.controller.js`): `GET /api/admin/opportunities?status=under_review`, `PATCH /api/admin/opportunities/:id/decision` — writes an audit-trail entry (`Report` doc of type `admin_action`) and notifies the employer.
3. Class-balance report + held-out evaluation notebook co-signed by both members.

**Acceptance:** `data/train.csv`, `data/test.csv` committed; both models persisted; Node integration calls `/api/detect` on opportunity publish (see W1-06); admin can view + action the `under_review` queue.

**UI polish (split):**
- Rebecca — admin `FraudReportsPage`: render `featureContributions` as tooltip on each flag; confirm-modal on auto-block showing the audit trail entry about to be written.
- Vanesa — admin `OpportunityModerationPage`: grouped queue; SHAP contributions rendered from W1-04 output.

### W1-05 · Auth & Account Lifecycle Polish

| Field | Value |
|---|---|
| **Assignee** | Rebecca |
| **Estimated Hours** | 6 (Days 2–4) |
| **SDD Refs** | URA001–URA005 |

Close gaps against current `auth.controller.js` and `User.js`:

- **LoginAttempt lockout:** enforce 5-failure lockout; unlock after 15 minutes; surface remaining cooldown to the client.
- **Email verification gate:** reject login with 403 + `code: EMAIL_NOT_VERIFIED` until verified; resend token endpoint.
- **Password reset:** Redis-backed token with 15-minute TTL; one-time use; old refresh tokens invalidated on reset.
- **Refresh-token rotation:** new refresh issued on every refresh; old token blacklisted in Redis until natural expiry.
- **Google OAuth:** `POST /api/auth/google` verifies `idToken` via `google-auth-library`, upserts `User`, links by email if row exists.
- **Session revocation on role/suspension change:** `user:<id>:revokedAt` check in `authMiddleware`.

**UI polish by Rebecca (own-module):** admin `UserManagementPage` confirm-modal on suspend/ban with revocation reason required (≥ 20 chars).

### W1-06 · Opportunity Pipeline + Fraud Integration

| Field | Value |
|---|---|
| **Assignees** | Allan (opportunity/search) + Rebecca + Vanesa (fraud integration) |
| **Estimated Hours** | 6 (Allan 2h, Rebecca 2h, Vanesa 2h) — Days 3–5 |
| **SDD Refs** | OM001, OM002, SITM001–SITM003 |

1. On `POST /api/opportunities` (status ≥ `submitted`), call `fraud-detection:/api/detect` synchronously. Apply SDD thresholds:
   - `< 30` → `status: 'published'`, write `Opportunity.fraudSignal = { score, flags }`.
   - `30–70` → `status: 'under_review'`, enqueue admin task, notify employer.
   - `> 70` → `status: 'blocked'`, notify employer with top flags, log audit trail entry.
2. Full-text search (Mongo Atlas Search or `$text`) on `title`, `description`, `requiredSkills` with fuzzy match.
3. Admin review queue wired through endpoints from W1-04.

**UI polish:**
- Allan — `ManageOpportunitiesPage` shows `fraudSignal` chip on each posting.
- Rebecca — admin `OpportunityModerationPage` renders flags + SHAP contributions.

### W1-07 · Application ↔ UserCV Linkage & Match-at-Apply

| Field | Value |
|---|---|
| **Assignees** | Alex (CV linkage) + Allan (match call) |
| **Estimated Hours** | 5 (Alex 3h, Allan 2h) — Days 4–5 |
| **SDD Refs** | OM003, OM004, IOM002 |

- Extend `Application` schema with `cvId` (ref `UserCV`) and `matchScore`, `matchBreakdown`. On `POST /api/applications`:
  - Alex: validate `cvId` belongs to the applicant; attach current CV snapshot.
  - Allan: compute match via `matching-engine:/api/match/score` and persist the snapshot (so later profile edits don't retroactively change historical match scores).
- Reject duplicate apply → 409.
- Employer dashboard counts (`applicationCount`, `totalApps`) come from a denormalised counter kept in sync on create/withdraw.

**UI polish:**
- Alex — worker `ApplicationsPage` renders the linked CV title + link to download.
- Allan — employer `ViewApplicationsPage` renders snapshot `matchBreakdown` from the Application document (not re-computed on render).

### W1-08 · Messaging + Notifications Hardening

| Field | Value |
|---|---|
| **Assignee** | Vanesa |
| **Estimated Hours** | 10 (Days 2–5) |
| **SDD Refs** | CS002, URA004, MPIM003 |

**Messaging (Socket.io):**
- `/chat` namespace with JWT handshake; reject on invalid/expired token.
- `send_message` handler: persist first, then emit `new_message` to the `conversationId` room.
- Attachments: multipart up to **10 MB** per SDD; store via `storage.service.js`; reject with 413 on overage. Allowed MIME: `image/*`, `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
- Application context: `Message.context = { opportunityId }` so conversations can anchor to a posting.
- Redis pub/sub on `sboup:messages:<conversationId>` for multi-instance Node deployments.
- Read receipts via `mark_read` event → updates `Message.readAt` for all messages before the timestamp.

**Notifications:**
- `notification.service.js#createNotification({ userId, type, title, body, data })` persists a `Notification`, looks up user FCM token, sends push (`firebase-admin`), and optionally dispatches email via `email.service.js` based on `Notification.channels` preferences.
- Wire into: application submission, application status change, new message, fraud flag, admin action against user, learning path milestone.
- Batch endpoint `PATCH /api/notifications/read-all?userId=` uses a single `updateMany`.

**UI polish by Vanesa (own-module):** `ChatPage` attachment previews + client-side 10 MB clamp with visible error + opportunity context card at conversation top; `NotificationsPage` grouped by day, unread badge decrement optimistic, deep-link on tap.

### W1-09 · Report Aggregation (3-in-48h Auto-Removal)

| Field | Value |
|---|---|
| **Assignees** | Rebecca + Vanesa |
| **Estimated Hours** | 5 (Rebecca 3h, Vanesa 2h) — Day 5 |
| **SDD Refs** | SITM002, SITM003 |

- `POST /api/reports` — save a `Report`, dedupe (same reporter + target + 24h window → 409).
- Aggregation: on every new report, count `Report.where(targetId, createdAt > now - 48h)`. If count ≥ 3 and not already actioned:
  - If target is an `Opportunity` → set `status: 'blocked'`, write audit trail, notify employer.
  - If target is a `User` → set `accountStatus: 'suspended'`, write audit trail, notify user, revoke sessions (hooks into W1-05).
- Admin `GET /api/admin/reports` with filters; `PATCH /api/admin/reports/:id` dismisses, confirms, or escalates. Dismissal resets the auto-removal block.

**UI polish by Vanesa (own-module):** admin `ReportsPage` — group by target, show the 48h window counter, colour-code at 2/3 (warning) and 3/3 (blocked).

### W1-10 · Service Hardening — Health, Logging, Config

| Field | Value |
|---|---|
| **Assignee** | Alex (coordinates) + each service owner |
| **Estimated Hours** | 4 (1h per service) |
| **Due** | Day 5 |

Enforced contract in every AI service `main.py`:

1. `GET /api/health` → `{ status, service, model_version, last_trained_at }`.
2. Structured JSON logs via `_shared.logger` — request id, user id, latency_ms, model_version.
3. All configurable thresholds read from env (e.g. `FRAUD_LOW_THRESHOLD`, `FRAUD_HIGH_THRESHOLD`) — no magic numbers in code paths.
4. `/api/debug/feature-importance` (gated behind `NODE_ENV !== 'production'`) for models that support it.

**Acceptance:** `scripts/healthcheck.sh` hits all 5 endpoints and prints green; logs from `docker compose logs <svc>` are valid JSON lines.

---

## 5. Week 2 — Last Features + Integration & UAT (Days 6–10)

> **Phase goal:** by end of Day 9, learning engine and chatbot are trained and integrated against the stack standing up from Week 1. Day 10 runs integration tests, accuracy reports, and supervisor-style UAT. **No new features after Day 9.**

### W2-01 · Learning Engine — Catalogue + Bayesian + RL Path (SDD §5.3)

| Field | Value |
|---|---|
| **Assignee** | Alex |
| **Estimated Hours** | 14 (Days 6–9) |
| **SDD Refs** | CAL001–CAL004 |
| **Accuracy Target** | HTML→Senior React path produces a strictly ordered progression (HTML → CSS → JS → React) on the held-out fixture; 100% of generated paths cover every gap skill |

1. **Course catalogue (Day 6):** seed `learning-engine/data/courses.json` with ≥ 80 courses across the top 20 platform skills, sourced from (a) YouTube Data API v3 for free video content and (b) MOOC providers (Coursera, edX public catalogues). Per course: `id`, `skillId`, `provider`, `url`, `durationHours`, `difficulty` (beginner|intermediate|advanced), `relevance` (0–1), `rating`. `ingest_youtube.py` refreshes the catalogue via API key from `.env`. Validates against `schemas/course.schema.json`.
2. **Skill-gap analysis** per SDD §5.3 — diff between `opportunity.requiredSkills` and `profile.skills` weighted by importance.
3. **Bayesian hours-to-proficiency estimator:** prior on `hours_per_skill_level`, posterior updated from historical `LearningPath.completedSteps` completion rates. `scipy.stats` Beta/Gamma priors.
4. **RL course selection:** simplified Q-learning policy with state `(currentLevels, targetSkills, availableTime)`, reward = `gap_closed / hours_invested`. Q-table persisted.
5. **Ranking inside a skill:** **`score = 0.7·relevance + 0.3·difficulty_fit`**, top-3 resources returned per SDD §5.3.
6. **Endpoints:**
   - `POST /api/learning/generate` → `{ learningPath, skillGapAnalysis, totalHours, projectedMatchGain }`.
   - `POST /api/learning/skill-gap` — gap-only, used by dashboard card.
   - `PATCH /api/learning/progress` — marks a course complete, returns updated remaining path (no restart); emits `LEARNING_MILESTONE` notification when a skill hits 100%.
   - `GET /api/learning/courses?skills=&level=&maxHours=`.
   - `GET /api/learning/history?userId=` — completed courses with `completedAt`.

**UI polish by Alex (own-module):** `LearningPage.js` renders `projectedMatchGain` next to SkillGap chart; chevron-collapse per skill group; optimistic "Complete" toggle that calls `PATCH /progress` and rolls back on failure. `WorkerDashboard` UpskillCard renders real `progressPercent` (no mock); `LearningHistoryScreen` populates from `/history`.

### W2-02 · Chatbot — Intent Dataset + Classifier + NER (SDD §5 communication)

| Field | Value |
|---|---|
| **Assignee** | Allan |
| **Estimated Hours** | 14 (Days 6–9) |
| **SDD Refs** | CS002, CS003 |
| **Accuracy Target** | ≥ 88% intent accuracy on held-out set; entity extraction F1 ≥ 0.80 for `jobTitle`, `location`, `skill` |

1. **Dataset (Day 6):** `chatbot-service/data/intents.csv` with ≥ 400 utterances across 9 SDD intents (`FIND_JOBS`, `GET_MATCH_SCORE`, `APPLY_HELP`, `CV_HELP`, `LEARN_SKILLS`, `FRAUD_QUERY`, `GENERAL_HELP`, `GREETING`, `FALLBACK`). Minimum 30 utterances per intent. Include Ugandan-English and code-switched examples. Split 80/20; freeze test set.
2. **Pipeline:**
   - TF-IDF (word + char n-gram) + LogisticRegression; persist to `models/intent_clf.joblib`.
   - Optional: fine-tune `distilbert-base-uncased` on same dataset; pick whichever wins on held-out accuracy.
   - spaCy `en_core_web_sm` NER + custom regex matchers for `location` (known Uganda cities), `skill` (match against `skills` collection), `opportunityId` (Mongo ObjectId regex).
3. **Response generation:**
   - `FIND_JOBS` → call `/api/opportunities?search=&location=` via Node API; format top 5.
   - `GET_MATCH_SCORE` → call matching engine; render breakdown.
   - `LEARN_SKILLS` → call learning engine `/skill-gap`.
   - Informational intents → template from `responses.yaml` with Ugandan-English variants.
4. **Endpoints:**
   - `POST /api/chat` → `{ response, intent, entities, suggestedActions[], confidence }`.
   - `POST /api/chat/feedback` → stores `{ messageId, rating 1–5, comment }`; feeds future retraining.
   - `GET /api/intents` → list for debugging / CS team.

**UI polish by Allan (own-module):** messaging UI — "Bot" conversation pinned to top, typing dots while chatbot is thinking, action chips that map to `suggestedActions`.

### W2-03 · Company Entity & Employer Profile Completion

| Field | Value |
|---|---|
| **Assignee** | Allan |
| **Estimated Hours** | 4 (Day 6) |
| **SDD Refs** | URA006, OM001 |

Current `Company.js`, `company.controller.js`, `company.routes.js` are untracked in git. Finish:

- `POST /api/companies` on first employer `POST /api/opportunities`: upsert by `registeredName` (case-insensitive), link `Company._id` to the employer's `Profile`.
- `PUT /api/companies/:id` — employer-only, RBAC-checked.
- `GET /api/companies/:id/public` — used on `OpportunityDetailPage` to render the employer block.
- Company verification flag (`isVerified`) — admin-only PATCH; influences fraud `employer_verified` feature (W1-04 picks this up on next train cycle).

**UI polish by Allan (own-module):** `EmployerProfilePage` edit form posts the Company record; `OpportunityDetailPage` shows a "Verified Employer" badge when `Company.isVerified === true`.

### W2-04 · Cross-Service Integration Tests

| Field | Value |
|---|---|
| **Assignees** | All members — each owns tests for their AI service |
| **Estimated Hours** | 8 (2h per member) — Days 8–9 |

`tests/integration/` (Node + supertest) covering:

- Register → verify email → login → complete profile → apply for opportunity → employer reviews → status update → worker notified (push + in-app).
- Employer posts a fraud-flagged opportunity → admin review queue → reject → audit trail → employer notification.
- Worker generates CV → Application submit uses that `cvId` → employer sees it.
- Learning path → progress update → milestone notification.
- Chatbot `FIND_JOBS` → calls matching engine → returns top 5.

### W2-05 · Model Accuracy Report + Failure Modes

| Field | Value |
|---|---|
| **Assignees** | Each AI service owner (Rebecca + Vanesa co-sign fraud) |
| **Estimated Hours** | 4 (1h per member) — Day 10 |

Each service owner appends to `docs/model-accuracy.md`:

- Service name, model type, training set size, held-out set size.
- Metrics: accuracy / precision / recall / F1 / NDCG@k as applicable.
- Baseline vs final — must beat Phase 1 baseline.
- Known failure modes (at least 3 per model) with example inputs.

### W2-06 · Demo Script & Seeded Scenarios

| Field | Value |
|---|---|
| **Assignee** | Alex (coordinates) + each owner pairs on their module |
| **Estimated Hours** | 4 (Day 10) |

Extend `server/src/utils/seeder.js` with a `--demo` flag that inserts:

- 3 workers (rich, sparse, fraudulent-looking profile).
- 3 employers (verified, unverified, reported).
- 10 opportunities (2 that trip the fraud threshold, 6 published, 2 in admin review).
- 1 learning path per worker.
- 1 CV per worker.
- 5 conversations (2 with attachments, 1 chatbot).

Demo script `docs/demo-script.md` walks a presenter through the 20 SDD acceptance scenarios in < 15 minutes.

### W2-07 · UAT — 20 SDD Test Cases

| Field | Value |
|---|---|
| **Assignees** | All members |
| **Estimated Hours** | 4 (Day 10) |

Run the 20 SDD test cases (TC01–TC20) against the seeded demo environment. File tickets for every failure; only P0 + P1 must be closed before submission. Record actual vs expected for each TC in `docs/uat-results.md`.

---

## 6. SDD Requirements Traceability Coverage

| Req ID | SDD Feature | Covered By | Owner |
|---|---|---|---|
| URA001 | Registration with role selection | existing auth + W1-05 | Rebecca |
| URA002 | Email verification | W1-05 | Rebecca |
| URA003 | JWT-based session | W1-05 | Rebecca |
| URA004 | Account lockout + LoginAttempt | W1-05, W1-08 | Rebecca / Vanesa |
| URA005 | Password reset (Redis TTL) | W1-05 | Rebecca |
| URA006 | Profile completion + Company | W1-03, W2-03 | Alex / Allan |
| OM001 | Opportunity posting | W1-06, W2-03 | Allan |
| OM002 | Search / filter opportunities | W1-06 | Allan |
| OM003 | Apply with CV + cover letter | W1-07 | Alex + Allan |
| OM004 | Application status lifecycle | W1-07, W1-08 | Allan / Vanesa |
| OM005 | Employer application review | W1-07, W1-02 UI | Allan |
| IOM001 | AI skill match score | W1-02 | Allan |
| IOM002 | Score persisted per Application | W1-07 | Allan |
| IOM003 | Top-candidates ranking | W1-02 | Allan |
| IOM004 | Skill suggestions on post | W1-02 | Allan |
| SITM001 | Fraud detection on publish | W1-04, W1-06 | Rebecca + Vanesa |
| SITM002 | Report filing | W1-09 | Rebecca + Vanesa |
| SITM003 | 3-reports-in-48h auto-removal | W1-09 | Rebecca + Vanesa |
| CAL001 | Skill-gap analysis | W2-01 | Alex |
| CAL002 | Learning path generation | W2-01 | Alex |
| CAL003 | Course catalogue (YouTube + MOOC) | W2-01 | Alex |
| CAL004 | Progress tracking + history | W2-01 | Alex |
| CS002 | Real-time messaging | W1-08 | Vanesa |
| CS003 | Chatbot assistance | W2-02 | Allan |
| MPIM003 | Attachment 10 MB cap | W1-08 | Vanesa |

---

## 7. Per-Member Responsibility Matrix

| Member | Week 1 | Week 2 | Total Hours |
|---|---|---|---|
| **Alex** | W1-01 (4h), W1-03 (16h), W1-07 CV linkage (3h), W1-10 coord (1h) | W2-01 (14h), W2-04 (2h), W2-05 (1h), W2-06 (2h), W2-07 (1h) | **44h** |
| **Allan** | W1-02 (18h), W1-06 pair (2h), W1-07 match call (2h), W1-10 (1h) | W2-02 (14h), W2-03 (4h), W2-04 (2h), W2-05 (1h), W2-06 (1h), W2-07 (1h) | **46h** |
| **Rebecca** | W1-04 lead (12h), W1-05 (6h), W1-06 pair (2h), W1-09 (3h), W1-10 (1h) | W2-04 (2h), W2-05 (1h), W2-07 (1h) | **28h** |
| **Vanesa** | W1-04 parity (6h), W1-06 pair (2h), W1-08 (10h), W1-09 (2h), W1-10 (1h) | W2-04 (2h), W2-05 (1h), W2-07 (1h) | **25h** |
| **Total** | — | — | **143h** |

All members are individually responsible for polishing the UI screens/pages of their own module as listed inside each task — no standalone "frontend" allocation.

---

## 8. Definition of Done

### An AI-service task is DONE when:
- [ ] Training script is reproducible: `python -m app.train` succeeds from a clean clone.
- [ ] Model and vectorizer/tokenizer are persisted under `models/` and loaded at service start.
- [ ] Metrics recorded in `docs/model-accuracy.md`, **baseline beaten**, accuracy target met.
- [ ] `/api/health` reports correct `model_version` and `last_trained_at`.
- [ ] Node side calls the service through `server/src/services/ml.service.js` with a fallback path.
- [ ] Owner's own UI screen/page renders the new fields without mocks.

### An application-logic task is DONE when:
- [ ] SDD requirement id(s) it closes are listed in the PR description.
- [ ] Joi/Zod validation on every new request body.
- [ ] Unit tests for the new branch + an integration test (supertest) exercising the flow.
- [ ] Error format matches platform standard `{ success, message, code }`.
- [ ] Owner's own UI screen/page uses the new API field and handles loading / error / empty.

### Week 1 is DONE when:
- [ ] All W1 tasks are individually Done.
- [ ] `docker compose up` boots the full stack; all `/api/health` endpoints are green.
- [ ] Priority flows work end-to-end: CV generation, matching, fraud publish-check, messaging, notifications.

### Week 2 is DONE when:
- [ ] All W2 tasks are individually Done.
- [ ] Learning path + chatbot flows integrated against the Week 1 stack.
- [ ] UAT results recorded for all 20 SDD test cases; no open P0/P1 issues.

---

*Document path: `docs/SBOUP-Implementation-Plan.md`*  
*Revised: 2026-04-21 (v3.0 — 2-week sprint, revised ownership)*  
*Team: BSE26-2 — Nakanwagi Vanesa · Lutalo Allan · Turyahebwa Alex · Yapyeko Rebecca*
