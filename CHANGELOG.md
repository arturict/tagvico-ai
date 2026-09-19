# Changelog

## 3.5.0 - Unreleased

### TypeSafe Jev provider

- New provider `typesafe` for [TypeSafe's Jev](https://docs.typesafe.ai), a
  decision model that answers typed questions with probabilities instead of
  generating text. Tagvico uses it for closed-list filing: one yes/no question
  per existing tag, a choice among the existing correspondents and document
  types, the title chosen from the first lines of the document and the date
  chosen from the dates found in the text. It never creates a new tag,
  correspondent or document type.
- The probability of each chosen option is the field confidence, so the
  existing review threshold and "held for review" behaviour apply unchanged.
  `TYPESAFE_TAG_THRESHOLD` (default `0.6`) sets the probability from which a
  tag is suggested.
- Not supported with this provider, by design: new vocabulary, custom field
  values, owner suggestions, the custom and system prompt, external API
  enrichment, thumbnails, and the Companion and family bots. Keep a
  text-generating provider configured for the Companion.
- `scripts/jev-eval.mjs` reproduces the synthetic test documented in
  `docs/providers/typesafe.md` (14 documents: correspondent, title, date and
  language 14/14, document type 12/14, tags precision 0.80 at recall 0.82,
  about 300 ms and about USD 0.08 per 1,000 documents).

## 3.4.1 - 2026-09-15

### Security

- `next`: `16.2.11` -> `16.3.3`, the first release patching a critical
  unauthenticated remote code execution advisory (GHSA-p293-qw3h-jr36,
  GHSA-2xp9-vwfh-vxw4).
- Dependency overrides for advisories reported by `npm audit
  --omit=dev --audit-level=high`: `fast-uri` `3.1.5` -> `3.1.6`
  (GHSA-5jgf-p345-68v8 and three related host-confusion/SSRF advisories),
  `sharp` `0.35.3` -> `0.35.4` (GHSA-rgj7-g3m4-5g8c, libheif), `js-yaml`
  pinned to `4.3.2` (GHSA-2883-xcg3-v3hh, transitive through
  `swagger-jsdoc`), `qs` pinned to `6.16.0` (GHSA-x5fp-wj9c-mxmx,
  GHSA-4mjr-xmp4-gh2g, transitive through `body-parser`, which has no
  patched `1.x` release).
- `npm audit --omit=dev --audit-level=high` reports zero findings again; this
  is a dependency-only patch with no application code changes.

### Documentation

- Contributor and agent operating instructions (`AGENTS.md`) were tuned so
  an explicitly selected agent implements and verifies directly instead of
  being diverted to a different one; no application behavior changed.

### Upgrade note

- Back up `tagvico_ai_data`, pull the pinned `3.4.1` image, and recreate only
  the Tagvico container. This release does not change the data schema.

## 3.4.0 - 2026-09-02

### Product direction and v4 preparation

- Tagvico's positioning now leads with the Action Center and Household
  Companion. AI metadata filing remains fully supported but is presented as an
  included, opt-in utility, and the documentation explains how to coexist with
  Paperless-ngx v3's native AI suggestions (never two automatic writers on the
  same fields).
- The following features enter **maintenance mode** for the remainder of v3:
  OCR rescue, the ChatGPT-subscription (Codex) adapter, the GitHub Copilot
  adapter, and OpenAI Flex/Batch processing modes. They keep working and keep
  receiving bug fixes, but no new capabilities, and they are candidates for
  removal in v4. See `docs/v4-plan.md` for the rationale and migration paths.

### Paperless-ngx compatibility

- Every Paperless request now sends `Accept: application/json; version=9`
  instead of following the server default. Paperless-ngx 2.16 through 2.20
  default to version 9, but Paperless-ngx 3.x defaults to version 10, which
  paginates the task list, renames task fields, and deprecates the `all`
  parameter; pinning keeps document, task, and custom-field payloads
  identical on both lines. The supported minimum is now Paperless-ngx
  2.16.0, and setup reports a 406 from an older instance in plain words.
- The deprecated `created_date` field is no longer requested during scans.
- The Discord bot uses `MessageFlags.Ephemeral` instead of the deprecated
  `ephemeral` interaction option, removing runtime deprecation warnings on
  discord.js 14.27.
- Dependency audit is clean again (`browserslist` advisory resolved).

### Proactive action reminders (Telegram and Discord)

- Bot users linked to the Action Center now receive proactive DM reminders
  for household actions that are overdue or due within the next three days.
  Assigned cases go only to the assignee; unassigned cases go to every linked
  household member. At most one message per case, user, and day; checks run
  every 30 minutes in-process. Disable with `TELEGRAM_ACTION_REMINDERS=no` /
  `DISCORD_ACTION_REMINDERS=no`.

### Bot hardening (Telegram and Discord)

- Per-user flood control on every path that reaches the AI provider or moves
  document bytes: 10 questions per minute, 6 uploads per 10 minutes, and 12
  document downloads per minute per allowlisted user. Excess requests get a
  polite retry-after reply instead of running up provider costs.
- Untrusted document titles and dates are now escaped before being embedded
  in the model prompt context, so a crafted title can no longer forge document
  boundaries in the research prompt.
- Telegram transport errors are scrubbed of the bot token before logging.
- Telegram approval buttons now report "no longer pending" gracefully instead
  of a generic failure when a proposal was already decided (Discord parity).
- Discord document buttons are hard-capped at 25 (five rows of five), so an
  oversized `DISCORD_MAX_DOCUMENTS` can no longer produce a message the
  Discord API rejects.

### Upgrade note

- Back up `tagvico_ai_data`, pull the pinned `3.4.0` image, and recreate only
  the Tagvico container. This release does not change the data schema.
  Paperless-ngx 2.16.0 or newer is required from this release on. Linked bot
  users receive proactive action reminders unless
  `TELEGRAM_ACTION_REMINDERS=no` / `DISCORD_ACTION_REMINDERS=no` is set.


## 3.3.0 - 2026-08-27

### Discord companion bot

- Add an optional Discord companion bot with full Telegram parity: bounded
  document Q&A with follow-ups, cited originals, one attachment upload with
  Paperless consumption and duplicate behavior, optional metadata classification,
  active action listing, action proposals, and approve/reject buttons.
- Allowlist is JSON (`DISCORD_USERS_JSON`) with one entry per user:
  `discordId` (snowflake), `paperlessToken`, optional `paperlessUrl`,
  optional `householdId` / `memberId`. Each user gets a separate Paperless
  token, so Paperless remains the permission authority.
- DM channel: all allowlisted-user messages are processed.
- Optional home channel (`DISCORD_HOME_CHANNEL_ID`): only native slash
  commands, bot @-mentions, or replies to the bot that keep the mention enabled
  are processed; unaddressed
  messages are ignored so no privileged Message Content intent is required.
- Bots, webhooks, unknown users, and other channels are silently ignored.
- Conversation history is isolated by Discord user and channel, bounded by
  `DISCORD_HISTORY_TURNS` (default 6), and kept only in process memory.
- Native slash commands: `/start`, `/clear`, `/actions`, `/privacy`.
- Document download and approval buttons encode the requesting Discord user ID.
  Foreign or replayed interactions are rejected without action. Home-channel
  document downloads are ephemeral.
- Attachment uploads validate HTTPS Discord CDN URLs, sanitized filenames,
  exactly one attachment, and file size before and during download.
  Default and hard maximum: 10 MiB (`DISCORD_MAX_FILE_BYTES`).
- Automatic AI metadata for Discord uploads is a separate explicit opt-in
  (`DISCORD_UPLOAD_AUTOMATIC_METADATA=no` default), identical to Telegram.
- Discord failure never terminates the web server; the bot starts cleanly and
  is stopped gracefully alongside Telegram on shutdown.
- Shared companion business logic (search planning, Q&A, action targeting,
  classification, parsing, and text chunking) extracted into
  `services/companionBotInternals.ts`; all Telegram env names,
  behavior, exports, and tests are preserved without change.
- New Compose / env pass-through for all nine Discord variables.
- New focused test suite (`tests/discord-bot.test.js`) covering parser,
  snowflakes, allowlist, routing, mentions, history isolation, chunking,
  attachments, CDN validation, size limits, duplicate behavior, slash commands,
  requester-bound buttons, replay rejection, and Telegram compatibility.

### Paperless discovery in first-run setup

- Add the "Scan for Paperless" control to the setup wizard, so a fresh
  installation can find its Paperless-ngx instance without knowing the URL up
  front. The wizard uses the backend endpoint that is already open during
  onboarding and offers "Use this URL" to fill the Base URL field. Settings
  keeps the authenticated route and the read-only badge.
- Derive the discovery sweep from this machine's own IPv4 interfaces instead
  of a hardcoded `192.168.1.0/24`, so a Tagvico container finds a Paperless
  container on a `172.x` Docker bridge. A `/16` bridge is narrowed to the
  `/24` holding our address, and `192.168.1.0/24` is kept for the
  bridged-container-to-host-LAN case.

### Landing analytics

- Add self-hosted, cookie-free Umami analytics to the public landing page
  only. The application, docs, and legacy docs landing remain telemetry-free;
  a stray tracker on the legacy docs landing was removed in the same series.

### Upgrade note

- Back up `tagvico_ai_data`, pull the pinned `3.3.0` image, and recreate only
  the Tagvico container. This release does not change the data schema. The
  Discord companion bot stays off unless its environment variables are set.

## 3.2.6 - 2026-07-30

### Safer deployment defaults

- Bind the bundled local Paperless and Tagvico ports to loopback unless the
  operator explicitly selects a LAN bind address.
- Keep remote first-run setup disabled by default in Compose and the Unraid
  template. Remote NAS setup now requires a temporary, documented opt-in.
- Update the Unraid template from the obsolete v2 alpha image to the immutable
  v3.2.6 release.

### Operational metrics

- Deploy the privacy-preserving telemetry receiver on its Cloudflare custom
  domain with the documented D1 schema, rate limits, retention job, and
  small-count suppression.
- Allow server-side monitoring to read the public aggregate summary without an
  Origin header while continuing to reject foreign browser origins.

### Upgrade note

- Back up `tagvico_ai_data`, pull the pinned `3.2.6` image, and recreate only
  the Tagvico container. This patch does not change the data schema.

## 3.2.5 - 2026-07-29

### Safer first run

- Replace blind setup saves with live Paperless permission checks, provider
  authentication, model discovery, and exact selected-model verification.
- Prefill built-in endpoints, support authenticated Ollama installations, and
  keep local and cloud Ollama credentials separate at validation and runtime.
- Validate Docker- and host-injected connection values as the effective runtime
  configuration, even when a stale browser value is submitted.
- Watch the scan configuration before first-run setup completes, so enabling a
  schedule later in Settings takes effect without restarting the container.
- Expire abandoned ChatGPT device sign-ins server-side, terminate their Codex
  process before allowing another challenge, and rate-limit new login processes.
- Let non-secret setup progress resume in the same browser tab while keeping
  API tokens, passwords, provider keys, and account credentials out of the
  browser draft.
- Start new installations in Review first mode with scheduled scans paused, and
  take a successful setup directly to Ask Tagvico for the first useful question.
- Bound provider probe time, response bytes, catalog entries, concurrency,
  account sign-in, setup admission, and pending work so one failed or hostile
  endpoint cannot block later setup attempts.
- Check Paperless permissions concurrently and persist the already verified
  setup once, keeping the browser and backend on one completion deadline.

### Documents, answers, and recovery

- Link safe Ask Tagvico sources to their Paperless-backed document views so an
  answer can be checked against the permitted original.
- Preserve authentication, rate-limit, and transient Paperless failures as
  retryable errors instead of misreporting valid sources as missing documents.
- Keep source inspection, global rescans, manual processing, owner recovery,
  and provider changes consistent after interruptions or stale browser requests.
- Improve loading, empty, retry, and narrow-screen states across setup,
  Documents, Ask Tagvico, Activity, and Settings.

### Privacy and release confidence

- Add separate first-party aggregate counters for landing requests and opted-in
  installation reports without cookies, fingerprinting, referrers, stored IP
  addresses, or permanent installation identifiers.
- Respect Global Privacy Control and Do Not Track on the landing page, suppress
  small installation totals, and document the Swiss and EU assessment without
  presenting unauthenticated reports as verified people.
- Exercise setup, document search, cited answers, tag changes, approval-first
  actions, cleanup, and recovery against an isolated real Paperless-ngx 2.20.15
  container with synthetic documents.

### Upgrade note

- Back up `tagvico_ai_data`, pull the pinned `3.2.5` image and recreate the
  Tagvico container. This is a v3 patch with no data migration.

## 3.2.0 - 2026-07-26

### Paper & Pine interface

- Replace the previous dark console styling with one light, coherent Tagvico
  design across the application and public landing page: warm paper surfaces,
  pine navigation, restrained lime accents, calmer borders, editorial
  typography and responsive layouts.
- Remove the planned beta-theme toggle. The new interface is the product
  interface, so there is no second visual system to maintain or accidentally
  expose.
- Rework the persistent, collapsible sidebar around recognizable user jobs:
  Home, Documents, Ask Tagvico, Organize tags, Activity and Settings.
- Raise contrast across document tags, provider navigation, capability badges,
  model rows, inputs and secondary text while keeping lime as the active
  control accent.
- Replace generic loading copy with structure-preserving skeletons on Home,
  Documents, Activity, provider catalogs and tag-organization model discovery.
- Make Home the configured-install entry point and reframe the automation
  dashboard around processing coverage, current work, remaining documents and
  recovery actions.
- Add a dedicated Documents entry point for searching processed documents,
  opening their Paperless originals and using the existing rescan/restore
  workflow.

### Ask Tagvico

- Turn Companion into a deliberate three-column research workspace:
  conversations on the left, the answer and model-aware composer in the centre,
  and a visible research trail on the right.
- Keep Paperless searches, document reads, result counts and safe source
  metadata visible while an answer is generated instead of hiding them behind
  an unexplained loading state.
- Keep pending writes beside the research trail, with the existing exact
  approve/reject boundary and read-only default.
- Show every proposed document field value inside its approval card, not only
  the names of the fields that would change.
- Let read tools count, search and read documents as well as list and inspect
  Paperless tags without an approval interruption. Document and tag creates,
  updates and deletions always become durable approval cards first.
- Revalidate a tag's name and linked-document count immediately before an
  approved deletion, and stop when the impact changed after approval.
- Group the live model picker by collapsible configured provider, show provider
  icons, and expose only the reasoning efforts supported by the selected model.
- Keep the selected reasoning effort in sync with the server response and bound
  the complete Ollama capability-discovery pass to one ten-second deadline.
- Apply the selected reasoning effort to GitHub Copilot requests as well as the
  other reasoning-capable runtimes.
- Treat search, read, open, inspect and review requests as real document-content
  intents while keeping unrelated words that merely contain `tagvico` or
  `actionable` from triggering Paperless research.
- Accept explicit shortcuts such as `doc://countdocuments` and prevent internal
  non-document citation markers from leaking into answers.
- Strip conversational sentence punctuation from explicit tag-creation names
  before presenting the approval.
- Preserve durable new-chat, search, rename, guarded delete, stop, retry, copy
  and configured-provider model selection behavior in the redesigned shell.
- Keep conversations and the research inspector reachable on narrow screens
  through an explicit mobile drawer instead of collapsing the chat itself.

### Tag organization and Settings

- Move duplicate-tag cleanup out of a crowded Settings row into a dedicated
  Organize tags workspace.
- Explain the full safety sequence before analysis: inspect the current
  vocabulary, review each many-to-one mapping, move affected documents, then
  separately delete the unused source tag.
- Show the configured provider, live model and model-specific thinking effort
  directly beside the analysis controls.
- Keep Settings focused on configuration while linking to operational cleanup
  work, with clearer section hierarchy, buffered inputs and consistent inline
  status surfaces.
- Hide the owner-only Organize tags workspace from adult and viewer navigation
  instead of sending those roles to an API they cannot use.

### Landing page and documentation

- Rebuild the public landing page in the same Paper & Pine system as the
  product, with a precise product illustration, workflow overview, inspectable
  Companion, provider choice, tag-cleanup safety, privacy model, FAQ and pinned
  Docker installation.
- Update public installation examples to the immutable
  `ghcr.io/arturict/tagvico-ai:3.2.0` image.
- Keep this release inside the v3 documentation line. Existing v2 and earlier
  guides remain versioned rather than being rewritten to match the new UI.

### Upgrade note

- Back up `tagvico_ai_data`, pull the pinned `3.2.0` image and recreate the
  Tagvico container. No v4 migration or parallel beta preference is involved.
- Review the renamed navigation once after upgrading. Existing history,
  conversations, provider credentials, models, automation rules and recovery
  queues remain in the current persistent data volume.

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
