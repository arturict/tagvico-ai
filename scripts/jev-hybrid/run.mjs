// Collects raw results for the hybrid benchmark into scripts/jev-hybrid/results.json.
// Every model files every document once; hybrid strategies are simulated offline by analyze.mjs.
// Usage: npm run build:backend && TYPESAFE_API_KEY=... OPENROUTER_API_KEY=... node scripts/jev-hybrid/run.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CORRESPONDENTS, TYPES, TAGS, openrouter, parseJson, pool } from './vocab.mjs';

const require = createRequire(import.meta.url);
const filing = require('../../dist/services/typesafeFiling');
const LLMS = ['openai/gpt-5.6-luna', 'z-ai/glm-5.3-flash', 'deepseek/deepseek-v4-flash-0731:free'];
const JUDGE = 'openai/gpt-5.6-terra';
const resultsUrl = new URL('./results.json', import.meta.url);
const { docs } = JSON.parse(readFileSync(new URL('./dataset.json', import.meta.url), 'utf8'));
const results = existsSync(resultsUrl) ? JSON.parse(readFileSync(resultsUrl, 'utf8')) : {};
const save = () => writeFileSync(resultsUrl, JSON.stringify(results, null, 1));
for (const key of ['TYPESAFE_API_KEY', 'OPENROUTER_API_KEY']) if (!process.env[key]) throw new Error(`${key} is not set`);

async function jev(doc) {
  const plan = filing.buildFilingPlan(doc.text, TAGS, CORRESPONDENTS, TYPES);
  const started = performance.now();
  const res = await fetch('https://api.typesafe.ai/v1/systemone', { method: 'POST',
    headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: plan.state, model: 'jev-latest', questions: plan.questions }) });
  if (!res.ok) throw new Error(`TypeSafe HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const mapped = filing.mapAnswersToDocument(plan, plan.state, body.answers, { tagThreshold: 0.6, maxTags: 10 });
  const dateAnswer = body.answers.document_date;
  return { ms: performance.now() - started, inputTokens: body.usage.input_tokens, document: mapped,
    dateProbability: dateAnswer?.choice ? dateAnswer.probabilities?.[dateAnswer.choice] ?? 0 : (mapped.document_date ? 0.5 : 0),
    languageProbability: body.answers.language?.probabilities?.[body.answers.language.choice] ?? 0,
    tagProbabilities: Object.fromEntries(TAGS.map((tag, i) => [tag, body.answers[`tag_${i}`]?.noul ?? 0])),
    titleCandidates: plan.titles.length };
}

const FULL_PROMPT = `You file a scanned household document into a Paperless-ngx archive. Reply with JSON only:
{"title": "short filing title in the document language, max 80 characters",
 "correspondent": "exactly one name from CORRESPONDENTS, or null if the sender is not listed",
 "new_correspondent": "the sender's name if correspondent is null, else null",
 "document_type": "exactly one name from DOCUMENT_TYPES",
 "document_date": "issue date of the document as YYYY-MM-DD, or null if the text has none",
 "language": "de, en, fr or it",
 "tags": ["1 to 4 names from TAGS that certainly apply"]}
CORRESPONDENTS: ${CORRESPONDENTS.join(' | ')}
DOCUMENT_TYPES: ${TYPES.join(' | ')}
TAGS: ${TAGS.join(' | ')}`;
const TITLE_PROMPT = 'Give a short filing title for this scanned household document: in the document language, max 80 characters, naming what the document is about, without the sender name unless essential. Reply with JSON only: {"title": "..."}';

async function llm(model, system, text, maxTokens) {
  const out = await openrouter(model, [{ role: 'system', content: system }, { role: 'user', content: text }], { maxTokens });
  return { ms: out.ms, cost: out.cost, promptTokens: out.usage.prompt_tokens || 0, completionTokens: out.usage.completion_tokens || 0, answer: parseJson(out.text) };
}

async function step(name, doc, work) {
  results[doc.id] ||= {};
  const previous = results[doc.id][name];
  if (previous && !previous.error && !('answer' in previous && !previous.answer)) return;
  try { results[doc.id][name] = await work(); } catch (error) { results[doc.id][name] = { error: String(error.message || error) }; }
}

await pool(docs, 6, async (doc) => { await step('jev', doc, () => jev(doc)); });
save(); console.log('jev done');
for (const model of LLMS) {
  await pool(docs, model.endsWith(':free') ? 2 : 6, async (doc) => {
    await step(`full:${model}`, doc, () => llm(model, FULL_PROMPT, doc.text, 1200));
    await step(`title:${model}`, doc, () => llm(model, TITLE_PROMPT, doc.text.slice(0, 2500), 600));
  });
  save(); console.log(`${model} done`);
}

// Blind title judging: all candidate titles of a document in one call, shuffled.
await pool(docs, 6, async (doc) => {
  // A retried model call brings a title the earlier judging has not seen.
  const judged = results[doc.id].judge?.scores || {};
  if (LLMS.some((m) => [`full:${m}`, `title:${m}`].some((k) => results[doc.id][k]?.answer?.title && !(k in judged)))) delete results[doc.id].judge;
  await step('judge', doc, async () => {
    const r = results[doc.id];
    const candidates = { jev: r.jev?.document?.title };
    for (const model of LLMS) { candidates[`full:${model}`] = r[`full:${model}`]?.answer?.title; candidates[`title:${model}`] = r[`title:${model}`]?.answer?.title; }
    const entries = Object.entries(candidates).filter(([, title]) => typeof title === 'string' && title.trim()).sort(() => Math.random() - 0.5);
    const out = await openrouter(JUDGE, [{ role: 'system', content: 'You grade filing titles for a personal document archive. A good title lets the owner recognise the document in a list: it names what the document is about, is specific (period, object, number where useful), is in the document language, is not just the sender name or an address or a salutation, and is not garbled. Score each candidate 1 (useless) to 5 (as good as the reference). Reply with JSON only: {"scores": {"<key>": <1-5>, ...}}' },
      { role: 'user', content: `DOCUMENT:\n${doc.text.slice(0, 3000)}\n\nREFERENCE TITLE: ${doc.referenceTitle}\n\nCANDIDATES:\n${entries.map(([, title], i) => `c${i}: ${title}`).join('\n')}` }], { maxTokens: 800 });
    const scores = parseJson(out.text)?.scores || {};
    return { cost: out.cost, scores: Object.fromEntries(entries.map(([key], i) => [key, Number(scores[`c${i}`]) || null])) };
  });
});
save();
const costs = {};
for (const r of Object.values(results)) for (const [name, value] of Object.entries(r)) if (value?.cost) costs[name.replace(/^(full|title):/, '')] = (costs[name.replace(/^(full|title):/, '')] || 0) + value.cost;
const errors = Object.values(results).flatMap((r) => Object.entries(r).filter(([, v]) => v?.error || (v && 'answer' in v && !v.answer)).map(([k]) => k));
console.log('OpenRouter cost by model (USD):', Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, +v.toFixed(4)])));
console.log('failed steps:', errors.length, [...new Set(errors)]);
