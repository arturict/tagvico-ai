// services/confidenceGuard.js
//
// Centralised confidence scoring and guardrails used by all AI provider
// services. Each provider service asks the model for a per-field confidence
// (0..1); this module compares those scores against the configured threshold
// and flags low-confidence fields for human review.
//
// The provider services share this module so the threshold and "held for
// review" rules stay consistent across openaiService, customService, and
// azureService.

const CONFIG = {
  reviewThreshold: 0.6,
  autoApplyOwner: false
};

const CONFIDENCE_FIELDS = [
  'title',
  'tags',
  'correspondent',
  'document_type',
  'custom_fields',
  'owner'
];

function normaliseScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function getThreshold() {
  return Number(process.env.REVIEW_THRESHOLD || CONFIG.reviewThreshold);
}

/**
 * Whether the Owner field is allowed to be auto-applied without human review.
 *
 * Precedence: CONFIG is the single source of truth. There is no environment
 * variable override — this value is configurable only via the onboarding flow
 * (`.onboarding` state) or the Setup page (`/settings`), both of which write
 * back into CONFIG.autoApplyOwner. Operators are expected to acknowledge the
 * trust implication of owner auto-apply explicitly, which is why we do not
 * honour ad-hoc env overrides from container orchestration.
 *
 * @returns {boolean}
 */
function isAutoApplyOwner() {
  return CONFIG.autoApplyOwner === true;
}

/**
 * Pull the per-field confidence object out of a model response. Defensive
 * against missing/malformed data — anything we can't parse becomes null.
 *
 * @param {object} response
 * @returns {object|null}
 */
function extractConfidence(response) {
  if (!response || typeof response !== 'object') return null;
  const raw = response.confidence;
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const field of CONFIDENCE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(raw, field)) {
      out[field] = normaliseScore(raw[field]);
    }
  }
  return out;
}

/**
 * Compare a per-field confidence object against the review threshold and
 * produce a list of fields that should be held for human review.
 *
 * Owner is never auto-applied unless CONFIG.autoApplyOwner is true, in which
 * case it is still subject to the same threshold.
 *
 * @param {object} confidence - The per-field confidence map.
 * @returns {string[]} Field names held for review.
 */
function fieldsHeldForReview(confidence) {
  if (!confidence || typeof confidence !== 'object') {
    return [...CONFIDENCE_FIELDS];
  }
  const threshold = getThreshold();
  const held = [];
  for (const field of CONFIDENCE_FIELDS) {
    const score = confidence[field];
    if (typeof score !== 'number' || score < threshold) {
      held.push(field);
    }
    if (field === 'owner' && !isAutoApplyOwner()) {
      if (!held.includes('owner')) held.push('owner');
    }
  }
  return held;
}

/**
 * Annotate a parsed AI response with a `held_for_review` array describing
 * which fields the human operator should still inspect. Mutates a shallow
 * copy of the response so callers can pass it downstream safely.
 *
 * @param {object} response - The parsed model response.
 * @returns {object} Response with `held_for_review` populated.
 */
function annotateHeldFields(response) {
  if (!response || typeof response !== 'object') {
    return { held_for_review: [...CONFIDENCE_FIELDS] };
  }
  const confidence = extractConfidence(response);
  const held = fieldsHeldForReview(confidence);

  // Log field names and scores only — never the field values themselves.
  if (confidence) {
    for (const field of held) {
      const score = confidence[field];
      console.log(
        `[CONFIDENCE] field "${field}" held for review (score=${typeof score === 'number' ? score.toFixed(2) : 'n/a'}, threshold=${getThreshold().toFixed(2)})`
      );
    }
  } else {
    console.log('[CONFIDENCE] no confidence block in response; whole document held for review');
  }

  return {
    ...response,
    held_for_review: held
  };
}

/**
 * Append the confidence-scoring contract to a system prompt. Each provider
 * service calls this with the base prompt so the wording stays identical.
 *
 * @param {string} basePrompt
 * @returns {string}
 */
function appendConfidencePrompt(basePrompt) {
  const block = `

Confidence scoring:
- For every field you produce (title, tags, correspondent, document_type,
  custom_fields, owner), also include a top-level "confidence" object with
  one score in the range 0..1 per field, where 1.0 means "very confident"
  and 0.0 means "no signal at all".
- Example shape:
  "confidence": { "title": 0.9, "tags": 0.8, "correspondent": 0.7,
                  "document_type": 0.95, "custom_fields": 0.6, "owner": 0.4 }
- Be honest about uncertainty. Fields with weak evidence should score below
  0.5 so the operator can review them.`;
  return `${basePrompt}${block}`;
}

module.exports = {
  CONFIG,
  CONFIDENCE_FIELDS,
  appendConfidencePrompt,
  annotateHeldFields,
  extractConfidence,
  fieldsHeldForReview,
  getThreshold,
  isAutoApplyOwner
};
