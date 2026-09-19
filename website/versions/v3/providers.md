# Model provider overview

Provider choice determines where OCR text is processed, how credentials are
managed, which models are visible, and which cost modes are available. Validate
quality with representative documents before enabling Automatic writes. See
[Privacy and security](./privacy) before sending real document text to a hosted
service.

| Provider | Best for | Authentication / endpoint | Notes |
| --- | --- | --- | --- |
| OpenRouter | Curated cloud choice and easy model switching | API key | Recommended hosted starting point; requests are forwarded to the selected upstream provider. |
| Ollama | Fully local inference | Local `/api/chat` endpoint | Keeps processing on infrastructure you control; model quality and speed depend on hardware. |
| Ollama Cloud | Hosted Ollama models | API key | No local GPU required; document text leaves your network. |
| OpenAI direct | Native OpenAI models, Flex, and Batch | API key | Loads the API account's live `/v1/models` catalog; Flex and Batch remain model-dependent. |
| OpenCode Go | Subscription inference gateway | Go API key | OpenAI-compatible request path with provider-controlled limits. |
| GitHub Copilot | Account-scoped model discovery | OAuth device login or supported token | Uses the official SDK; every agent tool is denied. |
| CLI Proxy / OpenAI-compatible | CLIProxyAPI, LM Studio, LiteLLM, vLLM, custom gateways | `/v1` base URL and optional key | Uses Vercel AI SDK v6. Tagvico can load the endpoint's `/models` catalog or accept a model ID manually. |
| TypeSafe Jev | Closed-list filing: picks only from existing tags, correspondents and document types | API key (early access) | A decision model, not a text generator: no new names, no custom fields, no Companion. Every field carries a probability. See [TypeSafe Jev](#typesafe-jev). |
| ChatGPT subscription | Optional private, low-volume model adapter | Stable Codex device login | Uses the bundled official Codex runtime and loads the signed-in account's live `model/list` catalog. It is not an API SLA. |

## Cost-conscious recommendations

These are starting points for document classification, where consistent
structured output matters more than maximum general-purpose reasoning. Test at
least 20–50 representative documents in **Review first** before deciding that a
model is good enough for Automatic mode.

| Provider | Recommended starting point | Why it is a good-value choice |
| --- | --- | --- |
| OpenRouter | **GPT-5.4 Mini** with low reasoning | Best general hosted default in Tagvico: reliable structured extraction without paying for a frontier-sized model. Try **GPT-5.4 Nano** or **Gemini 3.1 Flash Lite** for very clean, repetitive documents; avoid the free router for unattended production because the underlying model can change. |
| Ollama | **Qwen 3.5 4B** on modest hardware; **Gemma 4 12B** with 16 GB VRAM and enough system-RAM headroom | Qwen 4B was the best speed/quality default in Tagvico's July 2026 synthetic test. Gemma 12B scored higher but was roughly twice as slow and its prompt cache needed substantially more system RAM. |
| Ollama Cloud | **gpt-oss:20b-cloud** | Tagvico's default balances capability with a moderate hosted footprint and avoids buying or running a GPU. Recheck the cloud catalog and account limits before committing to it. |
| OpenAI direct | **GPT-5.4 Mini**; use **Batch** for non-urgent archives | Mini is the balanced default. **GPT-5.4 Nano** can reduce cost further for predictable invoices and statements. Batch is preferable when turnaround can wait; Flex is useful when supported and occasional slower availability is acceptable. |
| OpenCode Go | **DeepSeek V4 Flash** | This is Tagvico's budget-oriented default for the Go gateway. It suits classification-heavy workloads; confirm the current subscription allowance and gateway model catalog. |
| GitHub Copilot | **GPT-5.4 Mini** when the signed-in plan exposes it | It offers a strong quality/cost balance without a separate per-token key inside Tagvico. Prefer a model with the lowest billing multiplier that still passes your test set, because plan entitlements differ. |
| CLI Proxy / OpenAI-compatible | A subscription-backed model returned by CLIProxyAPI, or a **mini**, **flash**, or roughly **8B–20B instruct** model supported by your gateway | Compatible endpoints vary too much for one universal slug. Load the live catalog, start small, require reliable JSON, and increase model size only when the error rate justifies it. |
| TypeSafe Jev | **jev-latest** | By far the cheapest hosted option in our synthetic test (about USD 0.08 per 1,000 documents, about 300 ms each), because only input tokens are billed and the text is billed once for all questions. Only worth it when your Paperless vocabulary is settled. |
| ChatGPT subscription | The configured Codex model supported by the signed-in account | Suitable for one trusted, low-volume installation when subscription-backed inference is preferable. Model availability remains account-controlled and is not an API service guarantee. |

## TypeSafe Jev

Jev answers typed questions about the OCR text and returns probabilities; it
does not write text. Tagvico asks one yes/no question per existing tag, lets
Jev choose the correspondent and document type from your existing lists, the
title from the first lines of the document and the date from the dates found
in the text. Nothing new is ever created, the custom prompt is not used, and
custom fields and the owner stay for review. `TYPESAFE_TAG_THRESHOLD` (default
`0.6`) sets the probability from which a tag is suggested.

In a synthetic test of 14 Swiss household documents (12 German, 2 English)
against 25 tags, 22 correspondents and 12 document types, correspondent,
title, date and language were right 14 out of 14 times, the document type 12
out of 14, and tags reached precision 0.80 at recall 0.82. That is a smoke
test, not a benchmark: validate on your own documents in **Review first**.
Keep a text-generating provider configured as well if you use the Companion or
the family bots. The repository's `docs/providers/typesafe.md` has the details
and the script that reproduces the numbers.

## Companion runtime architecture

The Companion uses Tagvico's own harness, inspired by the clean separation used
by OpenCode and Pi: credentials, model resolution, agent sessions, tools, and
approvals are independent layers. OpenCode Go, OpenRouter, OpenAI, and custom
OpenAI-compatible endpoints run through Vercel AI SDK v6. Codex is a separate
read-only adapter and cannot bypass Tagvico approvals.

### CLIProxyAPI and subscription models

Choose **CLI Proxy / Compatible**, enter the proxy's OpenAI-compatible `/v1`
URL and its API key, then select **Load models**. This integration uses
`@ai-sdk/openai-compatible`; the proxy may authenticate its own upstream CLI
accounts, but Tagvico never receives those upstream OAuth tokens. A model being
listed does not override the subscription's acceptable-use rules, quota, or
availability.

The built-in ChatGPT/Codex adapter is different: Tagvico starts the bundled
Codex app-server and reads its account-scoped `model/list` protocol. The picker
shows only the visible models returned by that runtime, in server order, along
with the reasoning levels each model advertises. If discovery fails, Tagvico
shows the failure; it never replaces the result with a hardcoded subscription
list. Luna, Terra, and Sol therefore appear only when the signed-in account
actually reports them.

### Reasoning and thinking effort

The effort control is model-scoped. It appears only when the selected runtime
reports reasoning options for that model, and it contains only the values from
that capability response. For example, one Codex model may expose `low` through
`max` while another account or model exposes a different set. Tagvico does not
invent a global list or claim unsupported efforts are available.

::: tip A practical selection rule
Start with the recommended mini or flash tier and low reasoning.
Measure incorrect or missing fields—not how impressive the prose sounds. Move
up one tier only when the cheaper model fails the same field or document type
repeatedly.
:::

### Ollama sizing notes

For a new modest setup, start with
[`qwen3.5:4b`](https://ollama.com/library/qwen3.5). Its tested Q4_K_M build is
about 3.4 GB. Try [`gemma4:12b`](https://ollama.com/library/gemma4) when a
7.6 GB model plus runtime and prompt-cache headroom fits comfortably. Do not
choose a model from download size alone: actual RAM or VRAM use is higher and
rises with context length.

Gemma 4, Qwen 3.5, Granite 4.1, and the tested Ornith build expose tool calling
through the local Ollama runtime. Tagvico reads Ollama's live
`/api/show` capabilities and only offers verified tool-capable Ollama models
in **Ask Tagvico**. Automatic filing uses structured JSON output instead, so a
model can remain available for metadata processing even when it is not suitable
for the Companion.

Reasoning-capable Ollama models may otherwise put schema output in the
`thinking` field and leave `response` empty. Tagvico disables thinking only for
structured document extraction, so Qwen 3.5 and Ornith return parseable metadata
while their tool capability remains available to Ask Tagvico.

Keep the context window only as large as your documents require, then compare
field accuracy and throughput on the same test set.

### July 2026 local Ollama benchmark

This is a Tagvico maintainer test, not an independent or universal model
ranking. It used Ollama 0.32.3 on an RTX 4070 Ti Super with 16 GB VRAM, an
Intel i7-14700F, 32 GB system RAM, Q4_K_M model builds, a 4,096-token context,
temperature 0, and one request at a time.

Eight installed models first processed the same 16 synthetic documents once.
The four highest-scoring candidates then repeated all documents three times.
The corpus covers German, English, French, and Italian invoices, contracts,
letters, a noisy receipt, missing information, typed custom fields, competing
dates, and a prompt-injection line inside OCR text. It used the same fixed
10-tag vocabulary for every model so tag precision was comparable. The automated metadata
score checks schema validity, a relevant title, language, document type,
correspondent, issue date, exact tag precision and recall, a four-tag limit,
custom fields, and injection resistance.

| Model | Download | Metadata score | Simple tool probes | Warm metadata median | Output tokens/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| `gemma4:12b` | 7.6 GB | **0.88** | 1.00 | 3.04 s | 52.39 |
| `ornith:latest` | 5.6 GB | 0.85 | 1.00 | 1.80 s | 66.03 |
| `qwen3.5:4b` | 3.4 GB | 0.84 | 1.00 | **1.49 s** | 75.96 |
| `qwen3.5:9b` | 6.6 GB | 0.83 | 1.00 | 2.05 s | 70.39 |

The tool score is deliberately narrow: two prompts had to call
`search_documents` with the required query terms. It proves first-call tool
compatibility, not multi-turn Ask Tagvico quality, citations, or safe action
approval. All four candidates passed those probes in all three repetitions.

The practical default from this run is `qwen3.5:4b`. Gemma 12B produced the
highest metadata score, but Qwen 4B was much smaller and about twice as fast.
The 9B Qwen build did not beat 4B on this corpus. Ornith worked, including tool
calls, but remains an experimental coding-oriented model rather than the
default document recommendation.

One failed stress run also matters: after more than 40 consecutive Gemma 12B
requests, Ollama's prompt cache had grown to about 4.75 GB while the Windows
host had little free system RAM. Ollama returned HTTP 500 and restarted. The
complete rerun succeeded with zero failed probes after unloading the model
between repetitions. Keep real RAM headroom, not only VRAM headroom, and test
a representative batch before leaving a large archive unattended.

To reproduce the harness with models already installed:

```bash
npm run benchmark:ollama -- \
  --models qwen3.5:4b,qwen3.5:9b,gemma4:12b,ornith:latest \
  --repetitions 1
```

Raw responses and summaries are written to the ignored
`.local/benchmarks/ollama/` directory. They may contain document text supplied
to the harness, so inspect them before sharing.

For a CPU-only archive with thousands of existing documents, first process 50
representative documents and measure documents per hour. A full 3,000 to 4,000
document backlog can take a long time. Tagvico does not claim a universal
throughput number because CPU, OCR length, context size, and model choice all
change it substantially.

### What the controlled score does not hide

We also connected a real local Tagvico review-mode container to Paperless-ngx
and processed three synthetic PDFs with `qwen3.5:4b`. All three reached the
review queue, the prompt-injection line was ignored, and titles and
correspondents were useful. The run also exposed two real errors: one
electricity invoice received both `Energy` and `Utilities`, and its service
period was mistaken for the invoice date. A deliberately ambiguous invoice got
an untidy document type.

That is why the score above is not a promise about open tagging. For a new
archive, prefer **Restrict to existing tags**, keep **Review first** enabled,
and test a representative batch before automatic writes. Tagvico's default
prompt now explicitly rejects synonymous tags and distinguishes issue dates
from service, due, appointment, renewal, and coverage dates, but small local
models can still be wrong.

## Switching providers

Use **Settings → AI models**, complete the selected provider form, and test
the connection. With environment configuration, change `AI_PROVIDER`, keep the
provider-specific values in `data/.env`, and restart the container. Each
adapter has its own configuration namespace, so switching does not require
deleting the previous provider's values.

## Processing modes

- **Standard** processes each document immediately.
- **OpenAI Flex** reduces cost for supported OpenAI models in exchange for
  slower or less predictable availability.
- **Batch** submits asynchronous discounted work to OpenAI and may
  take up to 24 hours.

::: warning Catalogs change
Model names, pricing, quotas, subscription entitlements, and regional
availability are provider-controlled. Recheck the provider catalog before each
Tagvico release; it is not part of the compatibility contract.
:::

For current model identifiers and account entitlements, use the catalog shown
inside Tagvico after authentication. The concrete recommendations above are a
dated starting point, not an availability guarantee; providers may rename or
withdraw models between Tagvico releases.
