# Ollama Cloud

Ollama Cloud uses the same Ollama API shape as a local instance, but authenticates
requests sent to `https://ollama.com` with an Ollama API key.

## Setup

1. Create an API key in your Ollama account.
2. In Tagvico Settings, choose **Ollama Cloud**.
3. Paste the key and choose a cloud model available to your account.
4. Save to validate a small generation request.

Equivalent environment configuration:

```dotenv
AI_PROVIDER=ollama-cloud
OLLAMA_CLOUD_API_KEY=...
OLLAMA_CLOUD_API_URL=https://ollama.com
OLLAMA_CLOUD_MODEL=gpt-oss:20b-cloud
```

`gpt-oss:20b-cloud` is a practical low-cost starting point when your account
offers it; use a larger cloud model only after checking the quality on your own
documents. Cloud processing sends OCR text and optional configured metadata to
Ollama, so it is not the privacy-equivalent of a local instance.

Official reference: [Ollama API authentication](https://docs.ollama.com/api/authentication).
