# Remove Tagvico AI

Removing the container does not remove Paperless documents or metadata already
written to them. It also leaves the named data volume intact unless you
explicitly delete it.

## Keep data for a later reinstall

```bash
docker compose down
```

You can reinstall the same or a compatible v2 image later and attach the
existing `tagvico_ai_data` volume.

## Permanently delete local Tagvico data

First create a final backup if you may need settings, history, queues, or the
local admin account. Then remove the Compose stack and its named volume:

```bash
docker compose down --volumes
```

If you created the container with `docker run`:

```bash
docker rm -f tagvico-ai
docker volume rm tagvico_ai_data
```

::: danger This cannot be undone
Deleting `tagvico_ai_data` permanently removes Tagvico's local configuration,
credentials, history, review queue, snapshots, and admin account. It does not
revert metadata already written to Paperless-ngx. Use History restoration
before removal if you want to revert supported metadata snapshots.
:::

Finally, remove any Tagvico-specific API token from Paperless and revoke hosted
provider credentials that were dedicated to this installation.
