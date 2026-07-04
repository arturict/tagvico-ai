# Model Providers

Tagvico AI ships with provider adapters for multiple local and hosted backends. Pick one in the
setup wizard or by setting `AI_PROVIDER` in `data/.env`.

| Provider     | `AI_PROVIDER` value | Setup guide                          |
| ------------ | ------------------- | ------------------------------------ |
| OpenAI       | `openai`            | [openai.md](openai.md)               |
| OpenRouter   | `openrouter`        | [openrouter.md](openrouter.md)       |
| Ollama       | `ollama`            | [ollama.md](ollama.md)               |
| LM Studio    | `custom`            | [lmstudio.md](lmstudio.md)           |
| Azure OpenAI | `azure`             | [azure.md](azure.md)                 |
| Anthropic    | `anthropic`         | Settings/onboarding                  |
| Codex        | `codex`             | [codex.md](codex.md)                 |
| Compatible   | `compatible`        | [openai-compatible.md](openai-compatible.md) |

LM Studio and any other endpoint that speaks the OpenAI Chat Completions API
are configured through the same `custom` provider — see
[lmstudio.md](lmstudio.md) for the OpenAI-compatible setup pattern.

## Switching providers

The provider is selected at runtime by the `AI_PROVIDER` variable. To
swap providers, edit `data/.env` (or use the settings page), restart the
container, and the new adapter takes over on the next polling cycle. Each
provider keeps its own configuration namespace, so you can keep the env
vars for several providers in place and switch by changing one line.
