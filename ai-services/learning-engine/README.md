# SBOUP Learning Engine

FastAPI microservice implementing the Continuous and Adaptive Learning Module
described in the SBOUP SDD §3.2.5 and §5.4.

Three sub-components:
- Skill Gap Analyser (semantic match, MiniLM cosine ≥ 0.75)
- Learning Resource Aggregator (YouTube / Coursera / edX / curated)
- Progress Tracker (updates `profileskills`; matching engine sees it on next score)

For opportunity-driven requests the matching-engine is the source of truth for
the missing-skills list (see `services/match_consumer.py`); the learning-engine
adds enrichment via Skill NER bio mining and MiniLM alias hints — never override.

Port `5004`. Internal-only (called from `server/src/services/ml.service.js`).
See `IMPLEMENTATION_NOTES.md` and `CLAUDE_PROMPT.md` for design details.
