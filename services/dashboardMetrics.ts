// @ts-nocheck — legacy module; tracked for strict typing.
'use strict';

/**
 * Pure helpers that derive dashboard-ready ratios and context from the data
 * the dashboard route already loads from SQLite + Paperless-ngx.
 *
 * Nothing here fetches data or mutates inputs; it is intentionally easy to
 * unit-test and reuse from the route layer. Numbers are coerced so empty
 * installations (zero documents / zero metrics) never produce NaN.
 */
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sumBy(list, key) {
  return Array.isArray(list) ? list.reduce((acc, item) => acc + num(item?.[key]), 0) : 0;
}

/**
 * Build the structured summary consumed by the dashboard view and the chart
 * bootstrap on the client.
 *
 * @param {object} paperlessData - Counts and aggregates from Paperless-ngx.
 * @param {number} paperlessData.documentCount
 * @param {number} paperlessData.processedDocumentCount
 * @param {Array<{range:string,count:number}>} [paperlessData.tokenDistribution]
 * @param {Array<{type:string,count:number}>} [paperlessData.documentTypes]
 * @param {Array<{hour:string,count:number}>} [paperlessData.processingTimeStats]
 * @param {object} openaiData - Token metrics aggregates.
 * @param {number} openaiData.averagePromptTokens
 * @param {number} openaiData.averageCompletionTokens
 * @param {number} openaiData.averageTotalTokens
 * @param {number} openaiData.tokensOverall
 * @param {number} [openaiData.metricCount] - Number of metric rows backing the averages.
 */
function buildDashboardSummary(paperlessData = {}, openaiData = {}) {
  const documentCount = num(paperlessData.documentCount);
  const processedCount = num(paperlessData.processedDocumentCount);
  const remaining = Math.max(documentCount - processedCount, 0);
  const processedPct = documentCount > 0 ? Math.round((processedCount / documentCount) * 100) : 0;

  const metricCount = num(openaiData.metricCount);
  const avgPrompt = num(openaiData.averagePromptTokens);
  const avgCompletion = num(openaiData.averageCompletionTokens);
  const avgTotal = num(openaiData.averageTotalTokens);
  const tokensOverall = num(openaiData.tokensOverall);

  // Reconstruct overall prompt/completion totals from the per-document averages
  // so we can show a cost-efficiency proxy (prompt vs completion mix) without a
  // new SQL query. Falls back to zero when no metrics exist yet.
  const promptTotal = Math.round(avgPrompt * metricCount);
  const completionTotal = Math.round(avgCompletion * metricCount);
  const splitTotal = promptTotal + completionTotal;
  const promptPct = splitTotal > 0 ? Math.round((promptTotal / splitTotal) * 100) : 0;
  const completionPct = splitTotal > 0 ? Math.round((completionTotal / splitTotal) * 100) : 0;
  const promptRatio = avgTotal > 0 ? Math.round((avgCompletion / avgTotal) * 100) : 0;

  const tokenDistribution = Array.isArray(paperlessData.tokenDistribution) ? paperlessData.tokenDistribution : [];
  const documentTypes = Array.isArray(paperlessData.documentTypes) ? paperlessData.documentTypes : [];
  const topDocumentTypes = documentTypes
    .map((entry) => ({ type: entry.type || 'Unknown', count: num(entry.count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const today = {
    total: sumBy(paperlessData.processingTimeStats, 'count'),
    byHour: Array.isArray(paperlessData.processingTimeStats) ? paperlessData.processingTimeStats : []
  };

  const tagCount = num(paperlessData.tagCount);
  const correspondentCount = num(paperlessData.correspondentCount);

  return {
    counts: {
      documents: documentCount,
      processed: processedCount,
      remaining,
      processedPct,
      tags: tagCount,
      correspondents: correspondentCount
    },
    tokens: {
      avgPrompt,
      avgCompletion,
      avgTotal,
      overall: tokensOverall,
      promptTotal,
      completionTotal,
      promptPct,
      completionPct,
      promptRatio
    },
    today,
    topDocumentTypes,
    tokenDistribution
  };
}

module.exports = { buildDashboardSummary, num, sumBy };