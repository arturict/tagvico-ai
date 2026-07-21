# Feature showcase

## Action Center

Each Paperless document can have one Action Case with a title, summary,
priority, due date, assignee, and top-level state. A case may contain up to 100
of steps for compound work such as reviewing a renewal, comparing an offer,
replying, and storing the confirmation. Solo workspaces upgrade to family
households when another member is added.

Household members are managed assignment, permission, and Telegram profiles;
they are not separate Tagvico web accounts. The local admin remains the web
console owner in the v3 preview.

Tagvico mirrors its case ID, state, next due date, assignee, and
`tagvico/action` tag to Paperless. It preserves unrelated tags and custom
fields. The complete checklist and audit trail remain in Tagvico.

## Household Companion and approvals

The Companion can search and read permitted Paperless documents, list current
actions, and prepare new or changed Action Cases. The Tagvico harness owns the
session, narrow tool catalog, permissions, transcript, and approval records;
the selected model never receives shell or filesystem access.

Read tools run immediately. Write tools only create a durable proposal. An
owner or adult must approve it before the deterministic executor changes
Tagvico or Paperless. The web chat uses AI SDK v6 streams and AI Elements.

## Operations at a glance

The dashboard shows processing progress, runner state, Paperless vocabulary
counts, recent activity, and token/cost-efficiency signals. **Scan now** starts
an on-demand pass without waiting for the schedule.

## Controlled tagging

Choose whether the model may create open-ended tags or must stay within a
controlled vocabulary. Tag groups make a larger Paperless tag catalog easier
to manage, and a per-document maximum prevents noisy assignments.

![Controlled tagging groups with generic finance, legal, home, insurance, health, and work tags](/screenshots/controlled-tagging.png)

Generic category tags are shown in this capture. No document contents, names,
credentials, account identifiers, or private endpoints are visible.

## Review-first filing

In **Review first** mode, durable suggestions wait for approval. Inspect the
metadata diff, apply it, reject it, or leave it queued. Switching to Automatic
mode does not discard already queued suggestions.

In **Automatic** mode, Tagvico validates and writes enabled fields directly to
Paperless. Both modes support titles, tags, correspondents, document types,
dates, languages, custom fields, and optional owner assignment.

## History, restoration, and retry control

Every processing run records status and usage. History supports manual reruns,
rescan, and restoration from the first metadata snapshot captured before
Tagvico changed a document. Provider failures are retried, then moved to a
terminal state instead of looping forever.

## OCR rescue

Documents with insufficient OCR can enter a durable rescue queue. Configure
Mistral OCR, an OpenAI-compatible vision endpoint, or Ollama vision. Local PDF
OCR limits rendered pages with `OCR_MAX_PAGES`; interrupted work returns to the
pending queue after restart.

## Subscription-backed model access

The optional ChatGPT provider uses the official Codex SDK for inference and the
stable `codex login --device-auth` flow. Tagvico does not depend on the
experimental Codex app-server protocol or use Codex as its application
harness. GitHub Copilot continues to use the official Copilot SDK.

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

![Sanitized ChatGPT subscription model selector in Tagvico settings](/screenshots/chatgpt-models.png)

## Optional anonymous installation analytics

Installation analytics are off by default. Administrators can preview the
complete outbound heartbeat in Settings before opting in. Rotating daily and
monthly identifiers support active-installation counts without creating a
permanent installation profile; document content, metadata, URLs, identities,
keys, exact counts, and errors are never included. See [Privacy and
security](./privacy) for the complete field list and retention design.
