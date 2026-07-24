# Install Tagvico v3

You need Docker Compose, a running Paperless-ngx installation, its base URL,
and a Paperless API token. Tagvico runs as one container and stores its local
configuration, admin account, history, and queues in a persistent volume.

## 1. Create the Compose file

Create a new directory and save this as `docker-compose.yml`:

```yaml
services:
  tagvico-ai:
    image: ghcr.io/arturict/tagvico-ai:3.1.1
    container_name: tagvico-ai
    restart: unless-stopped
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges=true
    ports:
      - "8080:3000"
    environment:
      TAGVICO_AI_PORT: "3000"
      ALLOW_REMOTE_SETUP: "yes"
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

Open `http://localhost:8080/setup` after the health check succeeds.

![Sanitized Tagvico sign-in screen](/screenshots/sign-in.png)

This sanitized capture shows the local admin sign-in presented after setup. It
contains no credentials, private hostnames, document data, or account details.

The same container also serves the documentation bundled with that release.
Open `http://localhost:8080/docs/` or the `/documentation` alias. The docs do
not depend on a separate hosted documentation service, so they keep matching
the image you pinned even when the public website changes.

## 3. Finish guided setup

1. Enter the Paperless base URL without `/api`, then paste a Paperless API token
   and test the connection.
2. Choose a [model provider](./providers) and enter its credentials or endpoint.
3. Create the local Tagvico owner account.
4. After signing in, use **Settings → Automation** to select **Review first**
   for approval-based filing or **Automatic** for direct writes, then choose
   which metadata fields Tagvico may change.

After saving the provider, inspect the detailed application health response.
Unlike `/health`, this endpoint reports the configured model adapter's health
when that adapter exposes a health check:

```bash
curl --fail http://localhost:8080/api/health
```

Some compatible and subscription-backed adapters report their health as
unknown rather than making a billable test request. Use the **Test connection**
actions in Settings to verify both Paperless and the selected model provider
before processing documents.

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

## Docker run alternative

```bash
docker volume create tagvico_ai_data
docker run -d \
  --name tagvico-ai \
  --restart unless-stopped \
  --cap-drop ALL \
  --security-opt no-new-privileges=true \
  -p 8080:3000 \
  -e TAGVICO_AI_PORT=3000 \
  -e ALLOW_REMOTE_SETUP=yes \
  -v tagvico_ai_data:/app/data \
  ghcr.io/arturict/tagvico-ai:3.1.1
```

After setup, remove `ALLOW_REMOTE_SETUP=yes` unless you specifically need to
repeat setup from another machine.

## Next steps

- Compare the [supported providers](./providers) and understand where document
  text is processed.
- Review the [privacy and security boundaries](./privacy) before using real
  documents.
- Keep the [troubleshooting guide](./troubleshooting) available while validating
  the first processing run.
