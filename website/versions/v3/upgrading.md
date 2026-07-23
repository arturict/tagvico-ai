# Upgrade to or within v3

The `tagvico_ai_data` volume is the upgrade boundary. It holds settings,
processing history, queues, and the local admin account. Keep it, back it up,
and change only the container image during a normal upgrade.

## Before upgrading

1. Read the [release notes](https://github.com/arturict/tagvico-ai/releases) and
   note any v3 migration warnings.
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

After signing in, confirm the displayed version, test the Paperless connection,
check `/api/health`, and open `/docs/` to confirm the bundled release
documentation is available. Process one non-sensitive document in **Review
first** before re-enabling Automatic mode.

Tagvico checkpoints SQLite and creates a pre-migration database backup before
schema upgrades. The external volume backup remains the safest rollback point.

The v3 Settings migration does not replace `data/.env`. Existing variable
names remain readable and compatible values are written back through the new
typed Settings API. `/settings` now redirects into the single Next.js settings
workspace; the removed EJS settings form is not a rollback or compatibility
surface.

Legacy bookmarks redirect into the task-oriented 3.1 information architecture:
`/dashboard` to `/automation`, `/history` to `/activity`, `/operations` to
`/automation/recovery`, and `/manual` to `/automation/manual`. `/review`
remains the clear approval destination. Their former EJS views and page-specific
browser scripts have been retired.

## Roll back

Stop the new container, restore the backup volume if the upgrade changed its
schema, pin the previous image tag, and start Compose again. Do not run two
Tagvico versions against the same volume at the same time.

::: danger v2 to v3
Treat a major-version upgrade as a maintenance window. Back up the volume,
read the v3 release notes, and allow the first container start to complete the
schema-v5 migration. It adds households, members, Action Cases, steps,
Companion sessions, and approval audit records. The visible application moves
to Next.js on port 3000 while the scanner runs as an internal process on port
3001; do not expose the internal port.
:::
