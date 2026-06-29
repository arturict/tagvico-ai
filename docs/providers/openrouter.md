# OpenRouter

OpenRouter is a unified router that fronts dozens of model providers
under a single API key. Useful if you want to mix and match models
(Anthropic, Google, Meta, Mistral, ...) without managing separate
accounts.

## Required env vars

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

Optional:

```env
OPENROUTER_HTTP_REFERER=https://github.com/arturict/archivista-ai
```

`OPENROUTER_MODEL` is a `provider/model` slug — the full list lives in
the [OpenRouter models page](https://openrouter.ai/models). Some slugs
require a paid OpenRouter credit balance even if the underlying provider
has a free tier.

`OPENROUTER_HTTP_REFERER` is sent as the `HTTP-Referer` header, which
OpenRouter uses to attribute traffic to the calling app. It is not
required, but OpenRouter asks that production integrations set it.

## Privacy and cost

OpenRouter forwards your request to the underlying provider, so the
data-handling terms of the chosen model apply. Some models are routed
through providers that log prompts — review the model card on
OpenRouter before sending sensitive documents. Pricing is per token and
varies by model; OpenRouter adds a small flat fee on top. Credit packs
are prepaid, so there is no recurring card charge.

## Troubleshooting

- **`402 Payment required`** — your OpenRouter credit balance is empty.
  Top up at <https://openrouter.ai/credits>.
- **`404 no allowed providers`** — the model slug is wrong or has been
  removed. Pick a model from the OpenRouter models page and copy the
  slug exactly.
- **`429 rate limit`** — OpenRouter enforces per-key request and token
  limits. Reduce `SCAN_INTERVAL` (the env var holds the *seconds*
  between polls) or split the workload across two API keys running two
  Archivista instances.
