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
COPILOT_MODEL=gpt-5.4
COPILOT_HOME=/app/data/copilot
```

Model access and usage are controlled by your Copilot plan. `gpt-5.4` is a good
quality default; Claude Haiku 4.5 is often a lower-cost plan option. Kimi K2.7
Code may be available on some plans, but model availability and multipliers can
change, so select only models returned by your account.

Official references: [Copilot SDK authentication](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate)
and [supported models](https://docs.github.com/en/copilot/reference/ai-models/supported-models).
