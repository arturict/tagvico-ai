# Community launch drafts

## r/selfhosted

Tagvico AI is less than three months old, so it belongs in the weekly New Project Megathread rather than a standalone post.

**Project Name:** Tagvico AI

**Repo:** https://github.com/arturict/tagvico-ai

**Description:** Tagvico AI is a self-hosted companion for Paperless-ngx that turns OCR text into useful filing metadata: titles, tags, correspondents, document types, dates, languages, custom fields, and optional owner assignments. I built it because I wanted guided setup and one place to configure local or hosted model providers without hand-wiring the classification workflow.

It supports Ollama for local processing, plus OpenAI, OpenRouter, Azure OpenAI, and OpenAI-compatible endpoints such as LM Studio. The web UI covers setup, processing history, manual re-runs, and provider settings. Metadata is written back to the original Paperless document; a local SQLite database tracks runs and retries.

**Deployment:** Docker Compose; one container and a persistent data volume. Connect it to an existing Paperless-ngx instance, then finish setup in the browser. MIT licensed.

**Privacy:** With Ollama or another endpoint on your network, OCR text and metadata stay local. Hosted providers receive the document content needed for classification, so that choice is explicit.

**AI involvement:** AI coding tools assisted with parts of implementation, review, documentation, and testing. The application itself uses the model provider you configure for document classification.

I would especially value feedback on owner assignment, provider setup, and the guardrails you would want before letting an AI update metadata automatically.

## r/Paperlessngx

**Title:** I built a Paperless-ngx companion for AI metadata and owner assignment — looking for workflow feedback

I have been working on Tagvico AI, a self-hosted companion that reads Paperless OCR text and writes back a title, tags, correspondent, document type, date, language, custom fields, and—optionally—an owner.

The part I most wanted to improve was setup: connect an existing Paperless instance in a browser, choose Ollama or a hosted/OpenAI-compatible provider, then inspect history and manually re-run documents from the UI. It runs as one Docker container and uses SQLite for processing history and retries.

Repo: https://github.com/arturict/tagvico-ai (MIT)

Privacy boundary: local Ollama/OpenAI-compatible endpoints keep classification on your network; choosing OpenAI, OpenRouter, or Azure sends the OCR content used for classification to that provider.

I am looking for Paperless-specific feedback rather than stars: should new metadata default to a review queue, should generated values be limited to existing tags/correspondents/types, and what would make owner assignment feel safe enough for a household installation?

Disclosure: I am the author. AI coding tools assisted with parts of implementation, review, documentation, and testing, and the app itself uses the configured model for classification.
