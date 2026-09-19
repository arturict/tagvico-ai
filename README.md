# Tagvico

> **Tagvico v3 is stable.** Companion writes always require explicit approval,
> and Paperless-ngx remains the document system of record.

**Deploying v3?** Read the [stable deployment guidance](docs/STATUS.md), share a
[redacted deployment result](https://github.com/arturict/tagvico-ai/discussions/35),
or [report a reproducible bug](https://github.com/arturict/tagvico-ai/issues/new?template=bug_report.yml).

**The private Action Center and Household Companion for Paperless-ngx.** Turn
letters and PDFs into assigned deadlines, decisions, payments, replies,
renewals, and multi-step work while keeping Paperless as the document system of
record. Paperless files the document; Tagvico makes sure someone acts on it.

Reviewable AI metadata filing is still included as an opt-in utility — and if
you use Paperless-ngx v3's built-in AI suggestions instead, Tagvico steps aside
and focuses on the action layer. See
[Tagvico and native Paperless-ngx AI](#tagvico-and-native-paperless-ngx-ai).

[![Status: stable v3](https://img.shields.io/badge/status-stable_v3-16a34a.svg)](docs/STATUS.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/arturict/tagvico-ai)](https://github.com/arturict/tagvico-ai/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/arturict/tagvico-ai/ci.yml?branch=main&label=CI)](https://github.com/arturict/tagvico-ai/actions/workflows/ci.yml)

![Tagvico v3.2 Home workspace](website/versions/v3/public/screenshots/home-paper-pine-v3.png)

## Why Tagvico

- **Action Cases, not loose reminders** — one case per Paperless document, with priority, owner, due date, audit trail, and up to 100 checklist steps.
- **A household, not a single user** — assign work to family members, with roles that decide who may approve what.
- **AI with approval boundaries** — the Companion can read permitted documents and prepare changes; only an owner or adult can execute a write.
- **Your choice of model** — the Companion uses Vercel AI SDK v6 for OpenCode Go, OpenRouter, OpenAI, and compatible gateways, plus an optional read-only Codex SDK adapter.
- **Optional Telegram and Discord access** — allowlisted family members can search, upload, list actions, and approve or reject proposals using their own Paperless tokens.
- **Designed for homelabs** — one container, one persistent volume, and SQLite for processing history and retries.
- **Built to recover** — durable OCR and terminal-failure queues, safe rescans, original-metadata restore, and interrupted-job recovery.
- **Operationally hardened** — optional MFA, rate limits, same-origin mutation checks, protected setup, and generated JWT secrets.
- **Clear privacy boundaries** — keep processing on your network with a local endpoint, or explicitly choose a hosted provider.
- **Included utility: reviewable metadata filing** — opt-in AI suggestions for titles, tags, correspondents, types, dates, custom fields, and owners, with a review queue, cost-aware OpenAI Flex/Batch modes, and full restore snapshots. Useful on Paperless-ngx 2.x, or whenever you want an approval gate and audit trail that native suggestions don't provide.

## The v3 architecture

Tagvico owns the credential store, model resolution, session transcript, narrow
tool catalog, household roles, approval state, and audit trail. Model providers
only supply inference. There is no shell or filesystem tool in the Companion.
Top-level case state is mirrored to reserved Paperless custom fields and the
`tagvico/action` tag; complete checklists remain local to Tagvico.

## Tagvico and native Paperless-ngx AI

Paperless-ngx v3 ships its own AI: metadata suggestions, an apply-suggestions
workflow action, and document chat. That's good news — it covers the routine
tagging Tagvico automated in v1 and v2, and Tagvico does not compete with it.

- **Deadlines, cases, households, approvals, and the family bots** are
  Tagvico's job. Paperless-ngx is a document archive by design and has no
  equivalent layer.
- **Metadata filing is yours to place.** Use native Paperless AI, or use
  Tagvico's opt-in filing when you want a review queue, an approval gate,
  restore snapshots, provider choice, or you're still on Paperless-ngx 2.x.
- **Do not run two writers.** If Paperless AI workflow actions apply metadata
  automatically, leave Tagvico's metadata automation off or in **Review
  first** — never both in Automatic. Two automations editing the same fields
  will fight, and the audit trail stops being trustworthy.

New Tagvico installations already start with scheduled scans paused and writes
in Review first, so native Paperless AI and a default Tagvico setup coexist
safely out of the box.

## What Tagvico doesn't do

Stated non-goals build more trust than feature lists. Tagvico deliberately:

- **doesn't store your documents** — Paperless-ngx keeps the files; Tagvico keeps cases, approvals, and history.
- **doesn't replace Paperless** — search, storage, permissions, and native AI stay Paperless's job, accessed only through the official REST API.
- **doesn't give models shell or filesystem access** — the Companion has a narrow tool catalog, and every write needs an approval or an explicitly chosen automatic mode.
- **doesn't phone home by default** — analytics are opt-in, previewable, and content-free.
- **doesn't require the cloud** — one container next to your Paperless, with local inference if you want it.

Some v2-era features (OCR rescue, the ChatGPT-subscription and Copilot
adapters, OpenAI Flex/Batch modes) are now in maintenance mode: fully
supported throughout v3, but candidates for removal in v4 as Tagvico focuses
on the action layer. See [docs/v4-plan.md](docs/v4-plan.md).

## See Tagvico in action

The interface keeps the important decisions visible: what has been processed,
which account-scoped model is active, and which vocabulary the model may use.

<table>
  <tr>
    <td width="50%">
      <img src="website/versions/v3/public/screenshots/ai-models-paper-pine-v3.png" alt="Tagvico v3.2 AI model settings showing the supported provider registry">
      <br><strong>Use the provider boundary that fits your archive.</strong><br>
      Live model discovery, write-only credentials, local inference, API providers, ChatGPT subscription, and GitHub Copilot.
    </td>
    <td width="50%">
      <img src="website/versions/v3/public/screenshots/companion-paper-pine-v3.png" alt="Tagvico v3.2 persistent Ask Tagvico workspace">
      <br><strong>Research with a visible approval boundary.</strong><br>
      Persistent chats, a configured model picker, privacy-safe tool activity, and explicit approval before writes.
    </td>
  </tr>
</table>

<p align="center"><em>Sanitized v3.2 screens from a representative installation. No document contents, credentials, endpoints, or account identifiers are shown.</em></p>

## Stable quick start (v3.4.1)

Use only immutable tags that are present on the
[GitHub releases page](https://github.com/arturict/tagvico-ai/releases).

You need Docker Compose, a running Paperless-ngx instance, and a Paperless API token. No source checkout is required.

Create a new folder, save the following as `docker-compose.yml`, and run `docker compose up -d`:

```yaml
services:
  tagvico-ai:
    # Pin an immutable release tag for upgrades you can rely on.
    # See https://github.com/arturict/tagvico-ai/releases for the current version.
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

Open **<http://localhost:8080/setup>** on the Docker host. To confirm the
container is ready first, run:

```bash
docker compose ps
curl http://localhost:8080/health
```

The release-matched documentation is bundled into the same image at
**<http://localhost:8080/docs>**; `/documentation` is an alias. It does not
require the separately hosted documentation site.

For a headless NAS or server, explicitly set
`TAGVICO_AI_BIND_ADDRESS=0.0.0.0` and `ALLOW_REMOTE_SETUP=yes` only while
completing setup from a trusted LAN browser. Keep port `8080` behind the host
firewall. After setup succeeds, remove `ALLOW_REMOTE_SETUP` and recreate the
container. Keep the bind-address override only when the signed-in application
must remain reachable from the LAN.

### Setup in four steps

1. **Start the container.** Run `docker compose up -d`, then open <http://localhost:8080/setup>.
2. **Connect Paperless-ngx.** Paste its base URL and an API token (Paperless-ngx → Settings → My API token). Do not add `/api` to the URL. If Paperless runs on the Docker host, use `http://host.docker.internal:<port>` on Docker Desktop or the host's LAN IP on Linux. If both apps share a Docker network, use the Paperless service name.
3. **Choose a model provider.** Pick OpenRouter for the fastest curated start, Ollama to keep everything on your own hardware, or any other supported provider (see below). Add the required key or endpoint.
4. **Create the owner and review the safe start.** Setup starts new installations in **Review first** mode with scheduled scans paused. After sign-in, open **Settings** to choose writable fields, enable a schedule, or switch metadata filing to **Automatic** when representative documents have been verified. Ask Tagvico writes always remain approval-gated.

The first run creates a tiny local admin account, stored in the SQLite database inside the persistent volume.

<details>
<summary><strong>Prefer a single docker run command?</strong></summary>

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

For remote setup, replace the published address with
`-p 0.0.0.0:8080:3000`, set `-e TAGVICO_AI_BIND_ADDRESS=0.0.0.0`, and add
`-e ALLOW_REMOTE_SETUP=yes` temporarily. After setup succeeds, remove the
remote-setup environment value and recreate the container. The named volume
keeps your configuration and data while the setup endpoint returns to its
locked-down default.

</details>

## How it works

The core loop is the Action Center: you (or the Companion, or a family member through Telegram or Discord) turn a Paperless document into an Action Case with an owner, a due date, and checklist steps. The Companion can research permitted documents and prepare changes, but every write becomes a durable proposal that an owner or adult must approve; a deterministic executor then applies it and records the audit trail. Case state is mirrored back to Paperless custom fields so the archive stays the system of record.

The optional metadata filing utility works alongside this: when enabled, Tagvico polls Paperless-ngx for new documents, reads their OCR text and existing metadata, and asks the configured model for a structured filing suggestion. In **Review first** mode, suggestions wait in the durable Review queue until you apply or reject them. In **Automatic** mode, validated values are written directly to the original document. Existing queued suggestions always remain reviewable when you switch modes. Processing history, token metrics, retries, and manual re-runs are available in the web UI.

Owner matching is conservative: optional hint profiles add context, and assignment only happens when the model output agrees with the available Paperless user information.

## Model providers

| Provider | Best for |
|---|---|
| OpenRouter | Curated cloud models with a preset picker (recommended default) |
| Ollama | Fully local inference |
| Ollama Cloud | Hosted Ollama models with an API key |
| OpenAI direct | Native OpenAI access with Flex and Batch pricing |
| OpenCode Go | Go subscription API key and OpenAI-compatible inference gateway |
| GitHub Copilot | Official Copilot SDK, OAuth device login, and account-scoped model discovery |
| OpenAI-compatible | LM Studio, LiteLLM, vLLM, and custom gateways |
| ChatGPT subscription | Optional read-only Codex SDK adapter with stable device login |
| TypeSafe Jev | Closed-list filing with a decision model: only existing tags, correspondents and types, a probability per field, about USD 0.08 per 1,000 documents; no text generation and no Companion |

Provider-specific setup and troubleshooting live in [`docs/providers/`](docs/providers/README.md).

## Cost and processing modes

- **Standard** — process each document immediately. Best for interactive feedback and low-volume setups.
- **OpenAI Flex** — trades latency and guaranteed availability for Batch-level pricing. Available only for supported OpenAI models, selected in the provider step.
- **Batch** — asynchronous, discounted jobs that may take up to 24 hours. Available for OpenAI direct; Tagvico groups all documents discovered in the same scan into one batch.
- **ChatGPT subscription** — sign in directly from Settings with the stable `codex login --device-auth` flow. The official Codex SDK supplies read-only inference; Tagvico does not depend on the experimental app-server and never exposes tokens to the browser.
- **GitHub Copilot subscription** — uses the official SDK with every agent tool denied. Authenticate through the Settings device flow, `npm run auth:copilot`, or a supported token. The dropdown is populated with `listModels()` for the authenticated account.

### Model selection

For routine filing, Tagvico recommends `openai/gpt-5.4-mini` through OpenRouter
or `gpt-5.4-mini` through OpenAI direct. Use `gpt-5.4-nano` for clean,
high-volume documents when cost matters more than edge cases. OpenRouter also
offers `openrouter/free` for a low-stakes trial, but its free-model routing is
intentionally not the reliability default.

OpenAI's GPT-5.6 Sol, Terra, and Luna are included only behind the
`OPENAI_ENABLE_GPT_5_6_PREVIEW=yes` trusted-partner flag. Luna is the preview
recommendation for organizations that actually have access; it is not assumed
to be available to normal API or ChatGPT subscription accounts.

## Environment contract

Copy [`.env.example`](.env.example) when deploying without the setup wizard. Variables are grouped into Paperless connection, runtime security, provider credentials and Codex settings. Values saved in the UI are written to `data/.env`; process-level variables take precedence. Never commit populated secrets. `/health` checks the process and database, while `/api/health` also probes the configured provider and returns `503` when it is degraded.

Set `TAGVICO_WRITE_MODE=review` to queue suggestions or `TAGVICO_WRITE_MODE=automatic` for direct writes. The setup and settings pages expose the same two choices. `DRY_RUN=true/false` remains supported for older deployments, but the explicit write-mode variable takes precedence.

The canonical application variables are `TAGVICO_AI_PORT`, `TAGVICO_AI_HOST_PORT`, `TAGVICO_AI_VERSION`, and `TAGVICO_AI_INITIAL_SETUP`. Their former `ARCHIVISTA_*` names remain supported as deprecated fallbacks for existing deployments and emit a warning when used. Migrate to the `TAGVICO_*` names before a future major version removes the aliases.

### Optional Telegram bot

Set `TELEGRAM_BOT_ENABLED=yes`, provide a BotFather token in
`TELEGRAM_BOT_TOKEN`, and allowlist users with independent Paperless tokens:

```dotenv
TELEGRAM_USERS_JSON=[{"telegramId":"123456789","paperlessToken":"token-for-that-user"}]
```

Unknown users and non-private chats are ignored. Each user is flood-limited
(10 questions/minute, 6 uploads/10 minutes, 12 downloads/minute), so a lost
or compromised phone cannot run up provider costs. Conversation history is
bounded, kept in memory per user, and cleared by `/clear` or a restart.

Users linked to the Action Center via `householdId`/`memberId` also receive
proactive DM reminders for household actions that are overdue or due within
three days — assigned cases go to the assignee, unassigned cases to every
linked member, at most one message per case, user, and day. Set
`TELEGRAM_ACTION_REMINDERS=no` to disable. Search,
downloads, and uploads use the matching user's Paperless token, so Paperless
remains the permission authority. Set
`TELEGRAM_UPLOAD_AUTOMATIC_METADATA=yes` only if Telegram uploads may bypass
the web review queue and write AI-generated metadata immediately.

Telegram chats are not end-to-end encrypted. Questions, uploads, and originals
returned through the bot pass through Telegram. Retrieved OCR text and queries
are also sent to the configured model provider; a local Ollama or compatible
endpoint keeps that AI step local, but does not make Telegram local. Treat
calculated totals as assistant summaries rather than accounting-grade results.

### Optional Discord bot

Set `DISCORD_BOT_ENABLED=yes`, provide an application bot token in
`DISCORD_BOT_TOKEN`, and allowlist users with independent Paperless tokens:

```dotenv
DISCORD_USERS_JSON=[{"discordId":"123456789012345678","paperlessToken":"token-for-that-user"}]
```

**Bot and application setup** (Discord Developer Portal):

1. Create an application at <https://discord.com/developers/applications>.
2. Go to the **Bot** page and create a bot. Copy the bot token into `DISCORD_BOT_TOKEN`.
3. Under **Bot → Privileged Gateway Intents**, disable all three privileged intents.
   Tagvico's Discord bot **does not require Message Content Intent**.
4. Go to **OAuth2 → URL Generator** and select the `bot` and `applications.commands` scopes.
5. Under **Bot Permissions**, select: **Send Messages**, **Read Message History**,
   **View Channels**, **Attach Files**, **Use Slash Commands**.
6. Invite the bot to your server with the generated URL.

**Minimum required scopes:** `bot`, `applications.commands`

Unknown users, bots, webhooks, and other channels are silently ignored. In DMs,
all text, slash commands, and attachments from allowlisted users are processed.
In the optional home channel (`DISCORD_HOME_CHANNEL_ID`), only native slash
commands, bot @-mentions, or replies to the bot that keep the bot mention
enabled are processed; unaddressed
messages are ignored so no privileged Message Content intent is needed.

To copy IDs, enable **User Settings → Advanced → Developer Mode** in Discord,
then right-click a user and choose **Copy User ID**. Right-click the chosen
channel and choose **Copy Channel ID** for `DISCORD_HOME_CHANNEL_ID`.

Conversation history is bounded, kept in memory per Discord user and channel,
and cleared by `/clear` or a restart. Each user is flood-limited
(10 questions/minute, 6 uploads/10 minutes, 12 downloads/minute). Users
linked via `householdId`/`memberId` also receive proactive DM reminders for
household actions that are overdue or due within three days (one message per
case, user, and day); set `DISCORD_ACTION_REMINDERS=no` to disable. Search, downloads, and uploads use the
matching user's Paperless token, so Paperless remains the permission authority.

Document download and approval buttons are bound to the originating Discord
user ID. Attempts by a different user to interact with another user's button
are rejected without any action. Home-channel document downloads are ephemeral.

File uploads must be HTTPS Discord CDN URLs with a sanitized filename and a
size within the 10 MiB default and hard maximum. Set
`DISCORD_UPLOAD_AUTOMATIC_METADATA=yes` only if Discord uploads may bypass
the web review queue and write AI-generated metadata immediately.

Discord chats are not end-to-end encrypted. Questions, uploads, and originals
returned through the bot pass through Discord. Retrieved OCR text and queries
are also sent to the configured model provider. Answers to @mentions and
replies in the home channel are normal channel messages visible to members who
can access that channel; slash-command responses and document downloads there
are ephemeral.

Optional tuning variables: `DISCORD_UPLOAD_TIMEOUT_SECONDS` (default `180`),
`DISCORD_MAX_DOCUMENTS` (default `8`), `DISCORD_HISTORY_TURNS` (default `6`),
`DISCORD_MAX_FILE_BYTES` (default and hard maximum `10485760`). See `.env.example` for all options.

### OCR rescue and failure recovery

Documents with insufficient OCR enter a durable rescue queue when `OCR_ENABLED=yes`. Open **Recovery** to run Mistral OCR, an OpenAI-compatible vision endpoint, or native Ollama vision. Local PDF OCR renders at most `OCR_MAX_PAGES` pages with `pdftoppm`. AI and OCR provider failures are attempted up to three times and then enter **Permanently failed**, so a broken document cannot loop forever.

Activity supports single and bulk rescan, exact restoration of the first metadata snapshot, token and custom-field details, and orphan validation/cleanup. Explicit rescans bypass trigger-tag filters but preserve history and restore snapshots. Documents that should never be processed belong in the permanent **Ignored documents** list; un-ignoring one queues a deliberate rescan.

## Upgrades

1. Check the latest release at <https://github.com/arturict/tagvico-ai/releases>.
2. Update the image tag in `docker-compose.yml` to the new **immutable version tag** shown on the releases page, for example `ghcr.io/arturict/tagvico-ai:3.4.1`. Avoid `:latest` in production: it makes rollback ambiguous and can pull a breaking change unexpectedly.
3. `docker compose pull && docker compose up -d`.

The container is replaceable, while configuration, processing history, the local admin account, encrypted member tokens, and the installation secret live in the `tagvico_ai_data` volume. Back up and restore that volume as one unit; changing or losing the JWT secret makes encrypted member tokens unreadable.

## Troubleshooting

- **Setup page does not load after first start.** Confirm the container is healthy with `docker compose ps` and `docker compose logs tagvico-ai`. The health endpoint is `http://localhost:8080/health`.
- **Cannot reach Paperless-ngx.** Use the "Test connection" button. Do not include `/api`. `localhost` inside the Tagvico container means that container—not your Docker host. Use `host.docker.internal`, the host LAN IP, or a shared Docker-network service name as described above.
- **Model calls fail.** Verify the API key and model slug in Settings. For Ollama and OpenAI-compatible endpoints, confirm the host is reachable from inside the container (`docker exec -it tagvico-ai curl ...`).
- **Batch jobs not completing.** Batch mode may take up to 24 hours and is supported for OpenAI direct. Switch to Standard or Flex in Settings to process immediately.
- **Forgot the local admin password.** Stop the container, back up the volume, and recreate the admin by resetting setup state, or start a fresh `tagvico_ai_data` volume.

## Security and privacy

With Ollama or another endpoint on your network, OCR text and metadata can remain on infrastructure you control. When you select OpenAI, OpenRouter, Ollama Cloud, OpenCode Go, GitHub Copilot, or a subscription runtime, the document content required for classification is sent to that provider. Secrets are stored in `data/.env` and are not written to the processing database.

The container drops Linux capabilities and enables `no-new-privileges`. See [SECURITY.md](SECURITY.md) and [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for the full policies.

Anonymous installation analytics are optional and disabled by default. When
enabled, Tagvico sends one coarse daily heartbeat with rotating identifiers;
the exact payload can be previewed in Settings. It never includes document
content or metadata, Paperless URLs, usernames, keys, errors, or exact document
counts.

## Support the project

If Tagvico saves you filing time, [star it on GitHub](https://github.com/arturict/tagvico-ai)—it helps other Paperless-ngx users discover the project. Bug reports, deployment notes, and sanitized model comparisons are equally valuable.

## Development

```bash
git clone https://github.com/arturict/tagvico-ai.git
cd tagvico-ai
npm ci
npm run dev        # web process on 3000
npm run dev:backend # second terminal, internal backend on 3001
npm run typecheck
npm run lint
npm test
```

The development server listens on `http://localhost:3000`. The application source is fully typed with strict TypeScript checks; `npm run typecheck` rejects new type debt.

## Contributing

Bug reports, feature requests, and pull requests are welcome. The issue chooser asks only for the information needed to reproduce or evaluate a change, and the pull-request template includes a short verification checklist. See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow. For security disclosures, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

See [docs/STATUS.md](docs/STATUS.md) for the currently published v3 compatibility policy and stable deployment recommendations.

## License

[MIT](LICENSE)
