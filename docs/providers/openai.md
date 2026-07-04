# OpenAI

Direct access to OpenAI's Chat Completions API. The fastest path if you
already have an OpenAI account and an API key.

## Required env vars

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.4-mini
```

Optional:

```env
AI_REASONING_EFFORT=medium   # low | medium | high, for reasoning models
RESPONSE_TOKENS=1024         # max tokens in the model response
TOKEN_LIMIT=128000           # context window cap for input truncation
```

`OPENAI_MODEL` accepts any chat-capable model id. The README lists the
current default set; check the OpenAI dashboard for the latest names.

## Privacy and cost

OpenAI receives the OCR text and metadata of every document Tagvico
processes while this provider is active. Inputs and outputs are subject
to OpenAI's [API data usage policies](https://openai.com/policies/api-data-usage-policies);
by default the API does not retain or train on requests, but enterprise
data-residency guarantees require a separate agreement. Cost is per token
for both input and output — a typical single-page document processes in
the low thousands of input tokens and a few hundred output tokens. The
mini and nano variants are 10-50x cheaper than the full models and are
the right starting point for most home archives.

## Troubleshooting

- **`401 Incorrect API key`** — `OPENAI_API_KEY` is missing, revoked, or
  belongs to a different organization than the model you requested. Rotate
  the key in the OpenAI dashboard and restart the container.
- **`404 model not found`** — the value of `OPENAI_MODEL` is misspelled or
  has been retired. Open the model picker in the OpenAI playground,
  copy the exact id, and update `OPENAI_MODEL`.
- **`429 rate limit exceeded`** — the polling interval is too aggressive
  for your tier. Increase `SCAN_INTERVAL` (seconds) or upgrade the
  OpenAI account tier.
