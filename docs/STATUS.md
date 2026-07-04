# Project status

**Status:** Alpha — under active development.

## What this means

Tagvico AI is in **alpha**. We are stabilizing the core filing workflow, the provider adapters, and the TypeScript migration. You can run it for real, and many people do, but the following may change at any time without a deprecation cycle:

- The HTTP/REST API surface (paths, request bodies, response fields).
- The configuration schema in `data/.env` and the setup wizard.
- The SQLite database schema in `data/tagvico.db` (migrations are provided, but backwards compatibility is not guaranteed across pre-1.0 releases).
- Provider adapter behavior (Ollama, OpenAI, OpenRouter, Azure OpenAI, OpenAI-compatible, Anthropic, experimental Codex sign-in).
- Default values, output formats, and confidence thresholds.
- File paths, filenames, and the on-disk layout inside the persistent volume.

## Recommendations for alpha users

- **Pin a specific release tag** in `docker-compose.yml` (for example `ghcr.io/arturict/tagvico-ai:1.1.0`), never `:latest`. We publish immutable tags per release.
- **Back up the `tagvico_ai_data` volume** before upgrading. The volume holds your admin account, provider settings, and processing history.
- **Test upgrades on a non-production instance** if you rely on automatic metadata writes.
- **Read the release notes** for breaking changes — they are documented per release on the [GitHub releases page](https://github.com/arturict/tagvico-ai/releases).

## What is stable enough to rely on

- The Docker image contract: same env vars, same port, same persistent volume path.
- The setup wizard flow (browser-based onboarding at `/setup`).
- The Paperless-ngx integration: we only write to the official Paperless REST API, and we never modify your Paperless database directly.
- The local admin account: the SQLite-stored credentials in the persistent volume.
- The OpenAI-compatible provider contract: anything that speaks the OpenAI Chat Completions API works the same way.

## Reporting alpha issues

Alpha is exactly the phase where feedback is most useful. Please file issues for:

- Surprising behavior or errors during setup.
- Provider failures, malformed responses, or token-limit issues.
- Database migration errors when upgrading from an earlier version.
- Anything you would expect to be configurable but cannot find.

Security issues must **not** be filed as public issues — see [SECURITY.md](../SECURITY.md).

## Roadmap toward 1.0

- Complete the TypeScript migration of all services and routes.
- Lock the REST API surface, configuration schema, and database schema.
- Cut a release candidate, run a community testing window, then tag 1.0.

This document lives at `docs/STATUS.md` and is updated when the project status changes.
