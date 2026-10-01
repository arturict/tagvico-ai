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

## Discord bot boundary

The optional Discord interface is not a local transport and Discord bot messages
are not end-to-end encrypted. Questions, photos, PDFs, and any original sent
back through a download button pass through Discord under its terms. Retrieved
Paperless OCR and the user's question are sent to the configured Tagvico model
provider. Choosing local Ollama or a local compatible endpoint keeps the model
step on infrastructure you control, but does not change the Discord boundary.

Only explicitly allowlisted Discord snowflake IDs are processed. In direct
messages, all allowlisted-user content is handled. In the optional home channel,
only slash commands, bot @-mentions, or replies to the bot that keep the bot
mention enabled are processed;
unaddressed messages are ignored so no privileged Message Content intent is
required. Messages from bots, webhooks, unknown users, and other channels
receive no response. Unauthorized slash commands receive a private unavailable
response.

Each allowlisted Discord ID has a separate Paperless API token. Paperless
therefore remains responsible for document visibility and mutation permissions.
The allowlist and tokens are configuration secrets; do not commit them. The bot
has no conversation database: bounded per-user, per-channel history lives in
process memory and is removed by `/clear` or restart.

Document download and approval buttons are bound to the requesting Discord user
ID. A different user cannot replay or reuse another user's button. Home-channel
document downloads and slash-command responses are ephemeral (visible only to
the requesting user). Answers triggered by @mentions or replies are ordinary
channel messages visible to every member who can read that channel.

File uploads are validated against HTTPS Discord CDN URLs, sanitized filenames,
exactly one attachment, and a 10 MiB default and hard maximum. Automatic AI
metadata classification for Discord uploads is a separate explicit opt-in
(`DISCORD_UPLOAD_AUTOMATIC_METADATA=yes`); the default leaves Paperless
consumption rules in control.

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
explicitly opt in from **Settings → People & security → Privacy → Anonymous
telemetry**, preview the exact payload before sharing, send a test heartbeat,
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
Official images default to
`https://telemetry.tagvico.arturf.ch/v1/heartbeat`, but send nothing unless you
opt in. Self-hosted distributors may override `TAGVICO_TELEMETRY_ENDPOINT`; it
must use HTTPS and point to a compatible heartbeat route. The complete policy
and receiver source are available in
[`PRIVACY_POLICY.md`](https://github.com/arturict/tagvico-ai/blob/main/PRIVACY_POLICY.md)
and [`telemetry/`](https://github.com/arturict/tagvico-ai/tree/main/telemetry).

## Public website counter

The project landing page uses a separate first-party aggregate page-view
counter. It does not set cookies, use local storage, create visitor or session
identifiers, fingerprint browsers, send a referrer, or build a cross-site
profile. It increments one UTC-day total. Those totals expire after 93 days and
represent requests, not unique people.

The receiver fails closed unless its shared-key pageview and heartbeat rate
limiters are available. The limiters cap accepted writes per Cloudflare
location without adding an IP address, cookie, visitor identifier, or
fingerprint to Tagvico's data. They bound abuse and write cost; they do not turn
page views into a unique-person metric or unauthenticated installation reports
into verified users. Heartbeats use randomized send windows and retry after a
randomized delay instead of synchronizing every restarted installation. Short
retries are capped at two before the client returns to its daily window.

The browser skips the request when Global Privacy Control or Do Not Track is
enabled. Delivery infrastructure still processes the network address while
routing a request, so the receiver must run with request logs disabled or
minimized. The project publishes landing views separately from opted-in active
installations and suppresses exact installation totals below five.

This narrow design and the project's current Swiss/EU notice and consent
assessment are documented in
[`telemetry/PRIVACY_ASSESSMENT.md`](https://github.com/arturict/tagvico-ai/blob/main/telemetry/PRIVACY_ASSESSMENT.md).
