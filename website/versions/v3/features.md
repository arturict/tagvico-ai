# Feature showcase

## Action Center

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

![Tagvico v3.1.2 Action Center in the current green application shell](/screenshots/action-center-v3.png)

This v3.1.2 capture comes from the representative release installation and
contains no document or account data.

## Household Companion and approvals

The Companion can search and read permitted Paperless documents, list current
actions, and prepare new or changed Action Cases. The Tagvico harness owns the
session, narrow tool catalog, permissions, transcript, and approval records;
the selected model never receives shell or filesystem access.

Read tools run immediately. Write tools only create a durable proposal. An
owner or adult must approve it before the deterministic executor changes
Tagvico or Paperless. The web chat uses AI SDK v6 streams and AI Elements.
Paperless research is intent-aware: a greeting stays a normal conversation,
library totals use an exact count, and document content is read only when the
question requires it. Each research card can reveal the safe search term,
matching document IDs, titles, dates, and result count without exposing OCR.
Approvals appear only when a proposal is pending, and conversations can be
created, searched, renamed, switched, and deleted from the chat workspace.

![Tagvico v3.1.2 Ask Tagvico workspace with persistent conversations, approval boundary, composer and configured model](/screenshots/companion-v3.png)

The capture uses a generic greeting only. No document contents, private
identifiers, credentials, or provider payloads are visible.

## Operations at a glance

The dashboard shows processing progress, runner state, Paperless vocabulary
counts, recent activity, and token/cost-efficiency signals. **Scan now** starts
an on-demand pass without waiting for the schedule and reports how many
documents were eligible, applied, staged, skipped, or failed. Trigger tags are
optional: with no trigger tags, every new unprocessed document is eligible.

Actions, Ask Tagvico, Automation, Review queue, Activity, and Settings stay
inside one React application shell. Recovery and Manual processing are
purposeful Automation subpages rather than unexplained primary tabs. They share the same fixed,
collapsible navigation, Geist typography, green design tokens, responsive
tables, dialogs, loading states, and inline feedback. The former EJS interfaces
for user-facing workflows are no longer part of the visible application.

## Controlled tagging

Choose whether the model may create open-ended tags or must stay within a
controlled vocabulary. Tag groups make a larger Paperless tag catalog easier
to manage, and a per-document maximum prevents noisy assignments. Four is the
default hard ceiling in both modes. The shared provider prompt asks for the
smallest useful set and avoids repeating language, correspondent, or document
type as tags.

## Review-first tag unification

Tag library can load the current Paperless vocabulary and let one configured,
live-discovered model propose likely duplicates. Suggestions are grouped
visually as several source tags becoming one canonical target, while every
source remains independently reviewable. The model only plans and explains; it
cannot write to Paperless. Every proposed merge is approved or rejected
separately. Approved work runs as two explicit, idempotent phases: move
document references to the chosen target, verify the result, then delete the
now-unused source tag.

## Prompt control

The maintained general prompt works across providers. **Custom filing prompt**
adds archive-specific terminology and preferences without replacing Tagvico's
contracts. **Advanced system prompt** can replace the general role
instructions, while prompt-injection protection, minimal-tagging rules and the
structured response contract remain mandatory.

## Review-first filing

In **Review first** mode, durable suggestions wait for approval. Inspect the
metadata diff, apply it, reject it, or leave it queued. Switching to Automatic
mode does not discard already queued suggestions.

In **Automatic** mode, Tagvico validates and writes enabled fields directly to
Paperless. Both modes support titles, tags, correspondents, document types,
dates, languages, custom fields, and optional owner assignment.

## History, restoration, and retry control

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

## OCR rescue

Documents with insufficient OCR can enter a durable rescue queue. Configure
Mistral OCR, an OpenAI-compatible vision endpoint, or Ollama vision. Local PDF
OCR limits rendered pages with `OCR_MAX_PAGES`; interrupted work returns to the
pending queue after restart. OCR retries use the same bounded three-attempt
discipline as document classification and cannot block the main scan queue
forever.

## In-product changelog

**What’s new** in the sidebar opens the release notes bundled with the running
instance. The top **Next** entry documents improvements present in the current
build but not yet assigned to a release number; older released notes stay
available below it.

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

![Tagvico v3.1.2 AI model settings with the supported provider registry and write-only credential boundary](/screenshots/ai-models-v3.png)

This capture shows provider names and product copy only. No API key, account
identifier, private endpoint, or signed-in profile is exposed.

## Optional anonymous installation analytics

Installation analytics are off by default. Administrators can preview the
complete outbound heartbeat in Settings before opting in. Rotating daily and
monthly identifiers support active-installation counts without creating a
permanent installation profile; document content, metadata, URLs, identities,
keys, exact counts, and errors are never included. See [Privacy and
security](./privacy) for the complete field list and retention design.
