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
| OpenAI direct | Native OpenAI models, Flex, and Batch | API key | Flex and Batch are available only for supported models. |
| Anthropic direct | Claude and Message Batches | API key | Supports standard requests and discounted asynchronous batches. |
| OpenCode Go | Subscription inference gateway | Go API key | OpenAI-compatible request path with provider-controlled limits. |
| GitHub Copilot | Account-scoped model discovery | OAuth device login or supported token | Uses the official SDK; every agent tool is denied. |
| OpenAI-compatible | LM Studio, LiteLLM, vLLM, custom gateways | Base URL and optional key | Use an endpoint that implements OpenAI Chat Completions. |
| Azure OpenAI | Existing Azure deployments and governance | Endpoint, deployment, API key | Model availability follows your Azure deployment. |
| ChatGPT subscription | Optional private, low-volume model adapter | Stable Codex device login | Uses the official Codex SDK in read-only mode. It is not the Tagvico harness and does not provide an API SLA. |

## Cost-conscious recommendations

These are starting points for document classification, where consistent
structured output matters more than maximum general-purpose reasoning. Test at
least 20–50 representative documents in **Review first** before deciding that a
model is good enough for Automatic mode.

| Provider | Recommended starting point | Why it is a good-value choice |
| --- | --- | --- |
| OpenRouter | **GPT-5.4 Mini** with low reasoning | Best general hosted default in Tagvico: reliable structured extraction without paying for a frontier-sized model. Try **GPT-5.4 Nano** or **Gemini 3.1 Flash Lite** for very clean, repetitive documents; avoid the free router for unattended production because the underlying model can change. |
| Ollama | **Qwen 3.5 4B** on modest hardware; **Qwen 3.5 9B** when it fits comfortably | Qwen 3.5 is the current value-oriented starting family for structured, multilingual filing. The 4B download is about 3.4 GB; the 9B build is about 6.6 GB and is the better quality target when memory allows. **Gemma 3 4B** is a strong compact alternative. Gemma 4 is newer, but even its E2B/E4B edge variants have larger model files and are less attractive for a cheapest-first setup. |
| Ollama Cloud | **gpt-oss:20b-cloud** | Tagvico's default balances capability with a moderate hosted footprint and avoids buying or running a GPU. Recheck the cloud catalog and account limits before committing to it. |
| OpenAI direct | **GPT-5.4 Mini**; use **Batch** for non-urgent archives | Mini is the balanced default. **GPT-5.4 Nano** can reduce cost further for predictable invoices and statements. Batch is preferable when turnaround can wait; Flex is useful when supported and occasional slower availability is acceptable. |
| Anthropic direct | **Claude Haiku 4.5**; use Message Batches when latency is unimportant | Haiku is the speed-and-cost tier and is normally sufficient for titles, tags, and other structured fields. Move to a larger Claude model only for difficult layouts or extraction failures. |
| OpenCode Go | **DeepSeek V4 Flash** | This is Tagvico's budget-oriented default for the Go gateway. It suits classification-heavy workloads; confirm the current subscription allowance and gateway model catalog. |
| GitHub Copilot | **GPT-5.4 Mini** when the signed-in plan exposes it | It offers a strong quality/cost balance without a separate per-token key inside Tagvico. Prefer a model with the lowest billing multiplier that still passes your test set, because plan entitlements differ. |
| OpenAI-compatible | A **mini**, **flash**, or roughly **8B–20B instruct** model supported by your gateway | Compatible endpoints vary too much for one universal slug. Start small, require reliable JSON/structured output, and increase model size only when the error rate justifies the extra compute or gateway cost. |
| Azure OpenAI | A deployment of **GPT-5.4 Mini** | Mini is the normal value choice when Azure governance is required. Azure deployment availability and regional pricing take precedence over the public model name. |
| ChatGPT subscription | The configured Codex model supported by the signed-in account | Suitable for one trusted, low-volume installation when subscription-backed inference is preferable. Model availability remains account-controlled and is not an API service guarantee. |

## Companion runtime architecture

The Companion uses Tagvico's own harness, inspired by the clean separation used
by OpenCode and Pi: credentials, model resolution, agent sessions, tools, and
approvals are independent layers. OpenCode Go, OpenRouter, OpenAI, and custom
OpenAI-compatible endpoints run through Vercel AI SDK v6. Codex is a separate
read-only adapter and cannot bypass Tagvico approvals.

::: tip A practical selection rule
Start with the recommended mini, flash, or Haiku tier and low reasoning.
Measure incorrect or missing fields—not how impressive the prose sounds. Move
up one tier only when the cheaper model fails the same field or document type
repeatedly.
:::

### Ollama sizing notes

The official [Qwen 3.5 library](https://ollama.com/library/qwen3.5) currently
offers `0.8b`, `2b`, `4b`, `9b`, and larger variants—there is no official 7B
or 8B tag. For Tagvico, start with:

- `qwen3.5:4b` for a low-memory trial and routine, clean documents.
- `qwen3.5:9b` for the preferred local balance when the roughly 6.6 GB model
  file plus runtime overhead fits comfortably.
- [`gemma3:4b`](https://ollama.com/library/gemma3) for a compact multilingual
  alternative with a roughly 3.3 GB model file.
- [`gemma4:e2b` or `gemma4:e4b`](https://ollama.com/library/gemma4) only when
  you specifically want Gemma 4 and can
  accommodate their roughly 7.2 GB or 9.6 GB model files. Their “E” sizes mean
  effective parameters, not download or runtime memory.

Actual RAM or VRAM use is higher than the model file and rises with context
length. Keep the context window only as large as your documents require, then
compare field accuracy and throughput on the same test set.

## Switching providers

Use **Settings → AI provider**, complete the selected provider form, and test
the connection. With environment configuration, change `AI_PROVIDER`, keep the
provider-specific values in `data/.env`, and restart the container. Each
adapter has its own configuration namespace, so switching does not require
deleting the previous provider's values.

## Processing modes

- **Standard** processes each document immediately.
- **OpenAI Flex** reduces cost for supported OpenAI models in exchange for
  slower or less predictable availability.
- **Batch** submits asynchronous discounted work to OpenAI or Anthropic and may
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
