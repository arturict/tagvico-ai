# Codex subscription provider (experimental)

This provider runs the official TypeScript Codex SDK against one trusted user's persisted Codex CLI login. It is intended for private, low-volume, single-user installations. Codex models are optimized for software work rather than document extraction, and ChatGPT-plan limits are not an API service-level guarantee.

## Sign in from Tagvico

Choose Codex in Settings and select **Sign in with ChatGPT**. Tagvico asks the official Codex app-server to start a device-code login and displays the verification URL and one-time code. The Codex runtime owns OAuth, refreshes tokens and writes credentials to `CODEX_HOME`; Tagvico never receives token values in the browser.

## Container login fallback

The Compose file sets `CODEX_HOME=/app/data/codex`, inside the persistent data volume. Start the container and authenticate with device login:

```bash
docker exec -it tagvico-ai ./node_modules/.bin/codex login --device-auth
```

Select `codex` in Settings afterward. `/api/codex/status` reports account type, email and plan when available without returning credential contents.

The Codex home must be writable because the CLI refreshes its login. Do not share it, commit it, or mount another person's general-purpose Codex home. Tagvico disables shell tools, web search, hooks, skills, MCP, memories, and transcript history for extraction turns and passes only a minimal environment to the SDK.

Supported settings:

- `CODEX_HOME` defaults to `data/codex`.
- `CODEX_MODEL` defaults to `gpt-5.4-mini` and remains configurable as subscription availability changes.
- `CODEX_TIMEOUT_MS` defaults to 120000.

There is no automatic fallback to paid API-key usage. Authentication, model-access, timeout, or plan-limit errors enter the normal retry/failure workflow.

Official references: [Codex SDK](https://developers.openai.com/codex/sdk), [authentication](https://developers.openai.com/codex/auth), and [pricing](https://developers.openai.com/codex/pricing).
