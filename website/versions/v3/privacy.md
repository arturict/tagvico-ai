# Privacy and security

Tagvico reads OCR text and metadata from Paperless-ngx. A local Ollama or
compatible endpoint can keep that processing on infrastructure you control.
When you select a hosted provider, the document content required for
classification is sent to that provider under its terms.

## Deployment boundaries

- Provider secrets are stored in `data/.env` and are not written to the
  processing database.
- Settings APIs return only `configured: true/false` metadata for secrets.
  Existing keys and tokens are never sent back to React or rendered into HTML;
  leaving a secret field empty preserves its current value.
- Per-member Paperless tokens are encrypted with AES-256-GCM using a key derived
  from the installation secret. Plaintext tokens are never returned by the API.
- Back up the complete data volume, including the generated installation secret.
  Replacing that secret makes existing encrypted member tokens unreadable.
- Companion write proposals, decisions, and results are retained in the local
  SQLite audit trail. Provider prompts receive only the bounded context needed
  for the request.
- Companion activity cards are redacted on the server before streaming. They
  show the kind and status of Paperless research plus the user-authored search
  term and bounded document metadata. They never show OCR text, mutation
  payloads, model reasoning, provider errors, tokens, or complete tool results.
- The Tagvico harness exposes no host shell or filesystem tools. Paperless read
  and write capabilities are narrow, and every AI write requires approval.
- The container drops Linux capabilities and enables `no-new-privileges` in the
  recommended Compose configuration.
- Use a dedicated Paperless API token and only expose the Tagvico web port to
  trusted networks.
- Start with Review first and a controlled tag vocabulary.
- Back up the data volume before schema upgrades.

Tag-unification analysis sends tag names and coarse document-use counts to the
configured model provider. It does not send document OCR for that workflow.
The model can only propose pairs; deterministic, approval-gated server code
moves references and deletes a source tag after verifying that it is unused.

## Telegram bot boundary

The optional Telegram interface is not a local transport and Telegram bot chats
are not end-to-end encrypted. Questions, photos, PDFs, and any original sent
back through a download button pass through Telegram under its terms. Retrieved
Paperless OCR and the user's question are sent to the configured Tagvico model
provider. Choosing local Ollama or a local compatible endpoint keeps the model
step on infrastructure you control, but does not change the Telegram boundary.

Only explicitly allowlisted Telegram IDs are processed, only private chats are
accepted, and each ID has a separate Paperless API token. Paperless therefore
remains responsible for document visibility and mutation permissions. The
allowlist and tokens are configuration secrets; do not commit them. The bot has
no conversation database: bounded per-user history lives in process memory and
is removed by `/clear` or restart.

Answers derived from OCR can be incomplete or wrong. In particular, totals and
comparisons are assistant summaries rather than accounting-grade calculations;
use the cited-original buttons to verify them.

## Screenshot policy

Documentation screenshots must be inspected as final rendered pixels before
commit. They must not show API keys, tokens, real document text, personal names,
email addresses, account identifiers, private hostnames, or internal URLs.
Empty states, synthetic metadata, generic tags, and non-identifying aggregate
counts are acceptable.

The screenshots in this v3 guide use generic tag labels and sanitized document
state. They demonstrate product behavior without exposing source documents or
credentials.

## Optional installation analytics

Tagvico's anonymous installation analytics are disabled by default. You can
explicitly opt in from **Settings → Privacy → Anonymous installation
analytics**, preview the exact payload before sharing, send a test heartbeat,
or disable sharing again at any time.

When enabled, Tagvico sends one coarse heartbeat roughly every 24 hours. It
contains the application version, a broad processed-count
bucket, write mode, a broad provider category, three feature booleans, and
rotating daily/monthly identifiers. The locally generated secret used to derive
those identifiers never leaves the installation, and the monthly identifier
changes every month.

Tagvico never includes document text or metadata, names, emails, user or
document IDs, Paperless URLs, API keys, exact document counts, exact model
names, errors, hostnames, or IP-derived location in the payload. Receiver rows
expire after 62 days and only aggregate opted-in installation counts should be
published.

Set `TAGVICO_TELEMETRY_ENABLED=no` to enforce the default from the environment.
Self-hosted distributors may override `TAGVICO_TELEMETRY_ENDPOINT`; it must use
HTTPS. The complete policy and receiver source are available in
[`PRIVACY_POLICY.md`](https://github.com/arturict/tagvico-ai/blob/main/PRIVACY_POLICY.md)
and [`telemetry/`](https://github.com/arturict/tagvico-ai/tree/main/telemetry).
