# Privacy and security

Tagvico reads OCR text and metadata from Paperless-ngx. A local Ollama or
compatible endpoint can keep that processing on infrastructure you control.
When you select a hosted provider, the document content required for
classification is sent to that provider under its terms.

## Deployment boundaries

- Provider secrets are stored in `data/.env` and are not written to the
  processing database.
- The container drops Linux capabilities and enables `no-new-privileges` in the
  recommended Compose configuration.
- Use a dedicated Paperless API token and only expose the Tagvico web port to
  trusted networks.
- Start with Review first and a controlled tag vocabulary.
- Back up the data volume before schema upgrades.

## Screenshot policy

Documentation screenshots must be inspected as final rendered pixels before
commit. They must not show API keys, tokens, real document text, personal names,
email addresses, account identifiers, private hostnames, or internal URLs.
Empty states, synthetic metadata, generic tags, and non-identifying aggregate
counts are acceptable.

The screenshots in this v2 guide use generic tag labels and sanitized document
state. They demonstrate product behavior without exposing source documents or
credentials.

## Optional installation analytics

Tagvico's anonymous installation analytics are disabled by default. You can
explicitly opt in from **Settings → Privacy → Anonymous installation
analytics**, preview the exact payload before sharing, send a test heartbeat,
or disable sharing again at any time.

When enabled, Tagvico sends one coarse heartbeat roughly every 24 hours. It
contains the application version, a broad processed-count
buckets, write mode, a broad provider category, three feature booleans, and
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
