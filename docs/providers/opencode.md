# OpenCode Go

Tagvico connects to OpenCode Go through the OpenCode Console's
OpenAI-compatible inference gateway. It uses a service API key; Tagvico does
not install or automate the OpenCode CLI.

## Setup

1. Create a service API key in OpenCode Console.
2. In Tagvico Settings, choose **OpenCode Go**.
3. Paste the key, keep the default gateway unless your Console says otherwise,
   and enter a model ID your account is allowed to use.
4. Save to run the connection check.

Equivalent environment configuration:

```dotenv
AI_PROVIDER=opencode
OPENCODE_API_KEY=oc_sk_...
OPENCODE_BASE_URL=https://console.opencode.ai/inference/openai/v1
OPENCODE_MODEL=<model-from-your-console-catalog>
```

The Console owns model availability, rate limits, and billing. Do not copy a
model identifier from another account without checking your Console catalog.

Official references: [OpenCode Console config API](https://console.opencode.ai/guides/config)
and [OpenCode inference guide](https://console.opencode.ai/guides).
