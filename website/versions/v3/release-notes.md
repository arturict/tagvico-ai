# Release notes

## v3.1.2 — current stable

Released 24 July 2026.

This focused Ask Tagvico hotfix removes embedding-only models from every chat
model picker. It covers common embedding names as well as colon- and
slash-delimited provider IDs such as `qwen3-embedding:4b`.

Upgrade by backing up `tagvico_ai_data`, pinning
`ghcr.io/arturict/tagvico-ai:3.1.2`, and recreating only the Tagvico container.
No settings or data migration is required.

## v3.1.1

- Unified Settings around eight supported runtimes with write-only credentials,
  live probes, scrollable model catalogs, and account authentication for
  ChatGPT subscription and GitHub Copilot.
- Added durable Ask Tagvico conversations, model choice, retry/copy/stop,
  privacy-safe tool activity, and intent-aware Paperless research.
- Made trigger tags optional, kept four tags as the default ceiling, and added
  clearer scan results, recovery queues, exact restore, and history cleanup.
- Added many-to-one duplicate-tag proposals, custom filing instructions, an
  advanced system prompt, and the in-product changelog.

## v3.1.0

- Moved every user-facing workflow into the same green React application shell.
- Reorganized navigation around Actions, Ask Tagvico, Automation, Activity, and
  Settings.
- Restored Paperless discovery, added approval-first tag unification, and
  bundled the matching versioned documentation at `/docs/`.

For complete technical details, see the repository
[CHANGELOG](https://github.com/arturict/tagvico-ai/blob/main/CHANGELOG.md) and
[GitHub releases](https://github.com/arturict/tagvico-ai/releases).
