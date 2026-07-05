const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDashboardSummary, num, sumBy } = require('../dist/services/dashboardMetrics');

test('dashboard metrics safely handle empty and malformed values', () => {
  assert.equal(num('12'), 12);
  assert.equal(num('invalid'), 0);
  assert.equal(sumBy([{ count: 1 }, { count: 2 }, { count: 'x' }], 'count'), 3);
  const summary = buildDashboardSummary({}, {});
  assert.equal(summary.counts.remaining, 0);
  assert.equal(summary.counts.processedPct, 0);
  assert.equal(summary.tokens.promptPct, 0);
  assert.deepEqual(summary.topDocumentTypes, []);
});

test('dashboard metrics derive totals, percentages, ordering, and hourly counts', () => {
  const summary = buildDashboardSummary({
    documentCount: 1000, processedDocumentCount: 250, tagCount: 7, correspondentCount: 3,
    documentTypes: [{ type: 'Receipt', count: 5 }, { type: 'Invoice', count: 10 }, { type: '', count: 2 }],
    processingTimeStats: [{ hour: '08', count: 4 }, { hour: '09', count: 6 }]
  }, { averagePromptTokens: 800, averageCompletionTokens: 200, averageTotalTokens: 1000, tokensOverall: 250000, metricCount: 250 });
  assert.deepEqual(summary.counts, { documents: 1000, processed: 250, remaining: 750, processedPct: 25, tags: 7, correspondents: 3 });
  assert.equal(summary.tokens.promptTotal, 200000);
  assert.equal(summary.tokens.completionTotal, 50000);
  assert.equal(summary.tokens.promptPct, 80);
  assert.equal(summary.today.total, 10);
  assert.equal(summary.topDocumentTypes[0].type, 'Invoice');
});
