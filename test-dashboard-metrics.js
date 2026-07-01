const assert = require('assert');
const { buildDashboardSummary, num, sumBy } = require('./services/dashboardMetrics');

async function run() {
  // num / sumBy coercion
  assert.equal(num(undefined), 0);
  assert.equal(num('12'), 12);
  assert.equal(num('notanumber'), 0);
  assert.equal(sumBy([{ count: 1 }, { count: 2 }, { count: 'x' }], 'count'), 3);

  // Empty installation never produces NaN or negative remaining
  const empty = buildDashboardSummary({}, {});
  assert.equal(empty.counts.documents, 0);
  assert.equal(empty.counts.processed, 0);
  assert.equal(empty.counts.remaining, 0);
  assert.equal(empty.counts.processedPct, 0);
  assert.equal(empty.tokens.promptPct, 0);
  assert.equal(empty.tokens.completionPct, 0);
  assert.equal(empty.today.total, 0);
  assert.deepEqual(empty.topDocumentTypes, []);

  // Ratios and context derivable from existing data only
  const summary = buildDashboardSummary(
    {
      documentCount: 1000,
      processedDocumentCount: 250,
      tagCount: 7,
      correspondentCount: 3,
      tokenDistribution: [{ range: '0-1k', count: 200 }, { range: '1k-2k', count: 50 }],
      documentTypes: [{ type: 'Invoice', count: 10 }, { type: 'Receipt', count: 5 }, { type: '', count: 2 }],
      processingTimeStats: [{ hour: '08', count: 4 }, { hour: '09', count: 6 }]
    },
    {
      averagePromptTokens: 800,
      averageCompletionTokens: 200,
      averageTotalTokens: 1000,
      tokensOverall: 250000,
      metricCount: 250
    }
  );

  assert.equal(summary.counts.documents, 1000);
  assert.equal(summary.counts.processed, 250);
  assert.equal(summary.counts.remaining, 750);
  assert.equal(summary.counts.processedPct, 25);
  assert.equal(summary.counts.tags, 7);
  assert.equal(summary.counts.correspondents, 3);

  assert.equal(summary.tokens.promptTotal, 200000);
  assert.equal(summary.tokens.completionTotal, 50000);
  assert.equal(summary.tokens.promptPct, 80);
  assert.equal(summary.tokens.completionPct, 20);
  assert.equal(summary.tokens.overall, 250000);

  assert.equal(summary.today.total, 10);
  assert.equal(summary.today.byHour.length, 2);

  assert.equal(summary.topDocumentTypes.length, 3);
  assert.equal(summary.topDocumentTypes[0].type, 'Invoice');
  assert.equal(summary.topDocumentTypes[0].count, 10);

  assert.equal(summary.tokenDistribution.length, 2);

  // metricCount missing falls back to zero prompt/completion split without NaN
  const noCount = buildDashboardSummary({ documentCount: 5 }, { averagePromptTokens: 100, averageCompletionTokens: 50, averageTotalTokens: 150, tokensOverall: 150 });
  assert.equal(noCount.tokens.promptTotal, 0);
  assert.equal(noCount.tokens.completionTotal, 0);
  assert.equal(noCount.tokens.promptPct, 0);

  console.log('PASS dashboard-metrics tests');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});