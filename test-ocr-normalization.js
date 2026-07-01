// test-ocr-normalization.js
//
// Smoke tests for services/ocrNormalizer.js. Covers the cases called out
// in the spec:
//   - "Müller" -> "Mueller"
//   - "Bücher" -> "Buecher"
//   - "naïve" -> "naive"
//   - "Hôtel" -> "Hotel"
//   - "CHF 1'234.50" -> 1234.5
//   - "12. März 2026" -> "2026-03-12"

const assert = require('assert');
const {
  normalize,
  normalizeForLocale,
  unaccent,
  normalizeGerman,
  parseCurrencyAmount,
  parseLocalizedDate
} = require('./services/ocrNormalizer');

function run(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
}

run('German "Müller" -> "Mueller" (de-CH)', () => {
  const { original, normalized } = normalize('Müller AG', 'de-CH');
  assert.strictEqual(original, 'Müller AG');
  assert.strictEqual(normalized, 'Mueller AG');
});

run('German "Bücher" -> "Buecher" (de)', () => {
  const { normalized } = normalize('Bücherregal', 'de');
  assert.strictEqual(normalized, 'Buecherregal');
});

run('French "naïve" -> "naive" (fr)', () => {
  const { normalized } = normalize('naïve approche', 'fr');
  assert.strictEqual(normalized, 'naive approche');
});

run('French "Hôtel" -> "Hotel" (fr-CH)', () => {
  const { normalized } = normalize('Hôtel de Ville', 'fr-CH');
  assert.strictEqual(normalized, 'Hotel de Ville');
});

run('original spelling is always preserved', () => {
  const { original } = normalize('Müller AG', 'de');
  assert.strictEqual(original, 'Müller AG');
});

run('Swiss currency "CHF 1\'234.50" parses to 1234.5', () => {
  assert.strictEqual(parseCurrencyAmount("CHF 1'234.50"), 1234.5);
});

run('European currency "EUR 12,34" parses to 12.34', () => {
  assert.strictEqual(parseCurrencyAmount('EUR 12,34'), 12.34);
});

run('US-style "12.34" parses to 12.34', () => {
  assert.strictEqual(parseCurrencyAmount('12.34'), 12.34);
});

run('German date "12. März 2026" normalizes to "2026-03-12"', () => {
  assert.strictEqual(parseLocalizedDate('12. März 2026'), '2026-03-12');
});

run('Numeric German date "12.03.2026" normalizes to "2026-03-12"', () => {
  assert.strictEqual(parseLocalizedDate('12.03.2026'), '2026-03-12');
});

run('French date "12 mars 2026" normalizes to "2026-03-12"', () => {
  assert.strictEqual(parseLocalizedDate('12 mars 2026'), '2026-03-12');
});

run('normalizeForLocale leaves unknown locales unchanged', () => {
  assert.strictEqual(normalizeForLocale('Müller', 'en'), 'Müller');
});

run('unaccent strips combining marks', () => {
  // ç, ï, î, û are "c-cedilla" / "i-dieresis" which NFD expands to
  // (c + ̧) and (i + ̈) — so the unaccented form keeps both letters
  // and we get "eeeeaaciiouu" (14 chars).
  assert.strictEqual(unaccent('éèêëàâçïîôùû'), 'eeeeaaciiouu');
});

run('normalizeGerman swaps "ß" to "ss"', () => {
  assert.strictEqual(normalizeGerman('Straße'), 'Strasse');
});

if (process.exitCode === 1) {
  console.error('\nFAIL  OCR normalization tests');
  process.exit(1);
} else {
  console.log('\nPASS  OCR normalization tests');
}
