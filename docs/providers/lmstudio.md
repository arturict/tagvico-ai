# LM Studio / OpenAI-compatible

This page covers LM Studio and any other self-hosted endpoint that
exposes the OpenAI Chat Completions API. Examples include vLLM,
text-generation-inference, llama.cpp's `server` mode, LocalAI, and
custom gateways. They all share the same Tagvico adapter, exposed
as the `custom` provider.

## Required env vars

```env
AI_PROVIDER=custom
CUSTOM_BASE_URL=http://host.docker.internal:1234/v1
CUSTOM_MODEL=lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF
CUSTOM_API_KEY=lm-studio
```

`CUSTOM_BASE_URL` is the full base URL including the `/v1` prefix that
OpenAI-compatible servers expect. The exact value depends on the
software:

- **LM Studio (local server tab):** `http://host.docker.internal:1234/v1`
- **vLLM:** `http://host.docker.internal:8000/v1`
- **llama.cpp server:** `http://host.docker.internal:8080/v1`
- **LocalAI:** `http://host.docker.internal:8080/v1`

`CUSTOM_API_KEY` can be any non-empty string if the server has auth
disabled, which is the default for LM Studio's local server. If you
turned on a token, paste the token here.

`CUSTOM_MODEL` must be a model id the server actually exposes. LM
Studio shows the exact id in the Developer tab of the local server
panel; vLLM prints it in the server log at startup.

## Privacy and cost

The provider runs on the same hardware you point `CUSTOM_BASE_URL` at,
so document content stays on your network. Cost is limited to
electricity and the host machine's wear. Hardware requirements are the
same as Ollama (see [ollama.md](ollama.md)) plus the host overhead of
the inference server itself. A modest desktop with 16 GB of unified
memory can comfortably run an 8B-parameter model; 70B-class models
require 40 GB+ of VRAM.

## Troubleshooting

- **`404 model not found`** — the value of `CUSTOM_MODEL` does not
  match any model loaded by the server. Open the server's UI
  (LM Studio's Developer tab, vLLM's `/v1/models` endpoint) and copy
  the id exactly, including capitalization and slashes.
- **`ECONNREFUSED`** — the container cannot reach the host. Use
  `host.docker.internal` on Docker Desktop, the bridge IP
  (`172.17.0.1`) on Linux, or run the inference server on the same
  Docker network as Tagvico and use its service name.
- **Responses are empty or malformed JSON** — the model is too small
  or not instruction-tuned. Switch to an instruct/chat-tuned model
  such as `Meta-Llama-3.1-8B-Instruct` or `Qwen2.5-7B-Instruct`.
  Plain base models do not produce reliable structured output.
