const mongoose = require('mongoose');
const FraudLog = require('../models/FraudLog');

const MODERATED_STATUSES = new Set(['under_review', 'blocked', 'suspended']);

const trimText = (value) => (typeof value === 'string' ? value.trim() : '');

const pickFallbackExplanation = (log) =>
  trimText(log?.explanation) || trimText(log?.adminFeedback) || trimText(log?.decisionReason);

const attachModerationExplanation = async (opportunityDocs = []) => {
  const plainDocs = opportunityDocs.map((doc) => (doc?.toObject ? doc.toObject() : { ...(doc || {}) }));
  const moderatedMissingIds = plainDocs
    .filter((opp) => MODERATED_STATUSES.has(opp.status) && !trimText(opp?.fraudXai?.plainEnglishRationale))
    .map((opp) => String(opp._id))
    .filter(Boolean);

  const logMap = new Map();
  if (moderatedMissingIds.length > 0) {
    const uniqueIds = [...new Set(moderatedMissingIds)].map((id) => new mongoose.Types.ObjectId(id));
    const logs = await FraudLog.aggregate([
      { $match: { opportunityId: { $in: uniqueIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$opportunityId',
          explanation: { $first: '$explanation' },
          adminFeedback: { $first: '$adminFeedback' },
          decisionReason: { $first: '$decisionReason' },
        },
      },
    ]);
    logs.forEach((row) => {
      logMap.set(String(row._id), row);
    });
  }

  return plainDocs.map((opp) => {
    const rationale = trimText(opp?.fraudXai?.plainEnglishRationale);
    if (rationale) {
      opp.fraudXai = { ...(opp.fraudXai || {}), plainEnglishRationale: rationale };
      opp.moderationExplanation = rationale;
      return opp;
    }

    if (!MODERATED_STATUSES.has(opp.status)) {
      return opp;
    }

    const fallback = pickFallbackExplanation(logMap.get(String(opp._id)));
    if (!fallback) {
      return opp;
    }

    opp.fraudXai = { ...(opp.fraudXai || {}), plainEnglishRationale: fallback };
    opp.moderationExplanation = fallback;
    return opp;
  });
};

module.exports = attachModerationExplanation;