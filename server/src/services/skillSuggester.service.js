const axios = require('axios');
const Skill = require('../models/Skill');

const ESCO_SEARCH_URL = 'https://ec.europa.eu/esco/api/search';
const MAX_QUERY_CHARS = 120;
const MAX_RESULTS = 10;
const ESCO_TIMEOUT_MS = 5000;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Internal matcher: a skill counts as a match when its full name appears as a
// whole word inside the title/description. This is far more precise than the
// previous token-substring approach (which over-matched on coincidental
// substrings like "art" inside "charter").
async function findInternalMatches(text) {
  const lower = text.toLowerCase();
  if (!lower.trim()) return [];
  const all = await Skill.find({}).limit(1000);
  const matches = [];
  for (const s of all) {
    const name = s.skillName.toLowerCase().trim();
    if (!name || name.length < 2) continue;
    const re = new RegExp(`(?:^|\\W)${escapeRegex(name)}(?:\\W|$)`, 'i');
    if (re.test(lower)) {
      matches.push({
        _id: s._id,
        skillName: s.skillName,
        source: s.isExternal ? (s.source || 'ESCO') : 'internal',
      });
    }
  }
  return matches.slice(0, 20);
}

// ESCO is best at matching short, focused queries — typically a job title
// (e.g. "registered nurse") rather than a long description that mixes
// occupation, location, and benefits.
function buildEscoQuery({ title, description }) {
  const t = (title || '').trim();
  if (t.length >= 4) return t.slice(0, MAX_QUERY_CHARS);
  // Fallback: first sentence of the description so the query stays focused.
  const firstSentence = (description || '').split(/[.!?\n]/)[0] || '';
  return firstSentence.trim().slice(0, MAX_QUERY_CHARS);
}

async function callEsco({ title, description }) {
  const query = buildEscoQuery({ title, description });
  if (!query) return [];
  try {
    const { data } = await axios.get(ESCO_SEARCH_URL, {
      params: { text: query, type: 'skill', language: 'en', limit: 12 },
      timeout: ESCO_TIMEOUT_MS,
      headers: { Accept: 'application/json' },
    });
    const results = data?._embedded?.results || [];
    return results
      .map((r) => (r?.title || '').trim())
      .filter((t) => t.length > 0 && t.length <= 100);
  } catch (err) {
    return [];
  }
}

async function findOrCreateExternalSkill(name) {
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

async function suggestSkills({ title = '', description = '' }) {
  const text = `${title} ${description}`.trim();
  if (!text) return [];

  const [internal, externalNames] = await Promise.all([
    findInternalMatches(text),
    callEsco({ title, description }),
  ]);

  const seen = new Map();
  for (const s of internal) {
    seen.set(s.skillName.toLowerCase(), {
      _id: s._id,
      name: s.skillName,
      source: s.source,
    });
  }

  for (const name of externalNames) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    const skill = await findOrCreateExternalSkill(name);
    if (!skill) continue;
    seen.set(key, {
      _id: skill._id,
      name: skill.skillName,
      source: skill.isExternal ? (skill.source || 'ESCO') : 'internal',
    });
  }

  return [...seen.values()].slice(0, MAX_RESULTS);
}

module.exports = { suggestSkills };
