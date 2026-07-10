# Upgrade to or within v2

The `tagvico_ai_data` volume is the upgrade boundary. It holds settings,
processing history, queues, and the local admin account. Keep it, back it up,
and change only the container image during a normal upgrade.

## Before upgrading

1. Read the release notes and note any v2 migration warnings.
2. Keep **Review first** enabled if the release changes metadata behavior.
3. Stop Tagvico and back up its named volume:

```bash
docker compose stop tagvico-ai
docker run --rm \
  -v tagvico_ai_data:/source:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/tagvico-ai-data.tgz -C /source .
```

## Pull the pinned release

Update `image:` in `docker-compose.yml` to the exact release tag, then run:

```bash
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 tagvico-ai
curl http://localhost:8080/health
```

Tagvico checkpoints SQLite and creates a pre-migration database backup before
schema upgrades. The external volume backup remains the safest rollback point.

## Roll back

Stop the new container, restore the backup volume if the upgrade changed its
schema, pin the previous image tag, and start Compose again. Do not run two
Tagvico versions against the same volume at the same time.

::: danger v1 to v2
Treat a major-version upgrade as a maintenance window. Back up the volume,
read the v2 release notes, migrate deprecated environment-variable aliases to
their `TAGVICO_*` replacements, and verify suggestions in **Review first**
before returning to automatic writes.
:::
