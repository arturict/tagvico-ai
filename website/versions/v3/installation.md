# Install Tagvico v3

You need Docker Engine or Docker Desktop with the Compose v2 plugin, a running
Paperless-ngx 2.16.0 or newer installation, its base URL, and a Paperless API
token. Check `docker version` and `docker compose version` before starting.
Tagvico runs as one container and stores its local configuration, admin account,
history, and queues in a persistent volume.

## 1. Create the Compose file

Create a new directory and save this as `docker-compose.yml`. This installs
Tagvico alongside your existing Paperless. The repository-root Compose file is
a source-build test stack that also starts Paperless, Postgres and Redis; use
the release-image example below for a clean install.

```yaml
services:
  tagvico-ai:
    image: ghcr.io/arturict/tagvico-ai:3.5.0
    container_name: tagvico-ai
    restart: unless-stopped
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges=true
    ports:
      - "${TAGVICO_AI_BIND_ADDRESS:-127.0.0.1}:8080:3000"
    environment:
      TAGVICO_AI_PORT: "3000"
      TAGVICO_AI_BIND_ADDRESS: "${TAGVICO_AI_BIND_ADDRESS:-127.0.0.1}"
      ALLOW_REMOTE_SETUP: "${ALLOW_REMOTE_SETUP:-no}"
      TAGVICO_TELEMETRY_ENDPOINT: "${TAGVICO_TELEMETRY_ENDPOINT:-https://telemetry.tagvico.arturf.ch/v1/heartbeat}"
    volumes:
      - tagvico_ai_data:/app/data

volumes:
  tagvico_ai_data:
```

Pin the exact v3 tag you intend to run. Do not use `latest` for a
production install because it makes upgrades and rollback ambiguous.

### Paperless runs in Docker on the same host

This is the most common setup, and the one where `localhost` does not work:
inside the Tagvico container, `localhost` is Tagvico itself. Attach Tagvico to
the Docker network of your Paperless stack instead. Find its name with
`docker network ls` (Compose names it `<paperless-project>_default`, for
example `paperless_default`), then add these keys to the file above:

```yaml
services:
  tagvico-ai:
    # keep image, ports, environment and volumes from above
    networks:
      - paperless

networks:
  paperless:
    external: true
    name: paperless_default
```

In setup, the Paperless base URL is then the Paperless service name and its
container port, usually `http://webserver:8000` (the service name in the
official Paperless Compose files) or `http://paperless-ngx:8000`. **Scan for
Paperless** finds it on the shared network. This keeps Paperless private and
does not change your Paperless stack.

If Paperless is not in Docker, or runs on another machine, use an address of
that machine that the Tagvico container can reach, such as its LAN address.

## 2. Start and check the container

```bash
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
# The first start takes a few seconds; retry for up to a minute.
for i in $(seq 1 30); do curl --fail --silent --show-error http://localhost:8080/health && break; sleep 2; done
```

Open `http://localhost:8080/setup` on the Docker host after the health check
succeeds. Expect HTTP `200`, `status: "healthy"`, `version: "3.5.0"`
and `configured: false` before setup. A container can be running while the
application is still starting. If the check fails, follow
[Startup and network checks](./troubleshooting#startup-and-network-checks).

### Remote server or NAS

The secure default publishes Tagvico only on loopback and accepts initial setup
only from the same host. To finish setup from another device on a trusted LAN,
create a `.env` file beside `docker-compose.yml` with both values before
starting the container. The Compose example above passes them into Tagvico:

```dotenv
TAGVICO_AI_BIND_ADDRESS=0.0.0.0
ALLOW_REMOTE_SETUP=yes
```

Run `docker compose config --quiet` and `docker compose up -d`, then open
`http://<server-LAN-address>:8080/setup` on the trusted device. Keep port `8080`
behind the server firewall. After setup succeeds, remove `ALLOW_REMOTE_SETUP`
from `.env` and run `docker compose up -d` again. Keep the bind-address
override only when the signed-in Tagvico application must remain reachable from
the LAN.

The same container also serves the documentation bundled with that release.
Open `http://localhost:8080/docs/` or the `/documentation` alias. The docs do
not depend on a separate hosted documentation service, so they keep matching
the image you pinned even when the public website changes.

## 3. Finish guided setup

1. Enter the Paperless base URL without `/api`, or use **Scan for Paperless**
   to search the attached networks and fill the field from a found
   installation. The scan lists every Paperless it can reach, so confirm the
   address is yours. Then paste a Paperless API token. Setup checks the connection
   and the read permissions Tagvico needs before continuing.
2. Choose a [model provider](./providers). **ChatGPT plan** is listed first and
   lets a ChatGPT Plus or Pro plan pay for filing and chat with **Continue with
   ChatGPT**, no API key needed. Built-in endpoints are prefilled for the other
   providers. Setup verifies the connection and loads the live model catalog.
3. Select one of the verified models and create the local Tagvico owner
   account. Non-secret progress can resume in the same browser tab after an
   interruption; tokens, passwords, and provider secrets are never stored in
   that browser draft.
4. The safe first-run default is **Review first** with scheduled scans paused.
   After sign-in you land in the chat, which can read immediately, while every
   proposed write still needs an explicit approval. Enable a schedule or Automatic metadata filing only
   after validating representative documents.

After saving the provider, inspect the detailed application health response.
Unlike `/health`, this endpoint reports the configured model adapter's health
when that adapter exposes a health check:

```bash
curl --fail http://localhost:8080/api/health
```

Some subscription-backed adapters require their separate account sign-in flow
and may report health as unknown rather than making a billable test request.
Use the **Test connection** actions in Settings after authentication and before
processing documents.

If the Paperless check fails, the error code points at the cause:
`ECONNREFUSED` for `localhost` or `127.0.0.1` means the address points at the
Tagvico container itself; `ENOTFOUND` means the name does not resolve from the
container, for example a service name on another Docker network or
`host.docker.internal` on Linux. See
[Paperless in Docker on the same host](#paperless-runs-in-docker-on-the-same-host)
and [Paperless connection fails](./troubleshooting#paperless-connection-fails).
On Docker Desktop, `host.docker.internal` reaches a Paperless that is published
on the host.

After setup, `/health` should report `configured: true`. Run
`docker compose restart tagvico-ai`, sign in again, and confirm your settings
remain. A restart keeps the named volume; `docker compose down -v` deletes it.
Use the [setup feedback kit](./setup-feedback) for a controlled first-use check
and a short report.

::: tip Safer first run
Use **Review first**, enable only a small controlled tag vocabulary, and test
with synthetic or non-sensitive documents before allowing automatic writes.
:::

## Optional Telegram bot

Create a bot with BotFather, obtain each person's Telegram numeric user ID, and
create a separate Paperless API token for each person. Enter the token and the
allowed people under **Settings → Channels → Telegram**; the same tab shows
whether the bot is running and checks the token for you. The bundled Compose
file passes the `TELEGRAM_*` variables through empty, so the tab can save them.
A value you set in the Compose file or in `.env` takes precedence, and the tab
then lists it as set by the container environment. To configure the bot that way
instead, add the following environment values to the Tagvico service:

```yaml
environment:
  TELEGRAM_BOT_ENABLED: "yes"
  TELEGRAM_BOT_TOKEN: "123456:replace-with-the-bot-token"
  TELEGRAM_USERS_JSON: >-
    [{"telegramId":"123456789","paperlessToken":"one-users-paperless-token","householdId":"copy-from-settings","memberId":"copy-from-settings"}]
  # Optional: bypasses the Tagvico review queue for metadata on bot uploads.
  TELEGRAM_UPLOAD_AUTOMATIC_METADATA: "no"
```

The remaining optional tuning variables are
`TELEGRAM_POLL_TIMEOUT_SECONDS` (default `30`),
`TELEGRAM_UPLOAD_TIMEOUT_SECONDS` (default `180`),
`TELEGRAM_MAX_DOCUMENTS` (default `8`), `TELEGRAM_HISTORY_TURNS`
(default `6`), and `TELEGRAM_MAX_FILE_BYTES` (default `20971520`). The bundled
Compose file passes every Telegram setting through to the application container,
empty unless you set it.

`paperlessUrl` may be added to an individual allowlist entry; otherwise the
normal `PAPERLESS_API_URL` is used. Restart Tagvico after changing this process
configuration. A Telegram entry linked to the Action Center must use the same
Paperless instance as the main configuration. The standard Telegram Bot API can download uploads up to 20 MB,
and Tagvico enforces that limit. Unknown IDs and non-private chats receive no
response.

Read [Privacy and security](./privacy) before enabling the bot. Telegram bot
chats are not end-to-end encrypted, and model-provider data terms still apply.

## Optional Discord bot

Create an application at the [Discord Developer Portal](https://discord.com/developers/applications).
On the **Bot** page create a bot, copy the token into `DISCORD_BOT_TOKEN`, and
disable all three **Privileged Gateway Intents** — Tagvico does not need Message
Content Intent. Use **OAuth2 → URL Generator** with the `bot` and
`applications.commands` scopes and the minimum bot permissions below, then
invite the bot with the generated URL.

**Minimum bot permissions:** Send Messages, Read Message History, View Channels,
Attach Files, Use Slash Commands.

Obtain each person's Discord user ID (numeric snowflake) and create a separate
Paperless API token for each person.

Enable **User Settings → Advanced → Developer Mode** in Discord, right-click a
user, and choose **Copy User ID**. Right-click the selected server channel and
choose **Copy Channel ID** for the home channel.

Enter the token, the allowed people and the optional home channel under
**Settings → Channels → Discord**. As with Telegram, a value set in the Compose
file or `.env` takes precedence. To configure the bot through the environment,
add the following to the Tagvico service:

```yaml
environment:
  DISCORD_BOT_ENABLED: "yes"
  DISCORD_BOT_TOKEN: "replace-with-the-bot-token"
  DISCORD_USERS_JSON: >-
    [{"discordId":"123456789012345678","paperlessToken":"one-users-paperless-token","householdId":"copy-from-settings","memberId":"copy-from-settings"}]
  # Optional: one server channel ID for slash commands and @-mentions.
  DISCORD_HOME_CHANNEL_ID: ""
  # Explicit opt-in: bypasses the Tagvico review queue for metadata on bot uploads.
  DISCORD_UPLOAD_AUTOMATIC_METADATA: "no"
```

In direct messages, all allowlisted-user content is processed. In the optional
home channel, only slash commands, bot @-mentions, and replies to the bot that
keep the bot mention enabled are processed; unaddressed messages are ignored.
Messages from unknown users, bots, webhooks, and other channels receive no
response. Unauthorized slash commands receive a private unavailable response.

Optional tuning variables: `DISCORD_UPLOAD_TIMEOUT_SECONDS` (default `180`),
`DISCORD_MAX_DOCUMENTS` (default `8`), `DISCORD_HISTORY_TURNS` (default `6`),
`DISCORD_MAX_FILE_BYTES` (default and hard maximum `10485760`, i.e. 10 MiB).
The Compose file passes every Discord setting through to the application container,
empty unless you set it.

`paperlessUrl` may be added per allowlist entry; otherwise `PAPERLESS_API_URL`
is used. An entry linked to the Action Center must use the same Paperless
instance as the main configuration. Document download and approval buttons are
bound to the requesting user; another user cannot interact with them.

Read [Privacy and security](./privacy) before enabling the bot. Discord bot
messages are not end-to-end encrypted, and model-provider data terms still apply.

## Docker run alternative

```bash
docker volume create tagvico_ai_data
docker run -d \
  --name tagvico-ai \
  --restart unless-stopped \
  --cap-drop ALL \
  --security-opt no-new-privileges=true \
  -p 127.0.0.1:8080:3000 \
  -e TAGVICO_AI_PORT=3000 \
  -e TAGVICO_AI_BIND_ADDRESS=127.0.0.1 \
  -e TAGVICO_TELEMETRY_ENDPOINT=https://telemetry.tagvico.arturf.ch/v1/heartbeat \
  -v tagvico_ai_data:/app/data \
  ghcr.io/arturict/tagvico-ai:3.5.0
```

For a remote browser, replace the published address with
`-p 0.0.0.0:8080:3000`, set `-e TAGVICO_AI_BIND_ADDRESS=0.0.0.0`, and add
`-e ALLOW_REMOTE_SETUP=yes` only until setup is complete. Remove the
remote-setup environment value and recreate the container afterward.

## Next steps

- Compare the [supported providers](./providers) and understand where document
  text is processed.
- Review the [privacy and security boundaries](./privacy) before using real
  documents.
- Keep the [troubleshooting guide](./troubleshooting) available while validating
  the first processing run.
