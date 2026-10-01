# Troubleshooting

Start with the container status, recent logs, and both health endpoints:

```bash
docker compose ps
docker compose logs --tail=200 tagvico-ai
curl --fail http://localhost:8080/health
curl --fail http://localhost:8080/api/health
```

`/health` verifies the Tagvico process and its database. `/api/health` also
reports the configured model adapter's health when the adapter exposes a
health check, and returns `503` on an explicit failure. An `unknown` provider
result is not a successful connection test; use the **Test connection** actions
in Settings to verify Paperless and the selected provider.

## Setup returns 403

Remote setup is disabled by default. When the browser is not running on the
same machine as Tagvico, temporarily set `ALLOW_REMOTE_SETUP=yes`, recreate the
container, and complete setup. Remove the setting afterward and recreate the
container again.

## Paperless connection fails

- Use the Paperless base URL without `/api`.
- Verify the API token in Paperless and use a dedicated token where possible.
- From a container, `localhost` refers to that container—not the Docker host.
  Use a shared Compose network and the Paperless service name, or a reachable
  host address.
- Test the exact URL from the Docker host before changing Tagvico settings.

## Provider health is degraded

Open **Settings → AI models**, confirm the selected provider, and run its
connection test. Check the endpoint, model, credentials, account entitlement,
and provider status. Model catalogs and quotas are controlled by the provider
and may change independently of Tagvico.

For a local Ollama endpoint, confirm the model is pulled and that Ollama listens
on an address reachable from the Tagvico container. An endpoint bound only to
the host loopback interface is not normally reachable from another container.

## Documents are not processing

1. Open **Overview** from the account menu and check it, and **Recovery**, for runner state, retries, terminal failures, or OCR
   rescue work.
2. Confirm the Paperless token can see the expected documents.
3. Use **Scan now** for an immediate pass.
4. Inspect **Activity** for the specific failure instead of repeatedly rescanning.

Keep **Review first** enabled while diagnosing write behavior. A suggestion that
is already queued remains reviewable when the processing mode changes.

## ChatGPT plan sign-in does not finish

After you allow Tagvico in ChatGPT, the browser shows a `127.0.0.1` page that
does not load. That is expected. Copy its full address into Tagvico and select
**Finish sign-in**. If Tagvico says the address "belongs to a different sign-in
attempt", it came from an older tab; start again and paste the address from the
new tab. A message that the plan is not available means the plan or workspace
is not eligible, for example a Free plan. Usage-limit messages mean the plan's
or Tagvico's own limit is used up: check ChatGPT Settings → Usage. Tagvico never
falls back to another provider. See the [ChatGPT plan guide](./providers#chatgpt-plan).

## Telegram or Discord settings do not save

Open **Settings → Channels**. A value that is set in your Compose file or `.env`
takes precedence over the tab, which then lists it as set by the container
environment and keeps that field read-only. The `docker-compose.yml` that ships
with 3.5.0 passes these variables through empty; older copies set values such
as `TELEGRAM_BOT_ENABLED=no`, which lock the setting. Remove those lines (or
copy the current file) and recreate the container to manage the bots in the UI.

## Upgrade does not start cleanly

Do not run two Tagvico versions against the same data volume. Stop the stack,
preserve the failed container logs, and follow the [rollback procedure](./upgrading#roll-back).
Restore the pre-upgrade volume backup when the new release migrated the database
and the previous image cannot read it.

## Get more help

When reporting a problem, include the Tagvico version, deployment method,
provider name, relevant sanitized log lines, and the failing health status.
Remove API keys, tokens, document text, personal data, account identifiers, and
private URLs before posting an issue in the
[GitHub issue tracker](https://github.com/arturict/tagvico-ai/issues).
