# Model Providers

Tagvico AI ships with provider adapters for multiple local and hosted backends. Pick one in the
setup wizard or by setting `AI_PROVIDER` in `data/.env`.

| Provider     | `AI_PROVIDER` value | Setup guide                          |
| ------------ | ------------------- | ------------------------------------ |
| OpenAI       | `openai`            | [openai.md](openai.md)               |
| OpenRouter   | `openrouter`        | [openrouter.md](openrouter.md)       |
| Ollama       | `ollama`            | [ollama.md](ollama.md)               |
| Ollama Cloud | `ollama-cloud`      | [ollama-cloud.md](ollama-cloud.md)   |
| OpenCode Go  | `opencode`          | [opencode.md](opencode.md)           |
| GitHub Copilot | `copilot`          | [copilot.md](copilot.md)             |
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

## Starting points for cost and quality

Model catalogs and subscription entitlements change frequently. Treat these as
safe starting points for document filing, then validate against a representative
set of your own documents before enabling automatic writes.

| Provider | Start with | Use when | Important caveat |
| --- | --- | --- | --- |
| OpenAI direct | `gpt-5.4-mini` | Default quality/cost balance | `gpt-5.4-nano` is better for clean bulk scans; GPT-5.6 Sol/Terra/Luna are trusted-partner preview models and are deliberately gated. |
| OpenRouter | `openai/gpt-5.4-mini` | Best default when you want routing/provider choice | `openrouter/free` is useful for a trial, but routes among free models and should not be used as a reliability default. |
| GitHub Copilot | `gpt-5.4` | A plan already includes compatible access | Claude Haiku 4.5 is often a lower-multiplier option; available models and quotas are plan-controlled. |
| Ollama local | Your tested local instruct model | Privacy and predictable local operation | Quality depends on your hardware/model; validate structured JSON before enabling writes. |
| Ollama Cloud | `gpt-oss:20b-cloud` | No local GPU, Ollama API workflow | Cloud use sends document text to Ollama and availability is account-controlled. |
| OpenCode Go | A model listed by your Console account | Existing OpenCode Go users | The Console controls which model IDs and quotas your service key can use. |
| Codex subscription | `gpt-5.4-mini` | Experimental, private low-volume use | This is Codex-managed access, not a general ChatGPT inference API or API SLA. |

For GPT-5.6 preview organizations only, set
`OPENAI_ENABLE_GPT_5_6_PREVIEW=yes` and select `gpt-5.6-luna`,
`gpt-5.6-terra`, or `gpt-5.6-sol`. Luna is exposed as the preview recommendation
for accounts that actually have access; it is intentionally not the global
default.
