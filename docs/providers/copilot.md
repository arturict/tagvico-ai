# GitHub Copilot subscription

Tagvico uses the official [`@github/copilot-sdk`](https://github.com/github/copilot-sdk)
to run a one-turn extraction session. The adapter starts the Copilot runtime
with an empty tool allow-list and rejects every tool request, so document OCR
cannot grant shell, filesystem, MCP, or web access.

## Authentication

Choose one supported GitHub authentication path. All interactive paths use the
official Copilot CLI's OAuth device flow and the same persistent `COPILOT_HOME`:

- **Web or desktop browser:** choose GitHub Copilot in Settings and click
  **Sign in with GitHub**. Open the displayed link and enter the one-time code.
- **CLI or SSH:** run
  `docker exec -it tagvico-ai npm run auth:copilot`.
- **Automation fallback:** paste a supported fine-grained GitHub token or OAuth
  user token in Settings or provide `COPILOT_GITHUB_TOKEN`.

```dotenv
AI_PROVIDER=copilot
COPILOT_GITHUB_TOKEN=github_pat_...
COPILOT_MODEL=gpt-5.4-mini
COPILOT_HOME=/app/data/copilot
```

Model access and usage are controlled by the signed-in Copilot plan. Tagvico
calls the SDK's `listModels()` method and renders that account-specific result
as a dropdown; it does not claim access to preview or third-party models that
the account did not return.

Official references: [Copilot SDK authentication](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate)
and [models and pricing](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing).
