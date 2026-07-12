# Community launch kit

Use these drafts sequentially, at least 24 hours apart, after checking each
community's current self-promotion rules. Stay available to answer replies.

## r/selfhosted / New Project thread

**Title:** I built a self-hosted, review-first AI filing companion for Paperless-ngx

I built Tagvico AI to reduce the repetitive cleanup after documents arrive in
Paperless-ngx. It reads the OCR text Paperless already has and proposes titles,
tags, correspondents, document types, dates, languages, custom fields, and
optional owner assignments.

The part I care about most is control: suggestions can wait in a durable review
queue, generated tags can be constrained to a controlled vocabulary, and local
Ollama or an OpenAI-compatible endpoint can keep classification on your own
network. Hosted providers are optional and explicit.

Version 2.0 is stable, runs in Docker, and is MIT licensed. Pin the release,
back up the volume, and start in Review-first mode.

GitHub: https://github.com/arturict/tagvico-ai

I would especially value feedback on installation friction and which metadata
guardrails work in real household or small-office archives.

## r/Paperlessngx

**Title:** Tagvico AI: review-first AI metadata for Paperless-ngx — looking for workflow feedback

I maintain Tagvico AI, an independent self-hosted companion for Paperless-ngx.
It proposes structured filing metadata from existing OCR text and either queues
the diff for approval or writes validated fields automatically.

Current features include controlled tag groups, metadata restoration, OCR
rescue, processing history, custom fields, owner assignment, local Ollama, and
optional hosted providers. No document content is routed through a
Tagvico-operated service.

Repository and Compose example: https://github.com/arturict/tagvico-ai

Version 2.0 is the first stable release. I would still value blunt
Paperless-specific feedback: does the review queue fit your workflow, which
fields should default to existing values only, and what would make you trust
automatic mode?

## Show HN

**Title:** Show HN: Tagvico AI – self-hosted, reviewable AI metadata for Paperless-ngx

Tagvico AI connects to an existing Paperless-ngx installation, reads OCR text,
and proposes structured document metadata. The main design goal is a visible
safety boundary: reviewable diffs, controlled vocabularies, restoration, local
model support, and optional hosted providers instead of a mandatory cloud.

It is TypeScript, Docker, SQLite, and MIT licensed. Version 2.0 is stable, and I
am looking for feedback from people running real document archives.

https://github.com/arturict/tagvico-ai

## Provider communities

Adapt the short draft below for Ollama, OpenRouter, or compatible-gateway
communities. Do not cross-post identical text or imply provider endorsement.

> I am testing **[provider/model]** for structured Paperless-ngx metadata in
> Tagvico AI. The useful question is not prose quality but field accuracy across
> titles, dates, tags, correspondents, and custom fields. If you run this model
> for document extraction, I would value sanitized examples of where it fails.
> Project: https://github.com/arturict/tagvico-ai

## Visual asset checklist

- 60–90 second screen recording from a representative installation.
- Show arrival → suggestion → diff review → Paperless result.
- Use synthetic documents and inspect every final frame for identifiers.
- Export one short GIF for the README and two captioned stills for posts.
