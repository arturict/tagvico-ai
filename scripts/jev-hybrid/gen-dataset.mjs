// Writes scripts/jev-hybrid/dataset.json: synthetic household documents whose labels are
// fixed by a specification first; a strong model then writes the text to match it.
// Usage: OPENROUTER_API_KEY=... node scripts/jev-hybrid/gen-dataset.mjs [count]
import { writeFileSync } from 'node:fs';
import { CORRESPONDENTS, TYPES, TAGS, LANGS, openrouter, parseJson, pool } from './vocab.mjs';

const COUNT = Number(process.argv[2] || 60);
const WRITER = 'openai/gpt-5.6-terra';
let seed = 20260919;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (list) => list[Math.floor(rand() * list.length)];
const weighted = (pairs) => { let r = rand() * pairs.reduce((s, [, w]) => s + w, 0); for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; };

const UNKNOWN_SENDERS = ['Malergeschäft Huber & Söhne GmbH', 'Zahnarztpraxis Dr. med. dent. Keller', 'Velo Zürcher AG', 'Garage Bründler AG',
  'Physiotherapie am See', 'Verein Pro Natura Luzern', 'Elektro Meier AG', 'Tierarztpraxis Sonnenberg', 'Schreinerei Imfeld', 'Fitnesspark Allmend',
  'Notariat Sursee', 'Kita Sonnenschein'];
// Types a sender plausibly issues, so specifications stay believable.
const TYPE_POOL = { default: ['Rechnung', 'Brief', 'Mahnung', 'Quittung', 'Vertrag', 'Offerte', 'Kündigung', 'Bescheinigung'] };

function spec(index) {
  const correspondentMode = weighted([['known', 40], ['alias', 8], ['unknown', 12]]);
  const correspondent = correspondentMode === 'unknown' ? null : pick(CORRESPONDENTS);
  const year = pick([2024, 2025, 2026]); const month = 1 + Math.floor(rand() * 12); const day = 1 + Math.floor(rand() * 28);
  return {
    id: `doc-${String(index + 1).padStart(3, '0')}`,
    language: weighted([['de', 38], ['en', 8], ['fr', 8], ['it', 6]]),
    correspondentMode, correspondent,
    sender: correspondent || pick(UNKNOWN_SENDERS),
    documentType: pick(correspondentMode === 'unknown' ? TYPE_POOL.default : TYPES),
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    titleMode: weighted([['explicit', 35], ['none', 15], ['broken', 10]]),
    dateMode: weighted([['single', 20], ['multiple', 25], ['month_name', 10], ['none', 5]]),
    noise: weighted([['clean', 30], ['ocr', 30]])
  };
}

const RULES = {
  alias: 'Do NOT write the sender exactly as given. Use its full legal or alternative name (for example "CSS Kranken-Versicherung AG" for "CSS Versicherung", "Schweizerische Bundesbahnen SBB" for "SBB").',
  known: 'Write the sender name as a real letterhead would (the listed name must be recognisable).',
  unknown: 'The sender is a small business that is NOT in any list; use exactly the given sender name in the letterhead.',
  explicit: 'Include one clear subject/title line.',
  none: 'Do NOT include any subject or title line. It is a plain letter: letterhead, address, salutation, body.',
  broken: 'Include a subject line, but broken across two lines with OCR damage, so no single line is a clean title.',
  single: 'The issue date appears exactly once and no other date appears.',
  multiple: 'Include the issue date plus at least three other dates (due date, period, order date, birth date). The issue date must not be the first date in the text.',
  month_name: 'Write the issue date with the month as a word in the document language, and include one other numeric date.',
  none_date: 'Do not include any date at all.',
  clean: 'Clean text, as from a digital PDF.',
  ocr: 'Simulate a mediocre scan: a few character confusions (l/1, O/0, rn/m), broken words, stray characters, merged columns, a line of header or footer junk. Keep it readable for a human.'
};

const messages = (s) => [{ role: 'system', content: 'You write realistic synthetic household documents for testing a document archive. Never use real persons; the recipient is always "Anna Muster, Bahnhofstrasse 9, 6003 Luzern". Reply with JSON only.' },
  { role: 'user', content: `Write one document that matches this specification exactly.

Sender: ${s.sender}
Document type (German archive type name): ${s.documentType}
Language of the document: ${LANGS[s.language]}
Issue date: ${s.dateMode === 'none' ? 'none' : s.date}
Rules:
- ${RULES[s.correspondentMode]}
- ${RULES[s.titleMode]}
- ${s.dateMode === 'none' ? RULES.none_date : RULES[s.dateMode]}
- ${RULES[s.noise]}
- 120 to 260 words, plain text with line breaks, Swiss context (CHF, Swiss addresses).

Then label it. "tags": the 1 to 4 tags from this list that a careful archivist would certainly apply, none that are merely possible: ${TAGS.join(', ')}.
"reference_title": the short filing title (max 80 characters, in the document language, no sender name needed unless essential) a careful human would give it.

JSON shape: {"text": "...", "tags": ["..."], "reference_title": "..."}` }];

if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set');
const specs = Array.from({ length: COUNT }, (_, i) => spec(i));
let cost = 0;
const docs = await pool(specs, 8, async (s) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await openrouter(WRITER, messages(s), { maxTokens: 2500, temperature: 0.8 });
    cost += out.cost;
    const parsed = parseJson(out.text);
    const tags = (parsed?.tags || []).filter((t) => TAGS.includes(t));
    if (parsed?.text?.length > 300 && tags.length && parsed.reference_title) {
      return { ...s, date: s.dateMode === 'none' ? '' : s.date, text: parsed.text, tags, referenceTitle: String(parsed.reference_title).slice(0, 120) };
    }
  }
  throw new Error(`could not generate ${s.id}`);
});
writeFileSync(new URL('./dataset.json', import.meta.url), JSON.stringify({ writer: WRITER, generated: new Date().toISOString().slice(0, 10), docs }, null, 1));
console.log(`wrote ${docs.length} documents, writer cost USD ${cost.toFixed(4)}`);
const count = (key) => Object.entries(docs.reduce((acc, d) => ({ ...acc, [d[key]]: (acc[d[key]] || 0) + 1 }), {})).map(([k, v]) => `${k}:${v}`).join(' ');
for (const key of ['language', 'correspondentMode', 'titleMode', 'dateMode', 'noise', 'documentType']) console.log(`${key}: ${count(key)}`);
