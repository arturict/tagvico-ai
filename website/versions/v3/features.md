# Feature showcase

## Home and action workflows

Each Paperless document can have one Action Case with a title, summary,
priority, due date, assignee, and top-level state. A case may contain up to 100
steps for compound work such as reviewing a renewal, comparing an offer,
replying, and storing the confirmation. Solo workspaces upgrade to family
households when another member is added.

Household members are managed profiles for assignment, permissions, and Telegram;
they are not separate Tagvico web accounts. The local admin remains the web
console owner in v3.

Tagvico mirrors its case ID, state, next due date, assignee, and
`tagvico/action` tag to Paperless. It preserves unrelated tags and custom
fields. The complete checklist and audit trail remain in Tagvico.

![Tagvico v3.2 Home dashboard in the Paper and Pine application shell](/screenshots/home-paper-pine-v3.png)

This v3.2 capture comes from the representative release installation. It uses
generic document metadata and synthetic workspace labels. It exposes no
document contents, real account identifiers, credentials, or private endpoints.

## Household Companion and approvals

The Companion can count, search and read permitted Paperless documents, list
and inspect tags, list current actions, and prepare document, tag or Action
Case changes. The Tagvico harness owns the
session, narrow tool catalog, permissions, transcript, and approval records;
the selected model never receives shell or filesystem access.

Read tools run immediately. Write tools only create a durable proposal. An
owner or adult must approve it before the deterministic executor changes
Tagvico or Paperless. This includes creating, renaming, recoloring and deleting
tags as well as changing document metadata. The web chat uses AI SDK v6 streams and AI Elements.
Paperless research is intent-aware: a greeting stays a normal conversation,
library totals, including `doc://countdocuments`, use an exact count, and
document content is read only when the question requires it. Internal tool
markers are never shown as document citations. Each research card can reveal the safe search term,
matching document IDs, titles, dates, and result count without exposing OCR.
Matching source titles link directly to their Paperless-backed document view,
so the answer can be checked against the permitted original without repeating
the search.
The right-hand research trail remains visible while tools run and groups safe
research evidence with any pending approvals. Conversations can be created,
searched, renamed, switched, and deleted from the chat workspace.
The composer model picker groups live models inside collapsible configured
providers, shows each provider identity, and offers only the reasoning efforts
advertised by the selected model.

![Tagvico v3.2 Ask Tagvico workspace with persistent conversations, approval boundary, composer, configured model and visible research trail](/screenshots/companion-paper-pine-v3.png)

The capture uses generic count queries and synthetic workspace labels to show
the research trail. No document contents, real account identifiers,
credentials, or provider payloads are visible.

## Operations at a glance

The dashboard shows processing progress, runner state, Paperless vocabulary
counts, recent activity, and token/cost-efficiency signals. **Scan now** starts
an on-demand pass without waiting for the schedule and reports how many
documents were eligible, applied, staged, skipped, or failed. Trigger tags are
optional: with no trigger tags, every new unprocessed document is eligible.

Home, Documents, Ask Tagvico, Organize tags, Activity, and Settings stay
inside one React application shell. Recovery, Manual processing, the Action
Center, and the conditional Review queue remain available from the workflows
that need them instead of competing as unexplained primary tabs. They share the same fixed,
collapsible navigation, Paper & Pine design tokens, responsive
tables, dialogs, high-contrast tags and controls, and inline feedback.
Page-shaped skeletons preserve the expected Home, Documents and Activity
layout while their live data is loading. Provider and model catalogs use the
same pattern instead of replacing the interface with loading text. The former EJS interfaces
for user-facing workflows are no longer part of the visible application.

## Review-first tag unification

The dedicated **Organize tags** workspace loads the current Paperless vocabulary and lets one configured,
live-discovered model propose likely duplicates. Suggestions are grouped
visually as several source tags becoming one canonical target, while every
source remains independently reviewable. The model only plans and explains; it
cannot write to Paperless. Every proposed merge is approved or rejected
separately. Approved work runs as two explicit, idempotent phases: move
document references to the chosen target, verify the result, then delete the
now-unused source tag.

![Tagvico v3.2 Organize tags workspace showing several source tags becoming one canonical target](/screenshots/tags-paper-pine-v3.png)

The representative capture uses generic duplicate tags and synthetic workspace
labels. It contains no document content, real account identifiers, credentials,
or endpoints.

## Included utility: reviewable metadata filing

AI metadata filing is an opt-in utility, not the core of Tagvico. New
installations start with scheduled scans paused and writes in **Review
first**; nothing is tagged until you deliberately enable it.

Paperless-ngx v3 ships native AI metadata suggestions with its own workflow
action. Choose one writer: if Paperless AI applies metadata automatically,
leave Tagvico's filing off or in Review first. Tagvico's utility remains the
right choice when you want a durable review queue, restore snapshots,
per-field control, provider choice with cost modes, or you run
Paperless-ngx 2.x. Never let both write the same fields automatically.

### Controlled tagging

Choose whether the model may create open-ended tags or must stay within a
controlled vocabulary. Tag groups make a larger Paperless tag catalog easier
to manage, and a per-document maximum prevents noisy assignments. Four is the
default hard ceiling in both modes. The shared provider prompt asks for the
smallest useful set and avoids repeating language, correspondent, or document
type as tags.

### Prompt control

The maintained general prompt works across providers. **Custom filing prompt**
adds archive-specific terminology and preferences without replacing Tagvico's
contracts. **Advanced system prompt** can replace the general role
instructions, while prompt-injection protection, minimal-tagging rules and the
structured response contract remain mandatory.

### Review-first filing

In **Review first** mode, durable suggestions wait for approval. Inspect the
metadata diff, apply it, reject it, or leave it queued. Switching to Automatic
mode does not discard already queued suggestions.

In **Automatic** mode, Tagvico validates and writes enabled fields directly to
Paperless. Both modes support titles, tags, correspondents, document types,
dates, languages, custom fields, and optional owner assignment.

### History, restoration, and retry control

Every processing run records assigned metadata, field-level before/after
changes, custom fields, token usage, event source, and the original snapshot.
Single and bulk rescans use the current provider settings and deliberately
bypass the normal trigger-tag filter. Rescanning never deletes the audit trail
or the first restore snapshot.

**Restore original** replaces title, tags, correspondent, document type, date,
language, custom fields, and owner with the first state Tagvico captured. Use
**Validate history** to preview records whose Paperless documents no longer
exist, then clean up only those orphaned local records.

AI and OCR provider failures are attempted up to three times before moving into
**Permanently failed**. Resetting a failed document makes it eligible again.
Documents that must never be processed can instead be moved to the permanent
**Ignored documents** list with an optional reason. Un-ignoring one explicitly
queues a filter-bypassing rescan. Failed and Ignored counts remain visible in
the sidebar.

### OCR rescue

Documents with insufficient OCR can enter a durable rescue queue. Configure
Mistral OCR, an OpenAI-compatible vision endpoint, or Ollama vision. Local PDF
OCR limits rendered pages with `OCR_MAX_PAGES`; interrupted work returns to the
pending queue after restart. OCR retries use the same bounded three-attempt
discipline as document classification and cannot block the main scan queue
forever.

## In-product changelog

**What’s new** in the sidebar opens the release notes bundled with the running
instance. The top entry is the released v3.4.1 changelog, followed by v3.4.0, v3.3.0, v3.2.6, v3.2.5,
v3.2.0 and the complete v3.1 history. An entry stays marked as unreleased until its
image and tag are actually published.

## Subscription-backed model access

The optional ChatGPT provider uses the bundled official Codex runtime for
inference and the stable `codex login --device-auth` flow. Its model picker is
fed by the signed-in account's live `model/list` response, including the
runtime default and each model's supported reasoning efforts. Curated names are
never presented as account availability. GitHub Copilot continues to use the
official Copilot SDK.

## Unified setup and settings

Setup and authenticated Settings now use the same React field, provider, and
validation components. Settings are divided into Paperless, AI models,
Automation, Tag library, Household, Security & privacy, and Diagnostics. The desktop navigation
is fixed and collapsible; narrow screens use horizontal, scrollable navigation
without a second legacy UI.

Provider configuration is generated from the central provider registry. The
model picker supports runtime discovery, search, provider grouping, local
favorites, capability badges, and keyboard-native controls.

New installations verify Paperless access and the selected runtime before
saving configuration. Built-in endpoints are prefilled, models come from the
runtime's live catalog, and the final summary makes the safe starting state
explicit: review-first writes and paused scheduled scans. Non-secret progress
can resume within the same tab without persisting tokens or passwords.

![Tagvico v3.2 AI model settings with the provider registry and write-only credential boundary](/screenshots/ai-models-paper-pine-v3.png)

This capture shows provider names and product copy only. No API key, account
identifier, private endpoint, or signed-in profile is exposed.

The Ask Tagvico composer uses the same runtime catalog, but includes only
configured providers whose live discovery succeeded. It defaults to the
document-automation model and persists a validated per-session override.
Redacted activity cards make Paperless search, document reading, action lookup,
proposal preparation, and tool errors visible without exposing OCR, tokens, or
raw provider payloads.

## Optional Telegram family interface

An opt-in long-polling bot lets allowlisted people search the archive in natural
language, ask follow-up questions, download cited originals, and send a PDF or
photo into Paperless. Each Telegram ID maps to its own Paperless API token;
unknown users and group chats are ignored, and Paperless enforces every search,
download, upload, and metadata permission.

Conversation history for the legacy cited-search flow is bounded and held in memory only. `/clear` removes one
person's history, and a restart removes all histories. Uploads wait for the
Paperless consumption task, link the existing document when Paperless reports a
duplicate, and can optionally run Tagvico metadata classification. Automatic
metadata for bot uploads is a separate explicit opt-in because it bypasses the
web review queue.

When a Telegram allowlist entry also contains its Tagvico `householdId` and
`memberId`, `/actions` lists open cases and explicit action requests can create
approve/reject cards. Approval uses the same executor and audit trail as web.
Action Center linking is accepted only when the Telegram entry points at the
same Paperless instance as the main Tagvico configuration.

## Optional Discord family interface

An opt-in Discord companion bot extends the same capabilities as the Telegram
interface to Discord users. Allowlisted users search the archive in natural
language, ask follow-up questions, download cited originals, and send a PDF or
attachment into Paperless. Each Discord snowflake maps to its own Paperless API
token; unknown users, bots, webhooks, and other channels are silently ignored.

In direct messages all content is processed. In the optional home channel
(`DISCORD_HOME_CHANNEL_ID`), only native slash commands, bot @-mentions, or
replies to the bot that keep the bot mention enabled are processed. Unaddressed messages are ignored so no
privileged Message Content intent is required.

Document download and approval buttons are bound to the originating Discord
user ID. Foreign or replayed interactions are rejected privately. Home-channel
document downloads are delivered as ephemeral messages visible only to the
requesting user.

File uploads validate HTTPS Discord CDN URLs, sanitized filenames, exactly one
attachment, and size before and during download. Default and hard maximum is
10 MiB. Automatic metadata classification for Discord uploads is a separate
explicit opt-in (`DISCORD_UPLOAD_AUTOMATIC_METADATA=yes`) that bypasses the web
review queue, identical in intent to the Telegram equivalent.

When a Discord allowlist entry also contains `householdId` and `memberId`,
`/actions` lists open cases and explicit action requests can create approve/reject
buttons. Approval uses the same executor and audit trail as web and Telegram.

Native slash commands: `/start`, `/clear`, `/actions`, `/privacy`.

## Optional anonymous installation analytics

Installation analytics are off by default. Administrators can preview the
complete outbound heartbeat in Settings before opting in. Rotating daily and
monthly identifiers support active-installation counts without creating a
permanent installation profile; document content, metadata, URLs, identities,
keys, exact counts, and errors are never included. See [Privacy and
security](./privacy) for the complete field list and retention design.
