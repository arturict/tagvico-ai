# Tagvico telemetry receiver

This optional Cloudflare Worker receives the documented aggregate heartbeat.
It deliberately does not inspect or persist request IP addresses, user agents,
hostnames, or referrers. Daily identifiers are deduplicated and all heartbeat
rows expire after 62 days. Review the hosting provider's own request-log and
data-processing settings before deploying.

1. Create a D1 database and apply `schema.sql`.
2. Copy `wrangler.toml.example` to `wrangler.toml` and set the database ID.
3. Store a long random `ADMIN_TOKEN` with `wrangler secret put ADMIN_TOKEN`.
4. Deploy, attach `telemetry.tagvico.arturf.ch`, and disable request-log storage
   where supported.
5. Verify `POST /v1/heartbeat`, then query `GET /v1/summary` with the bearer
   token. Never expose the raw D1 database publicly.

The aggregate dashboard must label every result as opted-in installations.
