# Archivista AI - looking for testers, not stars

## The problem

I run Paperless-ngx at home. OCR does a great job of turning scans into text, but it does not give you a useful archive. Every document still has to be reviewed by hand: which correspondent is it, which tags, which document type, which custom field, which owner. After the first hundred documents that stops being fun. I kept wishing for a small self-hosted tool that could draft those suggestions from the OCR text and then let me approve them before anything is written back to Paperless. So I built one.

## What it is

Archivista AI is a self-hosted AI filing layer for [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx). It watches your Paperless instance, drafts metadata (title, correspondent, tags, document type, custom fields, owner) for new documents, shows you the diff in a review screen, and only writes back to Paperless after you approve. It runs in Docker, keeps your data on your machine, and is meant to feel boring and predictable rather than magical.

## Honest early-stage caveats

I want to be upfront about where this project actually is:

- The current release is **v1.0.0**. It works for me and for a small number of testers, but it does not have a long production track record yet.
- I am the **sole maintainer**. There is no team, no company, and no paid support behind it. Response times depend on one person's evenings and weekends.
- There is **no formal security audit**, no SOC2, no compliance story. Treat it like any other young self-hosted tool.
- Backups and upgrades are **your responsibility**, the same as for Paperless itself.
- I am explicitly **not** claiming other Paperless AI tools are abandoned or unmaintained. If something else fits your workflow better, use that. This is offered as a different take, not a replacement.

## Feature highlights

- **Provider choice.** OpenAI, OpenRouter, Ollama, any OpenAI-compatible endpoint (LM Studio, vLLM, llama.cpp server), and Azure. Pick the one that matches your privacy and cost needs.
- **Owner assignment.** Suggests a document owner from the configured list, with confidence so a low-confidence guess never silently misfiles a document.
- **Dry-run review.** Every suggestion is shown in a review screen with the proposed field-by-field diff. You approve, reject, or apply selected fields. Nothing is written to Paperless until you say so.
- **Audit history.** Every model call, prompt version, and applied change is recorded per document so you can see exactly what was changed and why.
- **Custom fields and multilingual OCR normalization.** Paperless custom fields are handled with type-aware validation, and German/French OCR text is normalized for matching while the original spelling is preserved in the model prompt.
- **Paperless-native.** Uses the Paperless REST API. No database to manage, no schema migrations, no second source of truth for your archive.

## Try it

The fastest way to try it is Docker Compose:

```yaml
services:
  archivista-ai:
    image: ghcr.io/arturict/archivista-ai:latest
    container_name: archivista-ai
    network_mode: bridge
    restart: unless-stopped
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges=true
    environment:
      - PUID=1000
      - PGID=1000
      - PAPERLESS_AI_PORT=${PAPERLESS_AI_PORT:-3000}
    ports:
      - "3000:${PAPERLESS_AI_PORT:-3000}"
    volumes:
      - archivista_ai_data:/app/data

volumes:
  archivista_ai_data:
```

Set your Paperless URL and API token, pick a provider in the settings page, and run the consume-mode watcher. The full setup guide (including per-provider instructions for OpenAI, OpenRouter, Ollama, and local OpenAI-compatible endpoints) is in the repo.

GitHub: <https://github.com/arturict/archivista-ai>

## What I need from testers

I would rather have ten people running it for a month and giving honest feedback than a thousand stars. Specifically:

1. **Real workflows.** Try it on your actual archive for at least a week. Which suggestions are right, which are confidently wrong, and which are missing? File the bad ones as issues with the document type, model, and a redacted excerpt of the OCR text.
2. **Provider notes.** Tell me which provider you picked and why (cost, privacy, quality, latency). A short paragraph in a GitHub issue is perfect. I want to write better provider setup docs from real experience, not assumptions.
3. **Edge cases.** Custom fields you wish were supported, document types that misclassify, owners that get misassigned, languages not yet covered, things that broke. Small reproducible reports are worth more than long speculation.

Issues, PRs, and skeptical questions are all very welcome.

## Disclosure

Some copy in this repo was drafted with AI assistance and reviewed by the maintainer. The code, configuration, and acceptance criteria are the maintainer's responsibility; AI assistance was used for editing, summarization, and the occasional structural pass over documentation drafts. If a community rule you post under requires a different wording, please tell me and I will adjust.
