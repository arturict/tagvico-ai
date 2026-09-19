# Jev hybrid benchmark

Question: which filing fields can TypeSafe's Jev (a decision model that cannot
write text) own, and when should a generative model take over?

## Method

- `gen-dataset.mjs` fixes the labels first (sender, document type, issue date,
  language, and how hard the document should be), then GPT-5.6 Terra writes the
  text to match and adds the tags and a reference title. 60 synthetic Swiss
  household documents: 39 German, 10 French, 6 English, 5 Italian; 26 with
  simulated OCR damage; 13 from senders that are not in the archive, 9 that
  use another name than the archive entry; 16 without any title line, 13 with
  a broken one; 23 with several dates.
- `run.mjs` files every document once with Jev (the shipped
  `typesafeFiling` code, 36 correspondents, 12 types, 25 tags) and once with
  each generative model through OpenRouter (GPT-5.6 Luna, GLM-5.3 Flash,
  DeepSeek V4 Flash free), plus a title-only call per model. GPT-5.6 Terra
  grades all titles of a document blind against the reference (1 to 5).
- `analyze.mjs` simulates the hybrid strategies offline from those raw
  results, so every strategy sees identical model outputs.

Full output: `analysis-2026-09-19.txt`.

## Results (2026-09-19, `jev-1.13.0`)

| System | Correspondent | Type | Date | Title good (>= 4/5) | Tag F1 | All four right | USD per 1,000 | Median latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Jev only | 98% | 88% | 100% | 32% | 0.83 | 25% | 0.10 | 0.3 s |
| GPT-5.6 Luna only | 97% | 87% | 98% | 92% | 0.87 | 75% | 0.25 | 1.5 s |
| GLM-5.3 Flash only | 95% | 87% | 98% | 93% | 0.82 | 77% | 0.11 | 1.8 s |
| DeepSeek V4 Flash (free) only | 88% | 88% | 100% | 73% | 0.84 | 57% | 0 | 18 s |
| **Jev + title always from Luna** | 98% | 88% | 100% | 95% | 0.83 | **82%** | 0.19 | 1.0 s |
| Jev + title always from GLM | 98% | 88% | 100% | 90% | 0.83 | 78% | 0.14 | 1.3 s |
| Jev + title always from DeepSeek free | 98% | 88% | 100% | 87% | 0.83 | 73% | 0.10 | 13 s |
| Jev, escalate every field below 0.9 to Luna | 97% | 90% | 100% | 73% | 0.83 | 62% | 0.29 | 1.6 s |

## Findings

1. **Jev owns correspondent, date, language and tags.** It matched or beat
   every generative model on them, in 0.3 s. It recognised all 13 unknown
   senders as "none of these" and never picked a wrong one for them.
2. **Titles must come from a generative model, always.** Jev can only pick a
   line of the text: 0 of 29 good titles when the document has no clean title
   line, 61% when it has one. Its title probability does not rescue this:
   below 0.95 it was never good, at or above 0.95 only 59% were. A title-only
   call (first 2,500 characters) is as good as the title from a full filing
   call and costs about a third.
3. **Escalating "unsure" fields does not pay.** For correspondent and date
   Jev's low-probability answers were still right, and the generative model
   was not better, so escalation only adds cost. For document type, all four
   answers below 0.8 were wrong 3 of 4 times, but Jev was also wrong on 4 of 49
   answers at 0.95 or above, and the generative models have the same 87 to 88%:
   the misses are genuinely ambiguous types (Quittung or Rechnung), not
   something a second model fixes.
4. **The one useful escalation is a new sender.** When Jev answers "none of
   these", a generative model named the sender correctly in 92 to 100% of
   cases. That is the step that creates a new correspondent.
5. **Cost is not the argument.** Jev's request is larger than a lean
   generative prompt (2,282 against 691 input tokens, because every question
   carries overhead), so Jev is 1.1 to 2.6 times cheaper, not 50 times, and a
   hybrid with a paid title model costs more than GLM alone. Everything here
   is between 0 and 0.35 USD per 1,000 documents. The arguments for Jev are
   the closed vocabulary (it cannot invent a tag), speed for the structured
   fields, and a probability on every field.
6. **Free models are not a reliability default.** DeepSeek free needed a
   second pass for 15 of 120 calls because of rate limits, 3 still failed, and
   a call took 13 to 18 s.

## Recommended design

Jev files correspondent, document type, date, language and tags. One small
generative call per document writes the title and, only when Jev answered
"none of these", names the new sender. No probability-based escalation of other
fields; low document-type probability goes to review, not to a second model.

## Limits

Synthetic text written by one model and labelled by the same specification;
60 documents; one run (Jev varies slightly between runs); one judge model for
titles; lean generative prompts rather than Tagvico's production prompt, which
is several times longer and would make the generative-only rows more
expensive. Differences of two or three documents are noise.
