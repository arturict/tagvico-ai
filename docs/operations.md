# Operations and recovery

The `/operations` page combines OCR rescue, terminal failures, and graceful scan cancellation.

## OCR configuration

```dotenv
OCR_ENABLED=yes
OCR_PROVIDER=mistral # mistral, compatible, or ollama
OCR_API_URL=https://api.mistral.ai/v1
OCR_API_KEY=replace-me
OCR_MODEL=mistral-ocr-latest
OCR_MAX_PAGES=20
OCR_TIMEOUT_MS=120000
```

For local providers, set `OCR_PROVIDER=ollama` for `/api/chat` or `OCR_PROVIDER=compatible` for `/v1/chat/completions`. PDF pages are rendered inside the container with Poppler and processed sequentially.

Additional controls:

```dotenv
MIN_CONTENT_LENGTH=10
AI_MAX_RETRIES=3
IGNORE_TAGS=never-ai,private
TAG_CACHE_TTL_SECONDS=300
RECONCILIATION_ENABLED=yes
RECONCILIATION_INTERVAL=0 * * * *
ALLOW_REMOTE_SETUP=no
COOKIE_SECURE_MODE=auto # auto, always, or never
TRUST_PROXY=no
CORS_ORIGINS=https://tagvico.example.com
```

Interrupted OCR jobs return to `pending` at startup. Terminal failures require an explicit reset. Scheduled reconciliation removes local history, snapshots, metrics, and queue entries only when the document no longer exists in Paperless-ngx.

Before schema upgrades, Tagvico checkpoints SQLite and creates a timestamped `data/documents.db.pre-migration-*.bak` file.
