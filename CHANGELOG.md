# Changelog

## 1.4.0 - 2026-07-06

- Completed the strict TypeScript migration across services, routes, configuration, models, and the server; new `@ts-nocheck` suppressions are rejected by the type-debt guard.
- Finished the Tagvico AI rebranding across shipped code, container configuration, documentation, and user-facing views.
- Added canonical `TAGVICO_AI_PORT`, `TAGVICO_AI_HOST_PORT`, `TAGVICO_AI_VERSION`, and `TAGVICO_AI_INITIAL_SETUP` environment variables.
- **Deprecation:** Existing `ARCHIVISTA_*` variables remain supported as warning-emitting fallbacks for compatibility and will be removed in 2.0. Deployments should migrate to `TAGVICO_*` variables now.

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
