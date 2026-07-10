# Privacy and security

Tagvico reads OCR text and metadata from Paperless-ngx. A local Ollama or
compatible endpoint can keep that processing on infrastructure you control.
When you select a hosted provider, the document content required for
classification is sent to that provider under its terms.

## Deployment boundaries

- Provider secrets are stored in `data/.env` and are not written to the
  processing database.
- The container drops Linux capabilities and enables `no-new-privileges` in the
  recommended Compose configuration.
- Use a dedicated Paperless API token and only expose the Tagvico web port to
  trusted networks.
- Start with Review first and a controlled tag vocabulary.
- Back up the data volume before schema upgrades.

## Screenshot policy

Documentation screenshots must be inspected as final rendered pixels before
commit. They must not show API keys, tokens, real document text, personal names,
email addresses, account identifiers, private hostnames, or internal URLs.
Empty states, synthetic metadata, generic tags, and non-identifying aggregate
counts are acceptable.

The screenshots in this v2 guide use generic tag labels and sanitized document
state. They demonstrate product behavior without exposing source documents or
credentials.
