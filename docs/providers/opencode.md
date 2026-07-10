# OpenCode Go

Tagvico connects directly to OpenCode Go's OpenAI-compatible subscription API.
It uses the API key from your Go account; Tagvico does not install or automate
the OpenCode CLI.

## Setup

1. Subscribe to OpenCode Go and copy its API key.
2. In Tagvico Settings, choose **OpenCode Go**.
3. Paste the key, keep the default Go gateway, and choose a model from the
   current Go catalog.
4. Save to run the connection check.

Equivalent environment configuration:

```dotenv
AI_PROVIDER=opencode
OPENCODE_API_KEY=...
OPENCODE_BASE_URL=https://opencode.ai/zen/go/v1
OPENCODE_MODEL=deepseek-v4-flash
```

For document filing, `deepseek-v4-flash` is the low-cost/high-throughput
starting point. `mimo-v2.5` is another budget option; use
`kimi-k2.7-code` or `glm-5.2` when harder documents justify more of the plan's
allowance. The model list is live at `https://opencode.ai/zen/go/v1/models` and
may change.

The Go subscription is currently advertised at $5 for the first month and
$10/month afterward. Prices and request allowances are provider-controlled;
check them before publishing release copy.

Official references: [OpenCode Go](https://opencode.ai/go) and
[Go API endpoints and models](https://opencode.ai/docs/go/).
