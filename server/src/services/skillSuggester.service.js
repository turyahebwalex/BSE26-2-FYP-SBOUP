const axios = require('axios');
const Skill = require('../models/Skill');

const ESCO_SEARCH_URL = 'https://ec.europa.eu/esco/api/search';
const MAX_QUERY_CHARS = 120;
const MAX_RESULTS = 12;
const MIN_RESULTS = 5;
const MAX_ESCO_QUERIES = 5;
const ESCO_LIMIT_PER_QUERY = 8;
const ESCO_TIMEOUT_MS = 5000;

// Score weights — higher means more relevant. Tunable.
const SCORE_PHRASE_MATCH = 10; // skill name appears as a whole phrase in text
const SCORE_TOKEN_EXACT = 5;   // any user-text token equals any skill-name token
const SCORE_TOKEN_STEM = 2;    // token shares ≥4-char prefix (Driver↔Driving)
const STEM_MIN_CHARS = 4;
const TOKEN_MIN_CHARS = 3;     // skip "a", "of", "is", etc.
// Title is the strongest signal of profession. A match against the title
// counts ×3 so "Driver" → "Driving" beats "public" → "Public Speaking" when
// the user just put "Public transport" in the bio.
const TITLE_WEIGHT = 3;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenize(s) {
  return ((s || '').toLowerCase().match(/[a-z][a-z0-9+#.-]*/g) || []).filter(
    (t) => t.length >= TOKEN_MIN_CHARS
  );
}

function commonPrefixLength(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

// Score every skill in the catalog against the user's text, weighting matches
// against the title higher than matches against bio/location/etc. The title
// is the strongest signal of profession and should dominate the category
// inference (so "Driver" beats "public" in "public transport").
async function scoreCatalog({ titleText, restText }) {
  const titleLower = (titleText || '').toLowerCase();
  const restLower = (restText || '').toLowerCase();
  if (!titleLower.trim() && !restLower.trim()) return [];

  const titleTokens = tokenize(titleLower);
  const restTokens = tokenize(restLower);
  if (titleTokens.length === 0 && restTokens.length === 0) return [];
  const titleTokenSet = new Set(titleTokens);
  const restTokenSet = new Set(restTokens);

  const all = await Skill.find({}).limit(1000);
  const scored = [];

  for (const s of all) {
    const name = (s.skillName || '').trim();
    if (!name) continue;
    const nameLower = name.toLowerCase();
    let score = 0;
    let titleHit = false;
    let phraseHit = false;

    // Tier 1: full skill name appears as a whole phrase. Title hit weighs more.
    const phraseRe = new RegExp(`(?:^|\\W)${escapeRegex(nameLower)}(?:\\W|$)`, 'i');
    if (phraseRe.test(titleLower)) {
      score += SCORE_PHRASE_MATCH * TITLE_WEIGHT;
      titleHit = true;
      phraseHit = true;
    } else if (phraseRe.test(restLower)) {
      score += SCORE_PHRASE_MATCH;
      phraseHit = true;
    }

    // Tier 2 + 3: token-by-token. A skill token can match a title token (×3)
    // OR a rest token (×1). Title takes priority — once a title match is
    // counted, we skip the rest pass for that token.
    const skillTokens = tokenize(nameLower);
    for (const st of skillTokens) {
      if (titleTokenSet.has(st)) {
        score += SCORE_TOKEN_EXACT * TITLE_WEIGHT;
        titleHit = true;
        continue;
      }
      let titleStem = false;
      for (const tt of titleTokens) {
        if (commonPrefixLength(st, tt) >= STEM_MIN_CHARS) {
          score += SCORE_TOKEN_STEM * TITLE_WEIGHT;
          titleStem = true;
          break;
        }
      }
      if (titleStem) {
        titleHit = true;
        continue;
      }
      if (restTokenSet.has(st)) {
        score += SCORE_TOKEN_EXACT;
        continue;
      }
      for (const rt of restTokens) {
        if (commonPrefixLength(st, rt) >= STEM_MIN_CHARS) {
          score += SCORE_TOKEN_STEM;
          break;
        }
      }
    }

    if (score > 0) {
      scored.push({
        _id: s._id,
        skillName: name,
        category: s.category || 'Other',
        source: s.isExternal ? (s.source || 'ESCO') : 'internal',
        score,
        titleHit,
        phraseHit,
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}

// ESCO occasionally returns prose-like phrases ("pose in front of a camera").
// Goal: drop only the obvious sentence-style noise while keeping legitimate
// multi-word ESCO skills like "Communication with customers", "Working with
// children", "Operate machinery", "Customer relationship management".
function isLikelySkillName(name) {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 60) return false;
  const words = trimmed.split(/\s+/);
  // Real skills are rarely 6+ words. "Search engine optimization" (3),
  // "Health and safety management" (4), "Customer relationship management
  // techniques" (4) are realistic ceilings.
  if (words.length > 5) return false;
  // Multiple prepositions/articles signal natural prose ("in front of a
  // camera"). One stopword is fine — "Communication with customers" and
  // "Working with children" are legit ESCO entries.
  const STOPWORDS = new Set([
    'in', 'on', 'at', 'of', 'to', 'a', 'an', 'the', 'with', 'for', 'as', 'by',
    'and', 'or', 'from', 'into', 'onto', 'upon', 'over', 'about',
  ]);
  const stopHits = words.filter((w) => STOPWORDS.has(w.toLowerCase())).length;
  if (stopHits >= 2) return false;
  // Sentence fragments often *start* with a stopword ("to a camera",
  // "in front of"). Real skill names don't.
  if (STOPWORDS.has(words[0].toLowerCase())) return false;
  return true;
}

function buildEscoQueries({ title, description, experiences, education }) {
  const queries = [];
  const seen = new Set();
  const push = (q) => {
    const t = (q || '').trim();
    if (t.length < 3) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push(t.slice(0, MAX_QUERY_CHARS));
  };

  push(title);
  for (const e of experiences || []) push(e.jobTitle);
  for (const e of education || []) push(e.fieldOfStudy);
  for (const e of education || []) push(e.qualification);

  if (queries.length === 0) {
    const firstSentence = (description || '').split(/[.!?\n]/)[0] || '';
    push(firstSentence);
  }

  return queries.slice(0, MAX_ESCO_QUERIES);
}

async function callEsco(query) {
  const trimmed = (query || '').trim().slice(0, MAX_QUERY_CHARS);
  if (trimmed.length < 3) return [];
  try {
    const { data } = await axios.get(ESCO_SEARCH_URL, {
      params: { text: trimmed, type: 'skill', language: 'en', limit: ESCO_LIMIT_PER_QUERY },
      timeout: ESCO_TIMEOUT_MS,
      headers: { Accept: 'application/json' },
    });
    const results = data?._embedded?.results || [];
    return results
      .map((r) => (r?.title || '').trim())
      .filter(isLikelySkillName);
  } catch (err) {
    return [];
  }
}

async function findOrCreateExternalSkill(name) {
  // Defence in depth — never persist a noisy ESCO entry, even if upstream
  // callers forgot to pre-filter. This stops bad entries from polluting the
  // catalog and resurfacing in future searches via stem matches.
  if (!isLikelySkillName(name)) return null;
  const safe = new RegExp(`^${escapeRegex(name)}$`, 'i');
  let skill = await Skill.findOne({ skillName: safe });
  if (skill) return skill;
  try {
    skill = await Skill.create({
      skillName: name,
      category: 'Other',
      isExternal: true,
      source: 'ESCO',
    });
    return skill;
  } catch (err) {
    if (err.code === 11000) {
      return Skill.findOne({ skillName: safe });
    }
    throw err;
  }
}

async function suggestSkills({
  title = '',
  description = '',
  location = '',
  existingSkills = [],
  experiences = [],
  education = [],
} = {}) {
  // Title is scored separately (with TITLE_WEIGHT) so the user's profession
  // dominates the category signal. Everything else feeds the rest text.
  const restParts = [
    description,
    location,
    ...(experiences || []).flatMap((e) =>
      [e?.jobTitle, e?.company, e?.description].filter(Boolean)
    ),
    ...(education || []).flatMap((e) =>
      [e?.qualification, e?.fieldOfStudy].filter(Boolean)
    ),
  ];
  const restText = restParts.filter(Boolean).join(' ').trim();
  if (!title.trim() && !restText) return [];

  const queries = buildEscoQueries({ title, description, experiences, education });

  const [scored, ...escoBatches] = await Promise.all([
    scoreCatalog({ titleText: title, restText }),
    ...queries.map((q) => callEsco(q)),
  ]);
  const externalNames = [].concat(...escoBatches);

  // Skills the user has already added — never re-suggest them.
  const blocked = new Set(
    (existingSkills || [])
      .map((s) => String(s || '').toLowerCase().trim())
      .filter(Boolean)
  );

  const seen = new Map();
  const categoryCounts = new Map();

  const add = (entry) => {
    const key = entry.name.toLowerCase();
    if (blocked.has(key) || seen.has(key)) return false;
    seen.set(key, entry);
    if (entry.category) {
      categoryCounts.set(entry.category, (categoryCounts.get(entry.category) || 0) + 1);
    }
    return true;
  };

  // Identify the categories anchored by TITLE matches — these define what is
  // contextually relevant. When the user types "Driver", "Driving" matches
  // the title and adds Trade to titleCategories. Then any catalog hit
  // outside Trade (like Public Speaking, picked up via "public" in the bio)
  // gets dropped — it isn't actually about driving.
  const titleCategories = new Set();
  for (const s of scored) {
    if (s.titleHit) titleCategories.add(s.category);
  }
  const filteredScored = scored.filter(
    (s) =>
      s.phraseHit ||                    // explicit name in user text — always show
      titleCategories.size === 0 ||      // no title signal — fall back to all
      titleCategories.has(s.category)    // same category as a title hit
  );

  // Tier 1: ranked catalog matches (precise → fuzzy stem). These set the
  // category signal that will guide any padding below.
  for (const s of filteredScored) {
    if (seen.size >= MAX_RESULTS) break;
    add({ _id: s._id, name: s.skillName, source: s.source, category: s.category });
  }

  // Tier 2: ESCO suggestions (when reachable). Categorised as 'Other' since
  // they're created on the fly and don't influence the category signal.
  let escoAdded = 0;
  for (const name of externalNames) {
    if (seen.size >= MAX_RESULTS) break;
    const key = name.toLowerCase();
    if (seen.has(key) || blocked.has(key)) continue;
    const skill = await findOrCreateExternalSkill(name);
    if (!skill) continue;
    if (
      add({
        _id: skill._id,
        name: skill.skillName,
        source: skill.isExternal ? (skill.source || 'ESCO') : 'internal',
        category: skill.category || 'Other',
      })
    ) {
      escoAdded += 1;
    }
  }

  // Tier 3: ESCO-unreachable fallback. We only pad from the local catalog
  // when ESCO contributed zero suggestions (network failure, timeout, all
  // entries filtered as noise). Padding by category previously surfaced
  // sibling-but-irrelevant skills — a Cleaner getting Plumbing/Welding
  // because both share the Trade category — which felt vague. With ESCO
  // working, the scored Tier-1 hits + Tier-2 ESCO entries are already
  // relevance-ranked, so padding adds noise instead of value.
  if (escoAdded === 0 && seen.size < MIN_RESULTS && categoryCounts.size > 0) {
    const dominantCategory = [...categoryCounts.entries()].sort(
      (a, b) => b[1] - a[1]
    )[0][0];
    const padPool = await Skill.find({ category: dominantCategory }).limit(50);
    for (const s of padPool) {
      if (seen.size >= MIN_RESULTS) break;
      add({
        _id: s._id,
        name: s.skillName,
        source: s.isExternal ? (s.source || 'ESCO') : 'internal',
        category: s.category,
      });
    }
  }

  return [...seen.values()].slice(0, MAX_RESULTS).map((e) => ({
    _id: e._id,
    name: e.name,
    source: e.source,
  }));
}

module.exports = { suggestSkills };
