# Feature showcase

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

## Subscription-backed model discovery

The experimental ChatGPT provider uses the official Codex runtime and shows
the live model catalog returned for the signed-in account, including GPT-5.6
Luna when that account exposes it. GitHub Copilot uses
the official Copilot SDK and likewise limits choices to account-visible models.
Agent tools are denied for these document-extraction paths.

![Sanitized ChatGPT subscription model selector in Tagvico settings](/screenshots/chatgpt-models.png)

## Optional anonymous installation analytics

Installation analytics are off by default. Administrators can preview the
complete outbound heartbeat in Settings before opting in. Rotating daily and
monthly identifiers support active-installation counts without creating a
permanent installation profile; document content, metadata, URLs, identities,
keys, exact counts, and errors are never included. See [Privacy and
security](./privacy) for the complete field list and retention design.
