// Offline analysis of scripts/jev-hybrid/results.json: per-field accuracy, calibration of
// Jev's probabilities, and simulated hybrid strategies (Jev first, generative model on demand).
// Usage: node scripts/jev-hybrid/analyze.mjs
import { readFileSync } from 'node:fs';

const { docs } = JSON.parse(readFileSync(new URL('./dataset.json', import.meta.url), 'utf8'));
const results = JSON.parse(readFileSync(new URL('./results.json', import.meta.url), 'utf8'));
const LLMS = ['openai/gpt-5.6-luna', 'z-ai/glm-5.3-flash', 'deepseek/deepseek-v4-flash-0731:free'];
const JEV_USD_PER_TOKEN = 0.042 / 1e6;
// OpenRouter list prices per token (input, output), 2026-09-19; usage.cost is not returned for every model.
const PRICES = { 'openai/gpt-5.6-luna': [0.2e-6, 1.2e-6], 'z-ai/glm-5.3-flash': [0.09e-6, 0.3e-6], 'deepseek/deepseek-v4-flash-0731:free': [0, 0] };
const costOf = (model, r) => (r?.promptTokens || 0) * PRICES[model][0] + (r?.completionTokens || 0) * PRICES[model][1];
const short = (model) => model.split('/')[1].replace(/-0731|:free/g, (m) => (m === ':free' ? ' (free)' : ''));
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '-');
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// One comparable record per document and system.
function jevRecord(doc) {
  const r = results[doc.id].jev; const d = r.document;
  return { title: d.title, correspondent: d.correspondent || null, type: d.document_type, date: d.document_date || '', language: d.language, tags: d.tags,
    p: { title: d.confidence.title, correspondent: d.correspondent ? d.confidence.correspondent : 0, type: d.confidence.document_type, date: r.dateProbability },
    titleScore: results[doc.id].judge?.scores?.jev ?? 1, ms: r.ms, cost: r.inputTokens * JEV_USD_PER_TOKEN };
}
function llmRecord(doc, model) {
  const r = results[doc.id][`full:${model}`]; const a = r?.answer || {};
  return { title: a.title || '', correspondent: a.correspondent || null, newCorrespondent: a.new_correspondent || null, type: a.document_type || '', date: a.document_date || '',
    language: a.language || '', tags: Array.isArray(a.tags) ? a.tags : [], titleScore: results[doc.id].judge?.scores?.[`full:${model}`] ?? 1, ms: r?.ms || 0, cost: costOf(model, r), failed: !r?.answer,
    tokens: [r?.promptTokens || 0, r?.completionTokens || 0] };
}
function titleOnly(doc, model) {
  const r = results[doc.id][`title:${model}`];
  return { title: r?.answer?.title || '', titleScore: results[doc.id].judge?.scores?.[`title:${model}`] ?? 1, ms: r?.ms || 0, cost: costOf(model, r) };
}

const correct = {
  correspondent: (doc, rec) => rec.correspondent === doc.correspondent,
  type: (doc, rec) => rec.type === doc.documentType,
  date: (doc, rec) => rec.date === doc.date,
  language: (doc, rec) => rec.language === doc.language,
  title: (doc, rec) => rec.titleScore >= 4
};
function score(records) {
  const out = {}; const n = docs.length;
  for (const field of Object.keys(correct)) out[field] = pct(docs.filter((doc, i) => correct[field](doc, records[i])).length, n);
  let tp = 0, fp = 0, fn = 0;
  docs.forEach((doc, i) => { const got = records[i].tags; const hit = got.filter((t) => doc.tags.includes(t)).length; tp += hit; fp += got.length - hit; fn += doc.tags.length - hit; });
  const precision = tp / (tp + fp || 1), recall = tp / (tp + fn || 1);
  out.tagF1 = (2 * precision * recall / (precision + recall || 1)).toFixed(2);
  out.tagPR = `${precision.toFixed(2)}/${recall.toFixed(2)}`;
  out.titleScore = mean(records.map((r) => r.titleScore)).toFixed(2);
  out.allCorrect = pct(docs.filter((doc, i) => ['correspondent', 'type', 'date', 'title'].every((f) => correct[f](doc, records[i]))).length, n);
  const unknown = docs.map((doc, i) => [doc, records[i]]).filter(([doc]) => !doc.correspondent);
  out.newSenderNamed = pct(unknown.filter(([doc, rec]) => rec.newCorrespondent && norm(rec.newCorrespondent).includes(norm(doc.sender).split(' ')[0])).length, unknown.length);
  return out;
}

const jevRecords = docs.map(jevRecord);
const llmRecords = Object.fromEntries(LLMS.map((m) => [m, docs.map((doc) => llmRecord(doc, m))]));

console.log(`\n# 1. Single systems on ${docs.length} documents (title = judge score >= 4 of 5)`);
console.table({ 'jev only': { ...score(jevRecords), usdPer1000: (mean(jevRecords.map((r) => r.cost)) * 1000).toFixed(3), medianMs: Math.round(median(jevRecords.map((r) => r.ms))) },
  ...Object.fromEntries(LLMS.map((m) => [`${short(m)} only`, { ...score(llmRecords[m]), usdPer1000: (mean(llmRecords[m].map((r) => r.cost)) * 1000).toFixed(3), medianMs: Math.round(median(llmRecords[m].map((r) => r.ms))) }])) });

console.log('\n# 2. Where Jev fails: accuracy by document property');
const slice = (key) => Object.fromEntries([...new Set(docs.map((d) => d[key]))].map((value) => {
  const idx = docs.map((d, i) => (d[key] === value ? i : -1)).filter((i) => i >= 0);
  return [`${key}=${value}`, { n: idx.length, ...Object.fromEntries(Object.keys(correct).map((f) => [f, pct(idx.filter((i) => correct[f](docs[i], jevRecords[i])).length, idx.length)])) }];
}));
console.table({ ...slice('titleMode'), ...slice('correspondentMode'), ...slice('dateMode'), ...slice('noise'), ...slice('language') });

console.log('\n# 3. Calibration: is Jev right when it says it is sure? (accuracy | n per probability bin)');
const bins = [[0, 0.5], [0.5, 0.8], [0.8, 0.95], [0.95, 1.01]];
console.table(Object.fromEntries(['correspondent', 'type', 'date', 'title'].map((field) => [field, Object.fromEntries(bins.map(([lo, hi]) => {
  const idx = docs.map((_, i) => i).filter((i) => jevRecords[i].p[field] >= lo && jevRecords[i].p[field] < hi);
  return [`p ${lo}-${Math.min(hi, 1)}`, `${pct(idx.filter((i) => correct[field](docs[i], jevRecords[i])).length, idx.length)} | ${idx.length}`];
}))])));

// Hybrid: Jev files everything; fields whose probability is below tau are taken from one
// generative call for that document. titleAlways replaces the title with a cheap title-only call.
function hybrid(model, { tau, titleAlways, fields }) {
  let calls = 0, titleCalls = 0;
  const records = docs.map((doc, i) => {
    const jev = jevRecords[i]; const llm = llmRecords[model][i];
    const rec = { ...jev, newCorrespondent: null }; let cost = jev.cost, ms = jev.ms;
    const unsure = fields.filter((f) => !(f === 'title' && titleAlways) && jev.p[f] < tau);
    if (unsure.length) {
      calls++; cost += llm.cost; ms += llm.ms;
      for (const f of unsure) {
        if (f === 'title') { rec.title = llm.title; rec.titleScore = llm.titleScore; } else rec[f] = llm[f];
        if (f === 'correspondent') rec.newCorrespondent = llm.newCorrespondent;
      }
    }
    if (titleAlways) { const t = titleOnly(doc, model); titleCalls++; rec.title = t.title; rec.titleScore = t.titleScore; cost += t.cost; ms = Math.max(ms, t.ms); }
    return { ...rec, cost, ms };
  });
  return { ...score(records), llmCalls: pct(calls, docs.length), titleCalls: pct(titleCalls, docs.length), usdPer1000: (mean(records.map((r) => r.cost)) * 1000).toFixed(3), medianMs: Math.round(median(records.map((r) => r.ms))) };
}

const ALL = ['title', 'correspondent', 'type', 'date'];
for (const model of LLMS) {
  console.log(`\n# 4. Hybrid strategies with ${short(model)}`);
  const rows = { 'jev only': hybrid(model, { tau: 0, titleAlways: false, fields: [] }), 'title always via LLM': hybrid(model, { tau: 0, titleAlways: true, fields: [] }) };
  for (const tau of [0.5, 0.7, 0.8, 0.9, 0.95, 0.99]) rows[`escalate unsure, tau ${tau}`] = hybrid(model, { tau, titleAlways: false, fields: ALL });
  for (const tau of [0.8, 0.9, 0.95]) rows[`title always + escalate, tau ${tau}`] = hybrid(model, { tau, titleAlways: true, fields: ALL });
  rows['LLM only'] = { ...score(llmRecords[model]), llmCalls: '100%', titleCalls: '-', usdPer1000: (mean(llmRecords[model].map((r) => r.cost)) * 1000).toFixed(3), medianMs: Math.round(median(llmRecords[model].map((r) => r.ms))) };
  console.table(rows, ['correspondent', 'type', 'date', 'title', 'titleScore', 'allCorrect', 'newSenderNamed', 'llmCalls', 'usdPer1000', 'medianMs']);
}

console.log('\n# 5. Which field should escalate? Gain per field when only that field escalates (tau 0.9, first model)');
console.table(Object.fromEntries(ALL.map((f) => [f, hybrid(LLMS[0], { tau: 0.9, titleAlways: false, fields: [f] })])), ['correspondent', 'type', 'date', 'title', 'allCorrect', 'llmCalls', 'usdPer1000']);

console.log('\n# 6. Titles: mean judge score by title mode');
const modes = [...new Set(docs.map((d) => d.titleMode))];
console.table(Object.fromEntries([['jev', (i) => jevRecords[i].titleScore], ...LLMS.flatMap((m) => [[`${short(m)} full`, (i) => llmRecords[m][i].titleScore], [`${short(m)} title-only`, (i) => titleOnly(docs[i], m).titleScore]])]
  .map(([name, get]) => [name, Object.fromEntries([...modes.map((mode) => [mode, mean(docs.map((d, i) => (d.titleMode === mode ? get(i) : null)).filter((x) => x !== null)).toFixed(2)]), ['all', mean(docs.map((_, i) => get(i))).toFixed(2)]])])));
console.log('failed full calls per model:', Object.fromEntries(LLMS.map((m) => [short(m), llmRecords[m].filter((r) => r.failed).length])));
const tokens = llmRecords[LLMS[0]].map((r) => r.tokens);
console.log(`\nmean tokens per full LLM call (${short(LLMS[0])}): ${Math.round(mean(tokens.map((t) => t[0])))} in / ${Math.round(mean(tokens.map((t) => t[1])))} out; Jev: ${Math.round(mean(docs.map((d) => results[d.id].jev.inputTokens)))} in`);
