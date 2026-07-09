# GitHub Copilot subscription

Tagvico uses the official [`@github/copilot-sdk`](https://github.com/github/copilot-sdk)
to run a one-turn extraction session. The adapter starts the Copilot runtime
with an empty tool allow-list and rejects every tool request, so document OCR
cannot grant shell, filesystem, MCP, or web access.

## Authentication

Choose one supported GitHub authentication path:

- Paste a supported fine-grained GitHub token or OAuth user token in Settings.
- Sign in interactively inside the container with `copilot auth login`, then
  leave the token field blank. The Copilot CLI uses GitHub's device flow and
  stores credentials in `COPILOT_HOME`.

```dotenv
AI_PROVIDER=copilot
COPILOT_GITHUB_TOKEN=github_pat_...
COPILOT_MODEL=gpt-5.4-mini
COPILOT_HOME=/app/data/copilot
```

Model access and usage are controlled by your Copilot plan. Use
`gpt-5.6-luna` when the preview is actually returned for your account;
`gpt-5.4-mini` is the stable default for filing. Under GitHub's current
usage-based pricing, GPT-5.4 Mini is $0.75/$4.50 per 1M input/output tokens,
Claude Haiku 4.5 is $1/$5, and Kimi K2.7 Code is $0.95/$4. Model availability,
included AI credits, and legacy annual-plan multipliers can change.

Official references: [Copilot SDK authentication](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate)
and [models and pricing](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing).
