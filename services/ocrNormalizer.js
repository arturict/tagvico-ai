// services/ocrNormalizer.js
//
// Multilingual OCR normalization for Paperless-ngx DACH / French documents.
//
// The goal is *matching*, not transliteration. The original spelling is
// always preserved so any field we write back to Paperless still shows
// "Müller AG" (not "Mueller AG"). The normalized copy is used internally
// when we compare against tag/correspondent patterns, date strings, and
// amounts so that "Müller AG" and "Mueller AG" both match the same
// correspondent.
//
// Covers:
//   - de / de-CH: umlauts (ä, ö, ü) → ae, oe, ue; "ß" → "ss"
//   - fr / fr-CH: accented letters (é, è, ê, ë, à, â, ç, ï, î, ô, ù, û) →
//     unaccented ASCII
//   - Swiss currency "CHF 1'234.50" parses to 1234.5
//   - German date "12. März 2026" normalizes to "2026-03-12"
//
// The function is pure: it returns a `{ normalized, original }` pair so
// callers can choose which to use.

const DE_MONTHS = {
  januar: 1,
  februar: 2,
  maerz: 3,
  märz: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  dezember: 12
};

const FR_MONTHS = {
  janvier: 1,
  fevrier: 2,
  février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
  décembre: 12
};

const ALL_MONTHS = Object.assign({}, DE_MONTHS, FR_MONTHS);

// German ASCII digraph replacements. Order matters: longest first so
// "ss" doesn't replace the "ss" produced by "ß" before we get a chance to.
const DE_DIGRAPHS = [
  ['ä', 'ae'],
  ['ö', 'oe'],
  ['ü', 'ue'],
  ['Ä', 'Ae'],
  ['Ö', 'Oe'],
  ['Ü', 'Ue'],
  ['ß', 'ss']
];

// French unaccenting (NFD + strip combining marks) is enough for our
// purposes — it covers é→e, è→e, ê→e, ë→e, à→a, â→a, ç→c, ï→i, î→i,
// ô→o, ù→u, û→u and their uppercase variants.
function unaccent(value) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeGerman(value) {
  let out = String(value);
  for (const [from, to] of DE_DIGRAPHS) {
    out = out.split(from).join(to);
  }
  return out;
}

function normalizeForLocale(value, locale) {
  const base = String(value || '');
  const loc = String(locale || '').toLowerCase();

  if (loc.startsWith('de')) {
    return normalizeGerman(base);
  }
  if (loc.startsWith('fr')) {
    return unaccent(base);
  }
  return base;
}

/**
 * Parse a Swiss / French / German formatted currency string into a
 * Number. Returns null when the input can't be parsed.
 *
 *   "CHF 1'234.50" -> 1234.5
 *   "EUR 12,34"    -> 12.34
 *   "1.234,56"     -> 1234.56
 *   "12.34"        -> 12.34
 */
function parseCurrencyAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  // Strip currency letters and the apostrophe-style thousand separator.
  const cleaned = value
    .replace(/[A-Za-z₠-⃏]/g, '')
    .replace(/[\s']/g, '');
  if (cleaned === '') return null;

  // If the cleaned string has both "." and "," the last one is the
  // decimal mark; the other is the thousand separator.
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  let normalized;
  if (lastDot === -1 && lastComma === -1) {
    normalized = cleaned;
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, '');
  } else {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parse a German / French date string. Recognised formats:
 *   - "12. März 2026"        -> 2026-03-12
 *   - "12.03.2026"           -> 2026-03-12
 *   - "12 mars 2026"         -> 2026-03-12
 *   - "March 12, 2026"       -> 2026-03-12
 *   - "2026-03-12"           -> 2026-03-12
 * Returns an ISO 8601 date string (YYYY-MM-DD) or null.
 */
function parseLocalizedDate(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;

  // "12. März 2026" / "12 mars 2026"
  const deFrMatch = trimmed.match(/^(\d{1,2})\.?\s+([A-Za-zäöüÄÖÜéèêëàâçïîôùûÉÈÊËÀÂÇÏÎÔÛ]+)\.?\s+(\d{4})$/);
  if (deFrMatch) {
    const day = Number(deFrMatch[1]);
    const monthName = deFrMatch[2].toLowerCase();
    const year = Number(deFrMatch[3]);
    const month = ALL_MONTHS[monthName];
    if (month) return formatIsoDate(year, month, day);
  }

  // "12.03.2026" or "12-03-2026"
  const numericMatch = trimmed.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (numericMatch) {
    const day = Number(numericMatch[1]);
    const month = Number(numericMatch[2]);
    const year = Number(numericMatch[3]);
    if (month >= 1 && month <= 12) return formatIsoDate(year, month, day);
  }

  // "2026-03-12" / ISO
  if (!Number.isNaN(Date.parse(trimmed))) {
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) {
      return formatIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }

  return null;
}

function formatIsoDate(year, month, day) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Normalize text for matching purposes. Returns the original text
 * unchanged and a normalized copy suitable for substring / regex
 * matching against tags, correspondents, and custom field values.
 *
 * @param {string} text  - The OCR text.
 * @param {string} [locale] - Document locale (e.g. "de-CH", "de", "fr").
 * @returns {{ normalized: string, original: string }}
 */
function normalize(text, locale) {
  const original = String(text == null ? '' : text);
  return {
    original,
    normalized: normalizeForLocale(original, locale)
  };
}

module.exports = {
  normalize,
  normalizeForLocale,
  unaccent,
  normalizeGerman,
  parseCurrencyAmount,
  parseLocalizedDate
};
