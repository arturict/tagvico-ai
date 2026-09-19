const test = require('node:test');
const assert = require('node:assert/strict');

const filing = require('../dist/services/typesafeFiling');
const discovery = require('../dist/services/providerDiscoveryService');

const INVOICE = [
  'Swisscom (Schweiz) AG',
  'Kundennummer 4 118 220 93',
  'Rechnung August 2026 Mobile und Internet',
  'Rechnungsdatum 04.08.2026   Zahlbar bis 03.09.2026',
  'Total CHF 129.80'
].join('\n');

test('date candidates cover numeric, ISO and month-name forms and reject impossible dates', () => {
  const dates = filing.extractDateCandidates('Luzern, 14. Oktober 2025\nIssued: 06 May 2026, due 2026-06-05\nJuly 29, 2026\n31.02.2026 99.99.2026');
  assert.deepEqual([...dates.keys()], ['2025-10-14', '2026-05-06', '2026-06-05', '2026-07-29']);
  assert.match(dates.get('2026-05-06'), /Issued/);
});

test('slash dates count only when day and month cannot be confused', () => {
  const dates = filing.extractDateCandidates('03/04/2026 then 25/12/2025 then 12/25/2024 then 05/05/2023');
  assert.deepEqual([...dates.keys()], ['2025-12-25', '2024-12-25', '2023-05-05']);
});

test('title candidates skip short, numeric and duplicate lines', () => {
  assert.deepEqual(filing.extractTitleCandidates(`${INVOICE}\nTotal CHF 129.80\n12345 67890 12345`), [
    'Swisscom (Schweiz) AG',
    'Kundennummer 4 118 220 93',
    'Rechnung August 2026 Mobile und Internet',
    'Rechnungsdatum 04.08.2026 Zahlbar bis 03.09.2026',
    'Total CHF 129.80'
  ]);
});

test('the plan asks one noul per tag and only offers existing names', () => {
  const plan = filing.buildFilingPlan(INVOICE, ['Rechnung', 'Telekom', 'Rechnung', ' '], ['Swisscom', 'Sunrise'], ['Rechnung', 'Police']);
  assert.deepEqual(plan.tags, ['Rechnung', 'Telekom']);
  assert.equal(plan.questions.tag_1.type, 'noul');
  assert.match(plan.questions.tag_1.instructions, /"Telekom"/);
  assert.deepEqual(Object.keys(plan.questions.correspondent_0.criteria), ['Swisscom', 'Sunrise', filing.NONE_OPTION]);
  assert.deepEqual(Object.keys(plan.questions.document_date.criteria), ['2026-08-04', '2026-09-03']);
  assert.equal(plan.questions.title.criteria.line_2, 'Rechnung August 2026 Mobile und Internet');
});

test('lists beyond the 255-option limit are split and the most probable option wins', () => {
  const correspondents = Array.from({ length: 300 }, (_, index) => `Sender ${index}`);
  const plan = filing.buildFilingPlan(INVOICE, [], correspondents, []);
  assert.equal(Object.keys(plan.questions.correspondent_0.criteria).length, 255);
  assert.equal(Object.keys(plan.questions.correspondent_1.criteria).length, 47);
  assert.equal(plan.questions.document_type_0, undefined);

  const document = filing.mapAnswersToDocument(plan, INVOICE, {
    correspondent_0: { choice: 'Sender 3', probabilities: { 'Sender 3': 0.4 } },
    correspondent_1: { choice: 'Sender 280', probabilities: { 'Sender 280': 0.9 } }
  }, { tagThreshold: 0.6, maxTags: 10 });
  assert.equal(document.correspondent, 'Sender 280');
  assert.equal(document.confidence.correspondent, 0.9);
});

test('a name such as __proto__ stays an ordinary option', () => {
  const plan = filing.buildFilingPlan(INVOICE, [], ['__proto__', 'constructor'], []);
  assert.deepEqual(Object.keys(plan.questions.correspondent_0.criteria), ['__proto__', 'constructor', filing.NONE_OPTION]);
  assert.match(JSON.stringify(plan.questions.correspondent_0), /"__proto__":null/);
});

test('an oversized request shortens the text first and then the longest list', () => {
  const small = filing.buildFilingPlan(INVOICE, ['Rechnung'], ['Swisscom'], ['Rechnung']);
  assert.deepEqual(small.trimmed, []);
  assert.equal(small.state, INVOICE);

  const correspondents = Array.from({ length: 2000 }, (_, index) => `Correspondent with a rather long registered company name ${index}`);
  const plan = filing.buildFilingPlan('Lorem ipsum dolor sit amet. '.repeat(3000), ['Rechnung'], correspondents, ['Rechnung']);
  assert.deepEqual(plan.trimmed, ['content', 'correspondents']);
  assert.equal(plan.state.length, 12000);
  assert.ok(plan.correspondents.length < 2000 && plan.correspondents.length >= 500);
  assert.deepEqual(plan.tags, ['Rechnung']);
  assert.ok(plan.state.length + JSON.stringify(plan.questions).length <= 90000);
});

test('answers map to the shared analysis document with probabilities as confidence', () => {
  const plan = filing.buildFilingPlan(INVOICE, ['Rechnung', 'Telekom', 'Steuern', 'Abo'], ['Swisscom'], ['Rechnung']);
  const document = filing.mapAnswersToDocument(plan, INVOICE, {
    language: { choice: 'de', probabilities: { de: 0.99 } },
    correspondent_0: { choice: 'Swisscom', probabilities: { Swisscom: 0.98 } },
    document_type_0: { choice: filing.NONE_OPTION, probabilities: { [filing.NONE_OPTION]: 0.7 } },
    title: { choice: 'line_2', probabilities: { line_2: 0.93 } },
    document_date: { choice: '2026-08-04', probabilities: { '2026-08-04': 0.97 } },
    tag_0: { noul: 0.95 }, tag_1: { noul: 0.81 }, tag_2: { noul: 0.55 }, tag_3: { noul: 0.7 }
  }, { tagThreshold: 0.6, maxTags: 2 });

  assert.deepEqual(document, {
    title: 'Rechnung August 2026 Mobile und Internet',
    correspondent: 'Swisscom',
    tags: ['Rechnung', 'Telekom'],
    document_type: '',
    document_date: '2026-08-04',
    language: 'de',
    confidence: { title: 0.93, tags: 0.81, correspondent: 0.98, document_type: 0, custom_fields: 0, owner: 0 }
  });
});

test('an empty archive still yields a valid document', () => {
  const plan = filing.buildFilingPlan('Kurz', [], [], []);
  const document = filing.mapAnswersToDocument(plan, 'Kurz', { language: { choice: 'de' } }, { tagThreshold: 0.6, maxTags: 10 });
  assert.deepEqual(document.tags, []);
  assert.equal(document.correspondent, '');
  assert.equal(document.confidence.tags, 0);
});

test('TypeSafe model discovery is static and needs no network', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('network must not be used'); };
  try {
    const models = await discovery.discoverProviderModels('typesafe', {});
    assert.deepEqual(models.map((model) => [model.id, model.isDefault]), [['jev-latest', true], ['jev-preview', false]]);
  } finally {
    global.fetch = originalFetch;
  }
});
