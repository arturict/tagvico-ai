// @ts-nocheck — migrated from JavaScript; types will be tightened incrementally.
// services/customFieldsService.js
//
// Discovers and validates the custom fields defined in the connected
// Paperless-ngx instance. The list is exposed to the LLM via the system
// prompt (so the model knows which fields exist and what types they have)
// and used locally to drop values that don't match the declared type
// before we issue a PATCH.

const axios = require('axios');
const config = require('../config/config');

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const VALID_DATA_TYPES = new Set([
  'string',
  'integer',
  'float',
  'boolean',
  'date',
  'url',
  'monetary',
  'documentlink',
  'select'
]);

let cache = {
  fetchedAt: 0,
  url: null,
  token: null,
  fields: []
};

function buildClient(paperlessUrl, token) {
  return axios.create({
    baseURL: paperlessUrl,
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json'
    }
  });
}

function normalizeField(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const dataType = String(raw.data_type || raw.dataType || 'string').toLowerCase();
  const normalizedType = VALID_DATA_TYPES.has(dataType) ? dataType : 'string';

  const out = {
    id: raw.id,
    name: raw.name,
    type: normalizedType
  };

  // Paperless exposes extra_data.select_options for `select` fields.
  if (normalizedType === 'select' && raw.extra_data && Array.isArray(raw.extra_data.select_options)) {
    out.allowed_values = raw.extra_data.select_options.map((opt) => String(opt));
  } else if (Array.isArray(raw.extra_data?.select_options)) {
    out.allowed_values = raw.extra_data.select_options.map((opt) => String(opt));
  }

  // Currency hint for monetary fields — used by the test cases and by
  // any future locale-aware parsing.
  if (normalizedType === 'monetary' && raw.extra_data?.default_currency) {
    out.currency = String(raw.extra_data.default_currency);
  }

  return out;
}

/**
 * Return the list of custom fields known to the connected Paperless
 * instance. Cached in memory for 10 minutes; the cache key includes the
 * paperless URL + token so credential rotation invalidates it.
 *
 * @param {string} [paperlessUrl] - Override the configured API URL.
 * @param {string} [token] - Override the configured API token.
 * @returns {Promise<Array<{id, name, type, allowed_values?, currency?}>>}
 */
async function listFields(paperlessUrl, token) {
  const url = paperlessUrl || config.paperless?.apiUrl;
  const tk = token || config.paperless?.apiToken;
  if (!url || !tk) return [];

  const now = Date.now();
  if (
    cache.fields.length > 0 &&
    cache.url === url &&
    cache.token === tk &&
    now - cache.fetchedAt < CACHE_TTL_MS
  ) {
    return cache.fields;
  }

  const client = buildClient(url, tk);
  const collected = [];
  let next = '/custom_fields/';
  try {
    while (next) {
      const response = await client.get(next);
      const results = response?.data?.results;
      if (!Array.isArray(results)) break;
      for (const raw of results) {
        const normalized = normalizeField(raw);
        if (normalized) collected.push(normalized);
      }
      next = response?.data?.next || null;
    }
  } catch (error) {
    console.warn('[WARN] Failed to list custom fields:', error.message);
    return cache.fields;
  }

  cache = {
    fetchedAt: now,
    url,
    token: tk,
    fields: collected
  };
  return collected;
}

/**
 * Invalidate the in-memory cache. Useful for tests and for any future
 * "refresh" UI affordance.
 */
function invalidate() {
  cache = { fetchedAt: 0, url: null, token: null, fields: [] };
}

/**
 * Build a compact JSON block for inclusion in the LLM system prompt. The
 * shape is intentionally minimal: id, name, type, and the allowed values
 * for select fields. The model is expected to use field `name` to refer
 * to a field in its output.
 *
 * @param {Array<object>} fields
 * @returns {string} Pretty-printed JSON
 */
function formatForPrompt(fields) {
  const minimal = (fields || []).map((f) => {
    const entry = { id: f.id, name: f.name, type: f.type };
    if (f.allowed_values && f.allowed_values.length) {
      entry.allowed_values = f.allowed_values;
    }
    if (f.currency) {
      entry.currency = f.currency;
    }
    return entry;
  });
  return JSON.stringify({ custom_fields: minimal }, null, 2);
}

/**
 * Validate a single value against the declared type of a field. Returns
 * `null` when the value is valid, or a human-readable reason otherwise.
 *
 * @param {object} field - A normalized field (from listFields).
 * @param {*} value - The value the model produced.
 * @returns {string|null}
 */
function validateValue(field, value) {
  if (!field) return 'unknown field';
  if (value === undefined) return 'missing value';
  if (value === null) return null; // null is the universal "clear" sentinel

  const type = field.type;
  const stringValue = typeof value === 'string' ? value.trim() : value;

  switch (type) {
    case 'string':
      // Any string is acceptable.
      if (typeof value === 'string') return null;
      if (typeof value === 'number' || typeof value === 'boolean') return null;
      return `expected string, got ${typeof value}`;

    case 'integer': {
      if (typeof value === 'number' && Number.isInteger(value)) return null;
      if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return null;
      return `expected integer, got ${JSON.stringify(value)}`;
    }

    case 'float': {
      if (typeof value === 'number' && Number.isFinite(value)) return null;
      if (typeof value === 'string') {
        const normalized = value.trim().replace(',', '.');
        if (normalized !== '' && !Number.isNaN(Number(normalized))) return null;
      }
      return `expected float, got ${JSON.stringify(value)}`;
    }

    case 'monetary': {
      if (typeof value === 'number' && Number.isFinite(value)) return null;
      if (typeof value === 'string') {
        // Accept "12.34", "12,34" (European), "CHF 1'234.50" (Swiss),
        // and similar thousand-separated forms. Strip currency code
        // letters and apostrophes used as thousand separators before
        // normalising the decimal mark.
        const cleaned = value
          .replace(/[A-Za-z]/g, '')
          .replace(/[\s']/g, '')
          .replace(',', '.');
        if (cleaned !== '' && !Number.isNaN(Number(cleaned))) return null;
      }
      return `expected monetary, got ${JSON.stringify(value)}`;
    }

    case 'boolean': {
      if (typeof value === 'boolean') return null;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', 'false'].includes(normalized)) return null;
      }
      return `expected boolean ("true"/"false"), got ${JSON.stringify(value)}`;
    }

    case 'date': {
      if (typeof value !== 'string') return `expected date string, got ${typeof value}`;
      if (!Number.isNaN(Date.parse(value))) return null;
      return `expected ISO date, got ${JSON.stringify(value)}`;
    }

    case 'url': {
      if (typeof value !== 'string') return `expected url string, got ${typeof value}`;
      try {
        // new URL rejects bare strings like "not a url".
        // eslint-disable-next-line no-new
        new URL(value);
        return null;
      } catch (e) {
        return `expected url, got ${JSON.stringify(value)}`;
      }
    }

    case 'select': {
      if (typeof value !== 'string') return `expected select label, got ${typeof value}`;
      if (!Array.isArray(field.allowed_values) || field.allowed_values.length === 0) return null;
      if (field.allowed_values.includes(value)) return null;
      return `select value ${JSON.stringify(value)} not in allowed_values`;
    }

    case 'documentlink': {
      // Paperless document links are integers (or strings of digits).
      if (typeof value === 'number' && Number.isInteger(value)) return null;
      if (typeof value === 'string' && /^\d+$/.test(value.trim())) return null;
      return `expected document id, got ${JSON.stringify(value)}`;
    }

    default:
      return null;
  }
}

/**
 * Filter and validate a model-supplied `custom_fields` object so the
 * resulting payload can be safely PATCHed to Paperless. Invalid entries
 * are dropped and logged (without ever including the document body).
 *
 * @param {Array<object>} fields - From listFields().
 * @param {object} modelOutput - { field_name: { field_name, value } | { name, value } }
 * @returns {{ valid: object, dropped: Array<{ field: string, reason: string }> }}
 */
function sanitize(fields, modelOutput) {
  const valid = {};
  const dropped = [];
  if (!modelOutput || typeof modelOutput !== 'object') {
    return { valid, dropped };
  }
  const byName = new Map();
  for (const f of fields || []) {
    if (f && f.name) byName.set(String(f.name).toLowerCase(), f);
  }

  for (const [key, raw] of Object.entries(modelOutput)) {
    if (!raw || typeof raw !== 'object') continue;
    const name = String(raw.field_name || raw.name || key).toLowerCase();
    const field = byName.get(name);
    if (!field) {
      dropped.push({ field: name, reason: 'unknown field' });
      continue;
    }
    const reason = validateValue(field, raw.value);
    if (reason) {
      // Logging only field name + reason, never the value or document body.
      console.warn(`[WARN] Custom field "${field.name}" value rejected: ${reason}`);
      dropped.push({ field: field.name, reason });
      continue;
    }
    valid[field.name] = raw.value;
  }

  return { valid, dropped };
}

module.exports = {
  listFields,
  invalidate,
  formatForPrompt,
  validateValue,
  sanitize
};
