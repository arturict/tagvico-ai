# Archivista AI

AI autopilot for [Paperless-ngx](https://docs.paperless-ngx.com/).

Archivista AI is a ground-up document filing extension that connects to your
Paperless-ngx instance, analyzes OCR content and metadata, then writes useful
filing information back into Paperless:

- titles
- tags
- correspondent
- document type
- document date/language
- custom fields
- Paperless owner/person assignment

It is built for fast setup: scan for Paperless, paste one API token, choose a
model provider, and let it process new documents.

## Model Providers

- OpenAI Direct: `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.3`
- OpenRouter with `company/model` slugs
- Ollama
- LM Studio / OpenAI-compatible APIs
- Azure OpenAI

## Run With Docker

```yaml
services:
  archivista-ai:
    image: ghcr.io/arturict/archivista-ai:latest
    ports:
      - "8080:3000"
    environment:
      PAPERLESS_API_URL: http://paperless-ngx:8000
      PAPERLESS_AI_PORT: "3000"
    volumes:
      - ./data:/app/data
```

Open `/setup`, scan for Paperless-ngx, paste your Paperless API token, and save.

## Fast Onboarding

Archivista writes a non-secret setup snapshot to:

```text
data/.onboarding
```

Secrets stay in `data/.env`.

## Person Assignment

Archivista can assign documents to Paperless users automatically. It matches OCR
content and AI output against Paperless user profile data (`username`, name,
email). Optional hints can be added:

```text
alex: Alex M., private invoices, health insurance
finance: accounting team, vendor bills, receipts
```

## Development

```bash
npm install
npm start
```

## License

MIT
