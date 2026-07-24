# AI tagging and metadata for Paperless-ngx

Tagvico AI is a self-hosted companion for people who want more control over
automatic Paperless-ngx metadata. It reads OCR text through the Paperless API,
asks a local or hosted model for structured fields, validates the result, and
either queues a reviewable diff or writes approved fields back.

Every new unprocessed document is eligible by default. Trigger tags are an
optional opt-in filter, not a setup requirement. Leaving the trigger-tag field
empty scans all new documents on the configured schedule.

## When Tagvico is useful

- You want local AI tagging with Ollama, LM Studio, vLLM, or another compatible
  endpoint.
- You need titles, dates, correspondents, document types, languages, custom
  fields, or owner assignment in addition to tags.
- You want generated values constrained to an existing vocabulary.
- You want to inspect suggestions before changing Paperless documents.
- You need history, retry queues, metadata restoration, and visible token/cost
  signals around the classification workflow.

Paperless-ngx's own matching remains the simpler choice when deterministic
rules or its built-in learning already classify an archive reliably. Tagvico
adds value when documents vary, several fields must be extracted together, or
the operator wants to choose and evaluate a modern language model.

## Local and hosted privacy boundaries

With Ollama or another endpoint on your network, OCR text can remain on
infrastructure you control. Selecting OpenAI, OpenRouter, Ollama Cloud, OpenCode Go, or
another hosted service sends the document content required for classification
to that provider. Tagvico does not proxy document content through a
Tagvico-operated cloud.

Optional installation analytics are off by default and never contain document
content or metadata. See [Privacy and security](./privacy).

## A safe evaluation workflow

1. Install with an immutable image tag and back up the data volume.
2. Start in **Review first** with synthetic or non-sensitive documents.
3. Enable a small controlled tag vocabulary.
4. Keep the default maximum of four tags, then reduce the vocabulary if the
   model repeatedly selects overlapping concepts.
5. Add a Custom filing prompt only for archive-specific conventions; use the
   Advanced system prompt only when the maintained general prompt is
   insufficient.
6. Test 20–50 representative documents and record correctness per field.
7. Move only reliable fields or document types to Automatic mode.

Use the same test set when comparing providers. Count missing and incorrect
fields rather than judging the model's prose. The [provider guide](./providers)
contains cost-conscious starting points.
