# Tagvico AI privacy notice

Last updated: 11 July 2026

Tagvico AI is self-hosted software. The operator of each installation controls
the Paperless-ngx connection, model provider, network exposure, users, logs,
and local data retention. This notice describes what the Tagvico project
receives, not what an operator may configure locally.

## Document processing

Tagvico reads OCR text and metadata from the Paperless-ngx instance selected by
the operator. With Ollama or another endpoint on the operator's network, that
content can remain on infrastructure they control. When a hosted provider is
selected, the content required for classification is sent directly to that
provider under its terms and privacy notice. It is not routed through a
Tagvico-operated service.

Provider credentials are stored in the installation's `data/.env` file and are
not sent to the Tagvico project. Processing history and review suggestions are
stored in the installation's local SQLite database.

## Optional installation analytics

Anonymous installation analytics are **off by default**. An administrator may
explicitly enable or disable them in Settings or with
`TAGVICO_TELEMETRY_ENABLED=yes|no`. When enabled, the installation sends one
heartbeat approximately every 24 hours, beginning 15 minutes after startup.

The payload contains only:

- rotating daily and monthly HMAC identifiers;
- Tagvico version;
- a broad processed-document-count bucket;
- review or automatic write mode;
- `local`, `hosted`, or `custom` provider category; and
- booleans for OCR rescue, custom fields, and controlled tags.

It does **not** contain document text, titles or metadata; document or user
identifiers; names or email addresses; Paperless URLs, hostnames, or domains;
API keys or provider account details; exact document counts; model names;
errors, stack traces, IP-derived location, cookies, or advertising identifiers.

The random secret used to derive period identifiers remains on the local
installation. Daily identifiers change each day and monthly identifiers change
each month, preventing the project from linking an installation across months.
The receiver does not intentionally store source IP addresses or user-agent
headers. Its deduplication rows expire after 62 days. Hosting infrastructure
may necessarily process network addresses to deliver the request; its request
logging must be disabled or minimized by the project operator.

Administrators can preview the exact current payload before enabling sharing.
The payload is also printed to the local application log after a successful
send. Disabling analytics stops future heartbeats immediately.

## Website and GitHub

The documentation website does not require Tagvico application telemetry.
GitHub independently processes repository visits, stars, clones, issues, and
release access under GitHub's own terms. The in-app update check and star count
request public release/repository data directly from GitHub; Tagvico does not
receive those requests.

## Contact and changes

Privacy questions can be sent to `clusterz[at]protonmail.com`. Material changes
to analytics fields, purposes, or retention will be documented before release.
This notice is informational and does not replace an installation operator's
own legal obligations or privacy notice.
