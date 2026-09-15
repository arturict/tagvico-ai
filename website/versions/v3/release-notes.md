# Release notes

## v3.4.1

Released 15 September 2026.

Tagvico 3.4.1 is a dependency-security patch for stable v3, with no
application code changes. `next` is updated from 16.2.11 to 16.3.3, the first
release fixing a critical unauthenticated remote code execution advisory
(GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4). Dependency overrides clear the
remaining high/critical audit findings: `fast-uri` to 3.1.6, `sharp` to
0.35.4, `js-yaml` pinned to 4.3.2, `qs` pinned to 6.16.0. `npm audit --omit=dev
--audit-level=high` reports zero findings again.

Upgrade by backing up `tagvico_ai_data`, pinning
`ghcr.io/arturict/tagvico-ai:3.4.1`, and recreating only the Tagvico
container. This release does not change the data schema.


## v3.4.0

Released 2 September 2026.

Tagvico 3.4.0 sharpens what Tagvico is for. Paperless-ngx v3 ships native AI
metadata suggestions, so Tagvico now leads with the layer Paperless does not
build: Action Cases, households, the approval boundary, and the family bots.
Reviewable AI metadata filing remains fully supported as an opt-in included
utility, and the documentation explains how to coexist with native Paperless
AI — never two automatic writers on the same fields. As part of this focus,
OCR rescue, the ChatGPT-subscription (Codex) adapter, the GitHub Copilot
adapter, and OpenAI Flex/Batch modes enter maintenance mode for the rest of
v3: they keep working and receive bug fixes, but are candidates for removal
in v4.

Every Paperless request now pins REST API version 9. Paperless-ngx 2.16
through 2.20 already default to it, but Paperless-ngx 3.x defaults to
version 10 with a redesigned task list, so the pin keeps Tagvico's behavior
identical on both lines. The supported minimum is Paperless-ngx 2.16.0, and
setup says so plainly when an older instance answers.

Both bots become proactive and hardened. Users linked to the Action Center
receive DM reminders for household actions that are overdue or due within
three days — assigned cases go to the assignee, unassigned cases to every
linked member, at most one message per case, user, and day
(`TELEGRAM_ACTION_REMINDERS` / `DISCORD_ACTION_REMINDERS`, default on).
Every path that reaches the AI provider or moves document bytes is now
per-user flood-limited, untrusted document titles are escaped before entering
the model prompt, Telegram transport errors are scrubbed of the bot token
before logging, and Discord document buttons are capped at the API maximum.

Upgrade by backing up `tagvico_ai_data`, pinning
`ghcr.io/arturict/tagvico-ai:3.4.0`, and recreating only the Tagvico
container. This release does not change the data schema.


## v3.3.0

Released 27 August 2026.

Tagvico 3.3.0 adds an optional Discord companion bot with full Telegram
parity. Allowlisted users can ask bounded document questions with cited
originals, upload one attachment at a time into Paperless, list active
actions, and approve or reject proposed actions from Discord. Each user is
configured with their own Paperless token, so Paperless remains the permission
authority. The bot answers direct messages and, optionally, one home channel
where only slash commands, mentions, and replies to the bot are processed —
no privileged Message Content intent is required. Conversation history stays
in process memory, bounded per user and channel. The bot is off unless its
environment variables are set.

First-run setup gains **Scan for Paperless**: the wizard can search the
attached networks for a running Paperless-ngx installation and fill the Base
URL field, instead of requiring the URL up front. Discovery now derives its
scan ranges from the machine's own network interfaces, so a Tagvico container
finds a Paperless container on the same Docker bridge network.

The public landing page now uses self-hosted, cookie-free analytics. The
application, bundled docs, and installed containers remain telemetry-free
apart from the existing opt-in aggregate reporting.

Upgrade by backing up `tagvico_ai_data`, pinning
`ghcr.io/arturict/tagvico-ai:3.3.0`, and recreating only the Tagvico
container. This release does not change the data schema.

## v3.2.6

Released 30 July 2026.

Tagvico 3.2.6 hardens the way a new installation is exposed before its owner
exists. The bundled development Compose stack now binds Paperless and Tagvico
to loopback and keeps remote setup disabled unless the operator explicitly
chooses LAN access. The Unraid template uses the same locked-down setup default
and now pins the current stable image instead of an obsolete v2 alpha.

The installation guide separates local setup from trusted-LAN setup. A remote
NAS install must deliberately bind Tagvico to the LAN and enable remote setup
only until the owner account has been created. Normal signed-in LAN access can
remain enabled without leaving the setup endpoint open.

The first-party aggregate telemetry receiver is now deployed on its documented
Cloudflare custom domain with D1 retention, rate limits, and public suppression
for fewer than five opted-in installations. Server-side monitoring may read
the public summary without an Origin header; foreign browser origins remain
rejected.

Upgrade by backing up `tagvico_ai_data`, pinning
`ghcr.io/arturict/tagvico-ai:3.2.6`, and recreating only the Tagvico container.
This patch does not change the data schema.

## v3.2.5

Released 29 July 2026.

Tagvico 3.2.5 turns the first run into a verified path instead of a sequence of
blind saves. Guided setup checks Paperless access, authenticates the selected
provider, loads its live model catalog, and verifies the exact model before
creating the owner. Built-in endpoints are prefilled and authenticated Ollama
endpoints work without mixing local and cloud credentials.
Docker- and host-injected connection values are verified as the effective
runtime configuration. Public model discovery also limits response bytes,
catalog entries, time, and concurrency.

Non-secret setup progress can resume in the same tab after an interruption.
Paperless tokens, passwords, provider keys, and account credentials are never
stored in that browser draft. New installations start in Review first mode
with scheduled scans paused, then continue directly to Ask Tagvico. Enabling a
schedule later in Settings takes effect without restarting the container.
Abandoned ChatGPT device sign-ins expire server-side and release their Codex
process before a rate-limited later attempt can start cleanly. Paperless
permission checks run concurrently, and verified setup is persisted once so a
slow but valid connection remains within the completion deadline.

Ask Tagvico source titles now link to the permitted Paperless-backed document
view. Authentication, rate-limit, and transient Paperless failures remain
retryable instead of appearing as missing documents. Setup, Documents, Ask
Tagvico, Activity, and Settings also have clearer loading, empty, retry, and
narrow-screen states.

The landing page now separates aggregate request totals from explicitly opted-in
installation reports. The first-party design uses no cookies, fingerprints,
referrers, stored IP addresses, or permanent installation identifiers. It
respects Global Privacy Control and Do Not Track and suppresses small
installation totals.

Release acceptance covers setup, synthetic document upload, search, cited
answers, tag changes, approval-first actions, cleanup, and recovery against an
isolated real Paperless-ngx 2.20.15 container.

Upgrade by backing up `tagvico_ai_data`, pinning
`ghcr.io/arturict/tagvico-ai:3.2.5`, and recreating only the Tagvico container.
This is a v3 patch with no data migration.

## v3.2.0

Released 26 July 2026.

Tagvico 3.2 replaces the previous dark application and marketing surfaces with
one light **Paper & Pine** interface. The main navigation now follows concrete
jobs: Home, Documents, Ask Tagvico, Organize tags, Activity, and Settings.

Ask Tagvico is now a three-column research workspace. Conversations remain on
the left, the answer and configured-model composer stay in the centre, and a
live research trail shows every safe Paperless search, document read, source
count, and pending approval on the right.

Read tools can inspect documents and tags immediately. Document and tag
creates, edits and deletions remain inert until an owner or adult approves the
durable proposal. The configured-model picker is grouped by collapsible
provider and exposes model-specific reasoning levels.

Content requests such as read, inspect, open, and review now read the bounded
Paperless matches. GitHub Copilot receives the saved reasoning level, accidental
substring matches no longer start research, and conversations remain reachable
from a dedicated drawer on narrow screens.

Duplicate-tag cleanup has its own review workspace. Analysis is read-only, each
many-to-one mapping shows its document impact, and moving references remains a
separate operation from deleting the unused source.

Document chips, provider controls and model metadata now meet the light
interface's contrast targets. Home, Documents, Activity and live model catalogs
show their actual structure as skeletons while data is loading.

Upgrade by backing up `tagvico_ai_data`, pinning
`ghcr.io/arturict/tagvico-ai:3.2.0`, and recreating only the Tagvico container.
This remains a v3 upgrade. There is no v4 migration and no parallel beta-theme
preference.

## v3.1.2

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
