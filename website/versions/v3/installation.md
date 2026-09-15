# Install Tagvico v3

You need Docker Compose, a running Paperless-ngx installation, its base URL,
and a Paperless API token. Tagvico runs as one container and stores its local
configuration, admin account, history, and queues in a persistent volume.

## 1. Create the Compose file

Create a new directory and save this as `docker-compose.yml`:

```yaml
services:
  tagvico-ai:
    image: ghcr.io/arturict/tagvico-ai:3.4.1
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
      TAGVICO_TELEMETRY_ENDPOINT: "${TAGVICO_TELEMETRY_ENDPOINT:-https://telemetry.tagvico.arturf.ch/v1/heartbeat}"
    volumes:
      - tagvico_ai_data:/app/data

volumes:
  tagvico_ai_data:
```

Pin the exact v3 tag you intend to run. Do not use `latest` for a
production install because it makes upgrades and rollback ambiguous.

## 2. Start and check the container

```bash
docker compose up -d
docker compose ps
curl http://localhost:8080/health
```

Open `http://localhost:8080/setup` on the Docker host after the health check
succeeds.

### Remote server or NAS

The secure default publishes Tagvico only on loopback and accepts initial setup
only from the same host. To finish setup from another device on a trusted LAN,
set both values before starting the container:

```dotenv
TAGVICO_AI_BIND_ADDRESS=0.0.0.0
ALLOW_REMOTE_SETUP=yes
```

Keep port `8080` behind the server firewall. After setup succeeds, remove
`ALLOW_REMOTE_SETUP` and run `docker compose up -d` again. Keep the bind-address
override only when the signed-in Tagvico application must remain reachable from
the LAN.

This sanitized capture shows the local admin sign-in presented after setup. It
contains no credentials, private hostnames, document data, or account details.

The same container also serves the documentation bundled with that release.
Open `http://localhost:8080/docs/` or the `/documentation` alias. The docs do
not depend on a separate hosted documentation service, so they keep matching
the image you pinned even when the public website changes.

## 3. Finish guided setup

1. Enter the Paperless base URL without `/api`, or use **Scan for Paperless**
   to search the attached networks and fill the field from a found
   installation. Then paste a Paperless API token. Setup checks the connection
   and the read permissions Tagvico needs before continuing.
2. Choose a [model provider](./providers). Built-in endpoints are prefilled.
   Setup verifies the connection and loads its live model catalog.
3. Select one of the verified models and create the local Tagvico owner
   account. Non-secret progress can resume in the same browser tab after an
   interruption; tokens, passwords, and provider secrets are never stored in
   that browser draft.
4. The safe first-run default is **Review first** with scheduled scans paused.
   Ask Tagvico can read immediately, while every proposed write still needs an
   explicit approval. Enable a schedule or Automatic metadata filing only
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

If Paperless runs on the Docker host, use `host.docker.internal` on Docker
Desktop or the host's LAN address on Linux. If both containers share a Docker
network, use the Paperless Compose service name.

::: tip Safer first run
Use **Review first**, enable only a small controlled tag vocabulary, and test
with synthetic or non-sensitive documents before allowing automatic writes.
:::

## Optional Telegram bot

Create a bot with BotFather, obtain each person's Telegram numeric user ID, and
create a separate Paperless API token for each person. Add the following
environment values to the Tagvico service:

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
Compose file passes every Telegram setting through to the application container.

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
Paperless API token for each person. Add the following to the Tagvico service:

Enable **User Settings → Advanced → Developer Mode** in Discord, right-click a
user, and choose **Copy User ID**. Right-click the selected server channel and
choose **Copy Channel ID** for `DISCORD_HOME_CHANNEL_ID`.

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
The Compose file passes every Discord setting through to the application container.

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
  ghcr.io/arturict/tagvico-ai:3.4.1
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
