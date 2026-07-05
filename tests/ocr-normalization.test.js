const test = require('node:test');
const assert = require('node:assert/strict');
const ocr = require('../dist/services/ocrNormalizer');

test('OCR normalization preserves originals and handles German and French text', () => {
  assert.deepEqual(ocr.normalize('Müller AG', 'de-CH'), { original: 'Müller AG', normalized: 'Mueller AG' });
  assert.equal(ocr.normalize('Bücherregal', 'de').normalized, 'Buecherregal');
  assert.equal(ocr.normalize('Hôtel de Ville', 'fr-CH').normalized, 'Hotel de Ville');
  assert.equal(ocr.normalizeForLocale('Müller', 'en'), 'Müller');
  assert.equal(ocr.normalizeGerman('Straße'), 'Strasse');
  assert.equal(ocr.unaccent('éèêëàâçïîôùû'), 'eeeeaaciiouu');
});

test('OCR normalization parses localized currencies and dates', () => {
  assert.equal(ocr.parseCurrencyAmount("CHF 1'234.50"), 1234.5);
  assert.equal(ocr.parseCurrencyAmount('EUR 12,34'), 12.34);
  assert.equal(ocr.parseLocalizedDate('12. März 2026'), '2026-03-12');
  assert.equal(ocr.parseLocalizedDate('12.03.2026'), '2026-03-12');
  assert.equal(ocr.parseLocalizedDate('12 mars 2026'), '2026-03-12');
});
