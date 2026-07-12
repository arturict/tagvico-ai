# Project status

**Status:** v2 prerelease (`2.0.0-alpha.1`) — under active testing.

## What this means

Tagvico AI v2 is in **prerelease testing**. The TypeScript migration and core
review-first filing workflow are complete, but the following may still change
before stable `2.0.0`:

- The HTTP/REST API surface (paths, request bodies, response fields).
- The configuration schema in `data/.env` and the setup wizard.
- The SQLite database schema in `data/tagvico.db` (migrations are provided, but backwards compatibility is not guaranteed across v2 prereleases).
- Provider adapter behavior (Ollama, OpenAI, OpenRouter, Azure OpenAI, OpenAI-compatible, Anthropic, experimental Codex sign-in).
- Default values, output formats, and confidence thresholds.
- File paths, filenames, and the on-disk layout inside the persistent volume.

## Recommendations for prerelease users

- **Pin a specific release tag** in `docker-compose.yml` (for example `ghcr.io/arturict/tagvico-ai:<version>`), never `:latest`. We publish immutable tags per release.
- **Back up the `tagvico_ai_data` volume** before upgrading. The volume holds your admin account, provider settings, and processing history.
- **Test upgrades on a non-production instance** if you rely on automatic metadata writes.
- **Read the release notes** for breaking changes — they are documented per release on the [GitHub releases page](https://github.com/arturict/tagvico-ai/releases).

## What is stable enough to rely on

- The Docker image contract: same env vars, same port, same persistent volume path.
- The setup wizard flow (browser-based onboarding at `/setup`).
- The Paperless-ngx integration: we only write to the official Paperless REST API, and we never modify your Paperless database directly.
- The local admin account: the SQLite-stored credentials in the persistent volume.
- The OpenAI-compatible provider contract: anything that speaks the OpenAI Chat Completions API works the same way.

## Reporting prerelease issues

The prerelease window is where feedback is most useful. Please file issues for:

- Surprising behavior or errors during setup.
- Provider failures, malformed responses, or token-limit issues.
- Database migration errors when upgrading from an earlier version.
- Anything you would expect to be configurable but cannot find.

Security issues must **not** be filed as public issues — see [SECURITY.md](../SECURITY.md).

## Roadmap toward stable v2

- [x] Complete the TypeScript migration of all services and routes.
- Lock the REST API surface, configuration schema, and database schema.
- Complete representative Paperless ingest, restore, OCR, and provider-account
  checks, then tag stable `2.0.0`.

This document lives at `docs/STATUS.md` and is updated when the project status changes.
