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

## Startup and network checks

Before setup, `/health` should return HTTP `200`, `status: "healthy"`,
`version: "3.5.0"` and `configured: false`. After setup, expect
`configured: true`. `/api/health` can report an unconfigured provider before
setup; use `/health` as the startup check.

If port 8080 does not answer, check each layer in order:

1. Run `docker compose config --quiet` to validate the file and interpolation.
2. Run `docker compose ps -a`. If the service exited or restarts repeatedly,
   inspect `docker compose logs --tail=100 tagvico-ai` locally.
3. Test the container directly, bypassing the host port and any reverse proxy:

   ```bash
   docker compose exec -T tagvico-ai curl --fail --show-error http://127.0.0.1:3000/health
   ```

4. If the internal check works, run `docker compose port tagvico-ai 3000`
   and test the published address from the Docker host. A default loopback
   binding is reachable only on that host. For a remote browser, follow the
   [remote-server setup instructions](./installation#remote-server-or-nas).

Do not share `docker inspect` or the output of `docker compose config` without
`--quiet`; both can expose environment credentials. Logs and health responses
also need review before sharing.

## Setup returns 403

Remote setup is disabled by default. When the browser is not running on the
same machine as Tagvico, put `ALLOW_REMOTE_SETUP=yes` in `.env` beside the
Compose file and make sure the service's `environment` section includes
`ALLOW_REMOTE_SETUP: "${ALLOW_REMOTE_SETUP:-no}"`. A `.env` value alone does
not automatically reach the container. Recreate the container with
`docker compose up -d` and complete setup. Remove the temporary flag afterward
and recreate it again. See [Remote server or NAS](./installation#remote-server-or-nas)
for the matching port binding.

## Paperless connection fails

- Use the Paperless base URL without `/api`.
- Read the error code in the message. `ECONNREFUSED` on `localhost` or
  `127.0.0.1`: that address is the Tagvico container. `ENOTFOUND`: the name
  does not resolve from the container; on Linux `host.docker.internal` needs
  `extra_hosts: ["host.docker.internal:host-gateway"]` on the Tagvico service.
  `ECONNABORTED` or `ETIMEDOUT`: a firewall, another network, or Paperless
  published only on the host loopback address. Certificate codes such as
  `DEPTH_ZERO_SELF_SIGNED_CERT`: the container does not trust the TLS
  certificate.
- Verify the API token in Paperless and use a dedicated token where possible.
- From a container, `localhost` refers to that container—not the Docker host.
  Use a shared Compose network and the Paperless service name, or a reachable
  host address.
- Check connectivity from inside Tagvico, because a successful host-side
  request does not prove container access. This command requests no documents
  and sends no token; replace the example URL with your Paperless base URL:

  ```bash
  docker compose exec -T tagvico-ai curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' --connect-timeout 5 --max-time 10 http://paperless-ngx:8000/api/documents/
  ```

  HTTP `401` or `403` is expected from this protected endpoint without a token
  and confirms network access only. The bare `/api/` path answers `302` on
  current Paperless releases, which also proves the network path. `000` with a curl error means DNS,
  connection or TLS failed. An HTML login redirect may be your proxy rather
  than Paperless. Finish with Tagvico's **Test connection** to check the token
  and API permissions.
- Service names resolve only on a shared Docker network. For separate Compose
  projects, find the network used by Paperless with `docker network ls`, then
  add it to the Tagvico Compose file. Replace `paperless_default` with the
  actual existing network name:

  ```yaml
  services:
    tagvico-ai:
      networks:
        - paperless

  networks:
    paperless:
      external: true
      name: paperless_default
  ```

  Merge these keys into the [installation example](./installation), keeping
  its image, volume, environment and ports. Recreate Tagvico afterward. This
  does not publish Paperless to the internet or start a second Paperless stack.

## Provider health is degraded

Open **Settings → AI models**, confirm the selected provider, and run its
connection test. Check the endpoint, model, credentials, account entitlement,
and provider status. Model catalogs and quotas are controlled by the provider
and may change independently of Tagvico.

For a local Ollama endpoint, confirm the model is pulled and that Ollama listens
on an address reachable from the Tagvico container. An endpoint bound only to
the host loopback interface is not normally reachable from another container.
The prefilled `http://localhost:11434` only works when Tagvico runs outside
Docker. With Ollama in Docker, attach both containers to one network and use
the Ollama container name, for example `http://ollama:11434`.

Tagvico 3.5.0 can reject a local model during setup with "The selected model
could not complete a test request" although the model supports tools. Two
causes were found on 2026-10-04: the check gives up after 15 seconds while
Ollama is still loading the model on a slow host, and reasoning models such as
Qwen 3.5 spend the check's small token budget on thinking. Fixes are on the
main branch for the next release. Until then, run the model once with
`ollama run <model> "hi"` immediately before the check so it is loaded, and
pick a model whose `ollama show <model>` capabilities list `tools` but not
`thinking`.

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
