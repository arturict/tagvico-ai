# Changelog

## Unreleased

## 3.0.0 - 2026-07-22

### Added

- Added the Action Center: one durable case per Paperless document with owner,
  priority, due date, state, audit trail, and up to 100 checklist steps.
- Added household roles and encrypted, member-specific Paperless tokens for
  permission-aware web and Telegram actions.
- Added the document-grounded Companion with narrow read tools, durable write
  proposals, explicit owner/adult approval, and deterministic execution.
- Added a Next.js v3 console for actions, approvals, Companion sessions,
  household settings, and the established filing operations.

### Security and reliability

- Preserved the v2.0.1 configured-instance setup takeover protection.
- Kept every AI-proposed write behind an explicit approval and exposed no shell
  or filesystem tools to the Companion.
- Removed an unnecessary build-time CLI dependency and updated the docs build
  toolchain so the full dependency audit reports zero known vulnerabilities.

### Upgrade note

- Back up `tagvico_ai_data`, pin `ghcr.io/arturict/tagvico-ai:3.0.0`, and allow
  the schema-v5 migration to finish. The public app remains on port 3000; its
  internal scanner process uses port 3001 and must not be exposed.

## 2.0.1 - 2026-07-21

### Security and privacy

- Reject public `POST /setup` requests once setup has completed, before any
  Paperless connection check or configuration write. Change existing settings
  only after signing in.

### Added

- Add an optional, private-chat-only Telegram interface for allowlisted users. Each Telegram ID uses its own Paperless API token for search, cited-original downloads, and PDF/photo uploads.
- Keep Telegram conversation history bounded and in memory per user, with `/clear` support and no bot conversation database.
- Wait for Paperless upload consumption and link the existing document when Paperless reports a duplicate.

### Security and privacy

- Keep Telegram support disabled by default and ignore unknown users and non-private chats without responding.
- Make automatic AI metadata writes for Telegram uploads a separate explicit opt-in because they bypass the web review queue.
- Document that Telegram bot chats are not end-to-end encrypted and that retrieved OCR follows the configured model provider's data boundary.

## 2.0.0 - 2026-07-13

- Promoted the reviewable Paperless-ngx filing workflow to the first stable v2
  release after representative setup, ingest, review, apply, restore, migration,
  Docker, and multi-architecture validation.
- Fixed fresh installations contacting Paperless before setup was complete.
- Fixed History restoration so it exactly replaces metadata, including clearing
  AI-created tags and restoring null correspondent and document-type values.
- Locked the documented v2 installation, upgrade, removal, provider, privacy,
  and troubleshooting contract and published sanitized screenshots.
- Kept anonymous installation analytics explicitly opt-in and off by default;
  no official collector endpoint is embedded in v2.0.0.
- **Upgrade note:** Back up `tagvico_ai_data`, pin
  `ghcr.io/arturict/tagvico-ai:2.0.0`, migrate deprecated `ARCHIVISTA_*`
  variables to `TAGVICO_*`, and validate representative documents in Review
  first before enabling Automatic mode.

## 2.0.0-alpha.1 - 2026-07-12

- Added an optional review-first workflow with durable suggestions, structured
  metadata diffs, Apply/Reject actions, original-metadata snapshots, restore,
  retries, and reconciliation.
- Added subscription-backed ChatGPT/Codex and GitHub Copilot providers using
  official runtimes, device authentication, account-visible model discovery,
  and disabled agent tools.
- Added Ollama Cloud, OpenCode Go, Anthropic, OpenRouter, Azure OpenAI, local
  Ollama, OpenAI direct, and OpenAI-compatible provider paths with isolated
  credentials and provider-aware health checks.
- Added controlled tag groups, an exception queue, tag caps, custom fields,
  optional owner assignment, OCR rescue, terminal-failure handling, and
  interrupted-job recovery.
- Added hardened thumbnail handling, same-origin mutation checks, MFA, rate
  limits, SSRF-safe external enrichment, generated JWT secrets, and strict
  TypeScript checks across the application.
- Added versioned v2 installation, upgrade, removal, provider, privacy,
  troubleshooting, and feature documentation with sanitized screenshots.
- Added optional, off-by-default aggregate installation analytics with rotating
  daily/monthly identifiers, exact local payload preview, and a reference
  receiver with bounded retention. No collector is contacted unless an HTTPS
  endpoint is explicitly configured.
- Added GitHub traffic archival, repository discovery metadata, launch assets,
  an Unraid template, and a contextual GitHub star prompt.
- **Upgrade note:** Back up `tagvico_ai_data`, migrate deprecated
  `ARCHIVISTA_*` variables to `TAGVICO_*`, pin the exact prerelease image, and
  validate representative documents in Review first before enabling Automatic.

- Migrated the dashboard charts from Chart.js to Apache ECharts 5 for smoother animations, sharper tooltips, and better theme integration (doughnut, bar, rose/pie, and area-line visualizations).
- Refined the dashboard visual design: subtle card hover elevation, tabular-numeral KPIs, consistent chart legends, and polished empty states — preserving the existing neo-brutalist aesthetic.
- Added a clearly-labelled **cost estimate** to the dashboard: total estimated spend, average cost per document, and an input-vs-output cost split, derived from tracked token totals and the active model's public list price (`services/modelPricing.ts`). Free local models (Ollama) and installations without tracked usage correctly show no cost, and unknown cloud models fall back to a conservative estimate flagged with an asterisk.
- Made model pricing **dynamic**: prices are now pulled from [models.dev](https://models.dev) (all providers/models) via `services/pricingCatalog.ts`, cached on disk under `data/` with a 12h TTL and refreshed in the background. Lookups stay synchronous (the dashboard never blocks on the network) and degrade gracefully offline, falling back to the curated static price book and finally a conservative estimate. This means costs are now covered for effectively every provider/model, not just a hand-maintained list.
  - Hardened the pricing catalog: sanitize third-party model labels, HTML-escape the model name rendered on the dashboard, and cap the pricing fetch response size.
- Escaped document-type names in the dashboard chart tooltip to prevent HTML/script injection from document titles.
- Defaulted the OpenAI-family fallback model to `gpt-5.4-mini` and priced the current GPT-5.4/5.5/5.6 families in the cost estimator.
- Reworked the onboarding and dashboard UX around proven behavioural principles:
  - **Smart defaults** pre-fill the recommended Paperless username and scan interval so users scan-and-adjust instead of starting from a blank form.
  - **Goal-gradient progress bar** never starts at zero: opening setup already counts as step 1 of 5 (20%), and the bar fills live as fields are completed.
  - **Reciprocity / value-first** messaging highlights that the first scan runs free with no credit card.
  - **Loss aversion** framing surfaces unfiled documents as "still unfiled and waiting".
  - **Contrast effect** anchors the AI cost estimate against the equivalent manual-filing cost, showing the money saved.

## 1.4.0 - 2026-07-06

- Completed the strict TypeScript migration across services, routes, configuration, models, and the server; new `@ts-nocheck` suppressions are rejected by the type-debt guard.
- Finished the Tagvico AI rebranding across shipped code, container configuration, documentation, and user-facing views.
- Added canonical `TAGVICO_AI_PORT`, `TAGVICO_AI_HOST_PORT`, `TAGVICO_AI_VERSION`, and `TAGVICO_AI_INITIAL_SETUP` environment variables.
- **Deprecation:** Existing `ARCHIVISTA_*` variables remain supported as warning-emitting fallbacks for compatibility. Deployments should migrate to `TAGVICO_*` variables before a future major version removes the aliases.

## 1.3.0 - 2026-07-05

- **Project Rebranding**: Renamed the project from **Archivista AI** to **Tagvico AI** due to trademark requests.
- **Controlled Tagging & Tag Groups**: Added dynamic configuration for Tag Groups (presets like Finance, Health, Legal, etc., plus custom groups) to restrict LLM suggestions to a precise vocabulary.
- **Exceptions Review & Approval Queue**: Created a SQLite-backed workflow where unknown LLM-suggested tags are held for manual review. Users can approve them into specific tag groups or reject them.
- **Provider Modal & UI Polish**: Replaced the bulky provider grid on the configuration page with a searchable provider/model modal featuring SVGL icons.
- **Integration Test Stack**: Added Postgres 18, Redis 8, and Paperless-ngx services to `docker-compose.yml` for simplified local integration testing.
- **Paperless Username Autodetect**: Cleaned up credential lookup to fallback to the first active user when `PAPERLESS_USERNAME` is blank.
- Fixed constrained scrolling in the model picker on mobile and desktop.
- Read the displayed application version dynamically from `package.json` instead of a stale hard-coded value.

## 1.2.0 - 2026-07-05

- Added official Codex app-server device login for ChatGPT subscriptions.
- Added provider-aware health checks at `/api/health`.
- Added dry-run review apply, structured metadata diffs, audit history, restore and rescan actions.
- Added live SSE progress for review writes.
- Added durable OCR rescue, retry and reconciliation operations.
- Added MFA, rate limiting, persistent JWT secrets and hardened container defaults.
- Added Claude/Codex provider support and OpenAI-compatible provider documentation.
- Added property, persistence, security and EJS compilation tests.
