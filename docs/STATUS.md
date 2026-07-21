# Project status

**Status:** stable v3 (`3.0.0`).

## Stable v3 contract

Tagvico AI v3.0.0 adds an accountable action and approval layer to the stable,
reviewable Paperless-ngx filing workflow. The following are compatibility
commitments for v3:

- Existing v2 and v3 data volumes are upgraded with versioned, idempotent SQLite
  migrations and a pre-migration database backup.
- Canonical `TAGVICO_*` environment variables, port `3000`, `/app/data`, and
  the documented setup, login, health, review, history, and settings workflows
  remain supported throughout v3.
- Stable upgrades do not intentionally discard the local admin account,
  settings, processing history, review queue, or original metadata snapshots.
- Paperless data is accessed only through the official Paperless REST API.

The household, Action Case, checklist, approval, and encrypted member-token
records introduced by schema v5 are also preserved through compatible v3
upgrades. Breaking changes to these contracts require a new major version. Provider
model names, prices, quotas, and account entitlements remain controlled by the
provider and can change independently of Tagvico.

## Recommended deployment policy

- Pin `ghcr.io/arturict/tagvico-ai:3.0.0` rather than `latest` when you need
  explicit change control and unambiguous rollback.
- Back up the complete `tagvico_ai_data` volume before every upgrade.
- Start in **Review first** and test representative, non-sensitive documents
  before enabling Automatic mode.
- Treat ChatGPT subscription access as experimental and account-specific; it is
  not an API SLA.
- Keep anonymous installation analytics disabled unless you explicitly choose
  to share the locally previewed aggregate heartbeat.

## Security and support

Report reproducible bugs through the
[issue tracker](https://github.com/arturict/tagvico-ai/issues) after removing
credentials, private URLs, document contents, and personal information.
Security issues must not be filed publicly; follow
[`SECURITY.md`](../SECURITY.md).

Release-specific upgrade and rollback instructions are available on the
[GitHub releases page](https://github.com/arturict/tagvico-ai/releases) and in
  the [versioned v3 documentation](https://tagvico.arturf.ch/docs/).
