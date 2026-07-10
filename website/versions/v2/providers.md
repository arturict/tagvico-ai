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
| ChatGPT subscription | Experimental private, low-volume use | Codex device login | Uses the official Codex runtime and the account's live catalog, which may include GPT-5.6 Luna; this is not an API SLA. |

## Cost-conscious recommendations

These are starting points for document classification, where consistent
structured output matters more than maximum general-purpose reasoning. Test at
least 20–50 representative documents in **Review first** before deciding that a
model is good enough for Automatic mode.

| Provider | Recommended starting point | Why it is a good-value choice |
| --- | --- | --- |
| OpenRouter | **GPT-5.4 Mini** with low reasoning | Best general hosted default in Tagvico: reliable structured extraction without paying for a frontier-sized model. Try **GPT-5.4 Nano** or **Gemini 3.1 Flash Lite** for very clean, repetitive documents; avoid the free router for unattended production because the underlying model can change. |
| Ollama | Start with **Llama 3.2**; choose the smallest local model that passes your test set | There is no per-token API bill. A smaller model is usually faster and cheaper to operate, but local hardware, electricity, language mix, and OCR quality determine the real value. Step up in model size only when fields are repeatedly missed. |
| Ollama Cloud | **gpt-oss:20b-cloud** | Tagvico's default balances capability with a moderate hosted footprint and avoids buying or running a GPU. Recheck the cloud catalog and account limits before committing to it. |
| OpenAI direct | **GPT-5.4 Mini**; use **Batch** for non-urgent archives | Mini is the balanced default. **GPT-5.4 Nano** can reduce cost further for predictable invoices and statements. Batch is preferable when turnaround can wait; Flex is useful when supported and occasional slower availability is acceptable. |
| Anthropic direct | **Claude Haiku 4.5**; use Message Batches when latency is unimportant | Haiku is the speed-and-cost tier and is normally sufficient for titles, tags, and other structured fields. Move to a larger Claude model only for difficult layouts or extraction failures. |
| OpenCode Go | **DeepSeek V4 Flash** | This is Tagvico's budget-oriented default for the Go gateway. It suits classification-heavy workloads; confirm the current subscription allowance and gateway model catalog. |
| GitHub Copilot | **GPT-5.4 Mini** when the signed-in plan exposes it | It offers a strong quality/cost balance without a separate per-token key inside Tagvico. Prefer a model with the lowest billing multiplier that still passes your test set, because plan entitlements differ. |
| OpenAI-compatible | A **mini**, **flash**, or roughly **8B–20B instruct** model supported by your gateway | Compatible endpoints vary too much for one universal slug. Start small, require reliable JSON/structured output, and increase model size only when the error rate justifies the extra compute or gateway cost. |
| Azure OpenAI | A deployment of **GPT-5.4 Mini** | Mini is the normal value choice when Azure governance is required. Azure deployment availability and regional pricing take precedence over the public model name. |
| ChatGPT subscription | **GPT-5.6 Luna** when it appears in the account catalog | Luna is the preferred low-cost GPT-5.6 tier for repetitive filing. Use **GPT-5.4 Mini** as the fallback. Subscription access is experimental, intended for one trusted low-volume installation, and is not an API service guarantee. |

::: tip A practical selection rule
Start with the recommended mini, flash, Haiku, or Luna tier and low reasoning.
Measure incorrect or missing fields—not how impressive the prose sounds. Move
up one tier only when the cheaper model fails the same field or document type
repeatedly.
:::

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
inside Tagvico after authentication. The documentation intentionally does not
hard-code model names that providers may rename or withdraw.
