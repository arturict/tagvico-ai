# Model provider overview

Provider choice determines where OCR text is processed, how credentials are
managed, which models are visible, and which cost modes are available. Validate
quality with representative documents before enabling Automatic writes.

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
| ChatGPT subscription | Experimental private, low-volume use | Codex device login | Uses the official Codex runtime; this is not an API SLA. |

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
