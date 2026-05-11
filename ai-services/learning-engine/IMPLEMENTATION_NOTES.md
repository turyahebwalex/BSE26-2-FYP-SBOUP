# Learning Engine — Implementation Notes

Architectural overview lives in the SDD (§3.2.5, §5.4). This file
captures the small, non-obvious choices made during the rewrite.

## Five non-obvious decisions

1. **Matching-engine is the source of truth for `missingSkills` whenever
   an opportunity is in scope.** The local two-stage analyser produces
   identical-shaped output but in opportunity-driven mode the
   orchestrator overrides its `missing` list with the matching-engine's,
   surviving everything else (aliasHints, proficiencyShortfalls,
   bioInferredSkills) as enrichment. This is what makes the mobile
   Match Breakdown card and the upskilling pathway agree by
   construction. See §6.0 and `services/match_consumer.py`.

2. **5-second hard timeout on the matching-engine call, no retries.**
   Workers tolerate a fast fallback far better than a 30-second spinner.
   On any failure (timeout, 5xx, network, malformed payload)
   `match_consumer.fetch_match_breakdown` returns `None` and the
   response flips `consistencyMode = "fallback"` so the client knows.

3. **Required-skill levels are inferred from `Opportunity.experienceLevel`.**
   The `Opportunity` schema only stores skill IDs, not per-skill
   proficiency. We map `entry|mid|senior` → `intermediate|advanced|expert`
   and default to `intermediate` for `any`. Documented in
   `skill_gap_analyser.EXP_LEVEL_TO_PROFICIENCY` so it can be tuned.

4. **Coursera & edX free-detection is conservative on purpose.** A
   course is marked free only when its description / landing page
   explicitly mentions `audit`, `financial aid`, or `free`. Otherwise
   `cost=null` and `priceLabel="Paid (audit may be free)"`. We never
   invent prices and never claim a course is free unless the text
   confirms it.

5. **Bio-inferred skills are NEVER persisted to `profileskills`.** They
   live only for the request, augmenting the worker's effective skill
   set inside `compute_skill_deficit`. Persistence requires explicit
   user consent through the existing Node.js profile flow — an AI
   service must not bypass that gate (see §6.7 / §14).

## Known limitations

- Providers without ratings (YouTube, raw edX) leave `quality_score`
  defaulted from a 3.5/5 placeholder rating. This biases ranking
  slightly toward Coursera/curated entries that carry real ratings.
- `whyThisCourse` and `pathwayRationale` are not cached. Each
  `/api/learning/generate` call regenerates them with Flan-T5
  (~3-6 s on CPU for a 6-resource pathway).
- The `learningprogress` audit collection is upserted by
  `(userId, resourceUrl)`; re-completing the same resource updates the
  timestamp but doesn't double-count.
- YouTube quota errors (HTTP 403/429) skip the provider for the rest
  of the current request only — the next request retries.

## What the next maintainer would change first if usage grew 10×

1. **Cache per-resource explanations** in Redis keyed on
   `(resource.url, missing_skill)`. Steady-state hit rate should be
   ~80 % — most workers see the same top-N curated resources for the
   same gap. Eliminates the bulk of Flan-T5 CPU time.
2. **Cache provider responses** by `(provider, skill)` for ~1 hour.
   YouTube and Coursera change slowly; we currently re-fetch on every
   request.
3. **Batch the dashboard-fit Mongo lookup.** `compute_category_fit`
   currently issues one `_lookup` per opportunity; a single
   `$in` query with grouping would cut Mongo round-trips on workers
   with many recommendations.
4. **Wire a real cache-invalidation endpoint** on the matching-engine
   so `services/matching_feedback.py` can do more than audit-log. Today
   the loop closes via Mongo (matching-engine reads `profileskills`
   fresh on every score) — fine at current scale, suboptimal at 10×.
