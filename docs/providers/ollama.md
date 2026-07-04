# Ollama

Ollama runs open-weight language models locally and exposes an
OpenAI-compatible HTTP API. This is the default choice when you want
documents to stay entirely inside your own network.

## Required env vars

```env
AI_PROVIDER=ollama
OLLAMA_API_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.1:8b-instruct-q5_K_M
```

`OLLAMA_API_URL` is the base URL of the Ollama daemon, **without** a
trailing `/api`. If Ollama runs on the same host as the Tagvico
container, `http://host.docker.internal:11434` is the correct value on
Docker Desktop. On Linux without Docker Desktop, use
`http://172.17.0.1:11434` (the Docker bridge gateway) or run both
services on the same user-defined network and use the Ollama container's
service name.

`OLLAMA_MODEL` must be a model you have already pulled:

```bash
ollama pull llama3.1:8b-instruct-q5_K_M
ollama list
```

## Privacy and cost

Document content never leaves the machine running Ollama — the request
goes from the Tagvico container to the Ollama daemon over the local
network (or the Docker bridge). The trade-off is hardware: a usable
8B-parameter model needs roughly 8 GB of RAM and a modern CPU or Apple
Silicon; 70B-class models need 40 GB+ of VRAM. There is no per-token
cost beyond the electricity to run the machine, which makes Ollama the
cheapest option for large archives.

## Troubleshooting

- **`ECONNREFUSED 127.0.0.1:11434`** — the container cannot reach the
  Ollama daemon. The most common cause is using `127.0.0.1` or
  `localhost`, which inside the container points at the container, not
  the host. Use `host.docker.internal` (Docker Desktop) or the bridge
  IP (Linux).
- **`model not found`** — the value of `OLLAMA_MODEL` is not in the
  output of `ollama list`. Pull it first with `ollama pull <name>`.
- **`connection reset` during long runs** — Ollama unloaded the model
  after idle timeout. Set `OLLAMA_KEEP_ALIVE=-1` in the Ollama
  environment, or shorten the Tagvico `SCAN_INTERVAL` so requests
  keep the model warm.
