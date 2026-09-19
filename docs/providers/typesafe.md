# TypeSafe Jev

[Jev](https://docs.typesafe.ai) is a hosted decision model, not a text
generator. It answers typed questions about a text ("which of these options?",
"is this statement true?") and returns probabilities. Tagvico uses it for
**closed-list filing**: every suggestion is an entry that already exists in
your Paperless-ngx archive, so it cannot invent a tag, a correspondent or a
document type.

Use it when your vocabulary is settled and you want fast, cheap, repeatable
filing with a probability on every field. Jev cannot write, so pair it with a
**text provider** (next section) for titles and new senders. Use a text model
alone when you want new tags created, custom field values or the Companion.

TypeSafe is in early access: you need an account from the
[waitlist](https://typesafe.ai) and an API key from the
[console](https://console.typesafe.ai/keys).

## Required env vars

```env
AI_PROVIDER=typesafe
TYPESAFE_API_KEY=apikey_...
TYPESAFE_MODEL=jev-latest
```

Optional:

```env
TYPESAFE_BASE_URL=https://api.typesafe.ai/v1
# Probability from which a tag is suggested (0-1, default 0.6).
TYPESAFE_TAG_THRESHOLD=0.6
```

## Text provider for titles and new senders (recommended)

```env
# Any configured text provider: openrouter, openai, ollama, ollama-cloud,
# opencode, compatible, codex, copilot. Empty switches the assist off.
TYPESAFE_TEXT_PROVIDER=openrouter
# Optional; defaults to the model configured for that provider.
TYPESAFE_TEXT_MODEL=openai/gpt-5.6-luna
```

With a text provider set, Jev still decides tags, correspondent, document
type, date and language. One small extra call per document (the first 2,500
characters) then writes the title and, only when Jev answered "none of these"
for the correspondent, names the sender so Tagvico can propose a new
correspondent. "Restrict to existing correspondents" switches the sender naming
off. If the text call fails, the document keeps Jev's own answers.

The text provider needs its own credentials in Settings like any provider; it
does not have to be the active one. A subscription-backed provider (ChatGPT
subscription, GitHub Copilot, OpenCode Go) or a local Ollama model makes the
title call free at the margin, which leaves Jev's roughly USD 0.10 per 1,000
documents as the whole bill. The title and sender confidences are reported by
the text model itself, as with every generative provider in Tagvico, so they
are less trustworthy than Jev's probabilities; keep **Review first** until you
have checked a sample.

In our 60-document test (see below) Jev alone produced a good title for 32% of
the documents, and for none of the 29 without a clean title line. With GPT-5.6
Luna as text provider 98% of the titles were good and all 13 senders missing
from the archive were named correctly.

## How each field is decided

One request per document carries the OCR text and all questions; Jev evaluates
them in parallel.

| Field | Question | Notes |
| --- | --- | --- |
| Tags | One yes/no question per existing tag (the controlled vocabulary when Controlled tagging is on) | Tags at or above `TYPESAFE_TAG_THRESHOLD` are suggested, most probable first, up to the Controlled tagging maximum or 10. The first 400 tags are asked. |
| Correspondent | Choose one existing correspondent, or "none of these" | Lists above 254 entries are split over several questions; the most probable entry wins. |
| Document type | Choose one existing document type, or "none of these" | Same splitting rule. |
| Title | Choose the best of the first 12 usable text lines | Without a text provider the title is always a line of the document, never rewritten; this is the provider's weakest field. |
| Document date | Choose among the dates found in the text | Numeric, ISO and month-name dates in German, English, French and Italian. Without a date in the text the Paperless date is kept. |
| Language | Choose among 13 European languages | |

The probability of the chosen option becomes the field confidence, and the
lowest probability among the suggested tags becomes the tag confidence. Fields
below the review threshold are held for review like with every other provider.
To auto-apply tags, raise `TYPESAFE_TAG_THRESHOLD` to your review threshold:
fewer tags are suggested, and those that are clear the bar.

## Limits

- No new tags or document types, and no new correspondents without a text
  provider; an empty archive gets empty suggestions. Create the vocabulary in
  Paperless first.
- No custom field values and no owner suggestion; both stay for review.
- The custom prompt, the system prompt and the external API enrichment are not
  used, because Jev takes no free-form instructions.
- No Companion, Telegram or Discord chat. Keep a second, text-generating
  provider configured for those; Tagvico picks it for the Companion on its own.
- Text only, no thumbnails. The first 40,000 characters of OCR text are sent.
- A request holds about 32,000 tokens. With a very large archive Tagvico
  shortens the OCR text to 12,000 characters first and then halves the longest
  list until the request fits, and logs what it cut. Entries beyond the cut
  cannot be suggested, so this provider suits archives with up to a few hundred
  correspondents best.
- Dates are found by pattern. `03/04/2026` is skipped because day and month
  cannot be told apart, and a reference number shaped like a date can end up
  among the candidates.
- English is Jev's strongest language. German worked well in our test below;
  validate other languages on your own documents.

## Measured: Jev, generative models and the pairing

60 synthetic Swiss household documents written by GPT-5.6 Terra from fixed
specifications (39 German, 10 French, 6 English, 5 Italian; 26 with simulated
OCR damage; 13 from senders missing in the archive; 29 without a clean title
line), 36 correspondents, 12 document types, 25 tags, 2026-09-19. Titles were
graded blind by GPT-5.6 Terra against a reference; "good" is 4 or 5 out of 5.
Generative models ran with a lean prompt through OpenRouter.

| Setup | Correspondent | Type | Date | Good title | USD per 1,000 | Median latency |
| --- | --- | --- | --- | --- | --- | --- |
| Jev alone | 98% | 88% | 100% | 32% | 0.10 | 0.3 s |
| GPT-5.6 Luna alone | 97% | 87% | 98% | 92% | 0.25 | 1.5 s |
| GLM-5.3 Flash alone | 95% | 87% | 98% | 93% | 0.11 | 1.8 s |
| **Jev + Luna as text provider (shipped code)** | 98% | 88% | 100% | 98% | about 0.19 | 1.4 s |

What this says: Jev is as good as or better than the generative models on the
closed-list fields, the title needs a generative model, and a second model
does not fix document type, where all systems miss the same ambiguous cases.
Cost is not the reason to choose Jev: every question carries overhead, so a
Jev request is about three times larger than a lean generative prompt and the
saving is 1.1 to 2.6 times, not orders of magnitude. The reasons are the closed
vocabulary, the speed of the structured fields and a probability on each.
Synthetic documents, one run and one judge model: a guide, not a benchmark.

## Measured on the first 14 documents

`scripts/jev-eval.mjs` files 14 synthetic Swiss household documents (12 German,
2 English: invoices, a policy, a tax assessment, a payslip, a bank statement,
a reminder and so on) against 25 tags, 22 correspondents and 12 document types.
Result of 2026-09-19 with `jev-1.13.0`, 30 questions per document:

| Measure | Result |
| --- | --- |
| Correspondent, title, date, language | 14/14 each |
| Document type | 12/14 (one of the two misses was held for review) |
| Tags at threshold 0.6 | precision 0.80, recall 0.82 |
| Tags at threshold 0.8 | precision 0.90, recall 0.46 |
| Latency | about 300 ms median per document |
| Input tokens | about 1,940 per document |
| Cost | about USD 0.08 per 1,000 documents |

Fourteen clean synthetic documents are a smoke test, not a benchmark: real OCR
is noisier, and results vary slightly between runs. Test 20 to 50 of your own
documents in **Review first** before enabling automatic writes. Reproduce with:

```bash
npm run build:backend
TYPESAFE_API_KEY=... node scripts/jev-eval.mjs
```

## Privacy and cost

Document text is sent to TypeSafe's hosted API; there is no local option.
Review TypeSafe's terms before sending sensitive documents. Pricing at the
time of writing is USD 0.042 per million input tokens with free output tokens,
and the OCR text is billed once per request regardless of the number of
questions.
