# Install Tagvico AI v2

You need Docker Compose, a running Paperless-ngx installation, its base URL,
and a Paperless API token. Tagvico runs as one container and stores its local
configuration, admin account, history, and queues in a persistent volume.

## 1. Create the Compose file

Create a new directory and save this as `docker-compose.yml`:

```yaml
services:
  tagvico-ai:
    image: ghcr.io/arturict/tagvico-ai:2.0.0-alpha.1
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

Pin the exact v2 release you intend to run. Do not use `latest` for a
production install because it makes upgrades and rollback ambiguous.

## 2. Start and check the container

```bash
docker compose up -d
docker compose ps
curl http://localhost:8080/health
```

Open `http://localhost:8080/setup` after the health check succeeds.

![Tagvico AI v2 sign-in screen captured from a clean VM 113 browser session](/screenshots/sign-in.png)

This sanitized capture shows the local admin sign-in presented after setup. It
contains no credentials, private hostnames, document data, or account details.

## 3. Finish guided setup

1. Create the local Tagvico admin account.
2. Enter the Paperless base URL without `/api`, then paste a Paperless API token
   and test the connection.
3. Choose a [model provider](./providers) and test its credentials or endpoint.
4. Select **Review first** for approval-based filing or **Automatic** for direct
   writes, then choose which metadata fields Tagvico may change.

If Paperless runs on the Docker host, use `host.docker.internal` on Docker
Desktop or the host's LAN address on Linux. If both containers share a Docker
network, use the Paperless Compose service name.

::: tip Safer first run
Use **Review first**, enable only a small controlled tag vocabulary, and test
with synthetic or non-sensitive documents before allowing automatic writes.
:::

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
  ghcr.io/arturict/tagvico-ai:2.0.0-alpha.1
```

After setup, remove `ALLOW_REMOTE_SETUP=yes` unless you specifically need to
repeat setup from another machine.
