# Changelog

## 3.1.2 - 2026-07-24

### Ask Tagvico

- Exclude provider model IDs containing colon- or slash-delimited embedding
  markers, including Ollama models such as `qwen3-embedding:4b` and
  `nomic-embed-text:latest`, from every chat model picker.

## 3.1.1 - 2026-07-24

### Providers and Companion

- Consolidate Settings around eight supported runtimes: OpenRouter, Ollama,
  Ollama Cloud, OpenCode Go, GitHub Copilot, CLI Proxy / Compatible, OpenAI,
  and ChatGPT subscription. Direct Anthropic and Azure OpenAI configuration is
  no longer exposed.
- Add locally cached SVGL provider artwork, independent write-only credential
  forms, live connection probes, scrollable runtime model catalogs, and
  first-class ChatGPT and GitHub Copilot device authentication.
- Add persistent multi-conversation Companion navigation with new-chat,
  search, rename, guarded delete, suggested questions, provider/model choice,
  response retry/stop/copy actions, and visible privacy-safe Paperless tool
  activity.
- Replace the unconditional subscription-adapter document search with
  intent-aware research. Greetings no longer touch Paperless, total counts use
  the real collection count, recent-document requests use ordered metadata,
  and content questions read only the bounded matching documents.
- Keep non-chat catalog entries such as embedding, image, speech, moderation,
  realtime, and legacy completion models out of the Companion picker.
- Move approvals into an on-demand panel and collapse conversations on mobile
  so the chat and composer keep a usable reading width.
- Hide the Review queue navigation item when Automatic write mode is active;
  queued review records remain preserved and reappear when Review first is
  enabled.

### Automation and recovery

- Make trigger tags optional and fail open to all eligible new documents when
  an older installation has trigger filtering enabled without configured tags.
  Settings now explain the active eligibility rule, and manual scans report
  eligible, processed, staged, skipped and failed counts instead of a generic
  success message.
- Re-register the background scan schedule when the persisted automation
  configuration changes, without requiring a container restart.
- Keep four tags as the default hard ceiling while asking every provider for
  the smallest useful tag set and preventing tags from duplicating language,
  correspondent or document type.
- Preserve history and original restore snapshots during single, bulk and
  all-document rescans. Explicit rescans now bypass trigger-tag filters through
  a durable rescan queue instead of deleting audit data.
- Record processing success only after Paperless-ngx accepts the metadata
  update; local history, token metrics and processed state can no longer claim
  success after a failed remote write.
- Retry both AI classification and OCR rescue up to three times before moving
  a document into the terminal-failure queue.
- Add a permanent ignored-document queue with optional reasons, explicit
  un-ignore and automatic rescan, plus Failed and Ignored badge counts in the
  sidebar.

### History and product quality

- Add a normal archive-specific custom prompt plus an Advanced system-prompt
  editor. Immutable prompt-injection, minimal-tagging and structured-output
  contracts remain enforced for every provider.
- Present duplicate cleanup as clear many-to-one groups such as
  `Invoices, Bills -> Invoice`, while preserving approval and the explicit
  move/delete phases for every source tag.
- Add a complete Activity detail view with metadata, color-coded before/after
  changes, custom fields, token usage, original state and event history.
- Add bulk rescan, exact restore, history validation and deliberate cleanup of
  records whose Paperless documents no longer exist.
- Add an in-product changelog at `/changelog` using the same green Tagvico
  design as the rest of the app.

## 3.1.0 - 2026-07-23

- Unified every user-facing workflow in the green Next.js shell, including the
  Review queue and Manual processing; legacy URLs now redirect into the task-
  oriented navigation.
- Reordered the product around Actions, Ask Tagvico, Automation, Review queue,
  Activity, and Settings, with Recovery and Manual processing nested under
  Automation.
- Added a Companion model picker that contains only configured, live-discovered
  provider models and defaults to the document-tagging model.
- Made Companion Paperless research visible through redacted tool-activity
  cards without exposing OCR text, secrets, raw tool arguments, or provider
  errors.
- Restored Paperless instance discovery and expanded typed Settings parity for
  metadata reuse, owner assignment, custom fields, trigger tags, existing-
  vocabulary limits, external enrichment, and MFA.
- Added review-first tag unification with per-merge approval and two explicit,
  idempotent move/delete phases.
- Bundled the versioned documentation into the production image at `/docs/`
  with `/documentation` as a local alias, and replaced the old Paperless AI
  favicon across the app, docs, and landing page.
- Added bounded fetch timeouts, independent partial loads, retryable page
  errors, route-level loading/error states, and focused regression coverage.

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
