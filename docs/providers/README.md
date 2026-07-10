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
| ChatGPT subscription | `codex`       | [codex.md](codex.md)                 |
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
| OpenAI direct | `gpt-5.4-mini` | Stable quality/cost balance ($0.75/$4.50 per 1M input/output tokens) | `gpt-5.4-nano` is cheaper ($0.20/$1.25) for clean bulk scans. GPT-5.6 Luna is $1/$6 and the preview recommendation, but the family is deliberately gated to approved organizations. |
| OpenRouter | `openai/gpt-5.4-mini` | Best default when you want routing/provider choice | `openrouter/free` is useful for a trial, but routes among free models and should not be used as a reliability default. |
| GitHub Copilot | Account dropdown | Uses the official SDK catalog for the authenticated plan | Device login works from Settings or `npm run auth:copilot`; only models returned by `listModels()` are shown. |
| Ollama local | Your tested local instruct model | Privacy and predictable local operation | Quality depends on your hardware/model; validate structured JSON before enabling writes. |
| Ollama Cloud | `gpt-oss:20b-cloud` | Lightest published cloud usage level; no local GPU | Free is light use; Pro is currently $20/month and 50× Free usage. Cloud use sends document text to Ollama. |
| OpenCode Go | `deepseek-v4-flash` | Lowest-cost, highest-throughput Go starting point | `kimi-k2.7-code` or `glm-5.2` are better candidates for harder documents. Go is currently $5 first month, then $10/month. |
| ChatGPT subscription | Account dropdown | Experimental, private low-volume use | The Codex app-server's visible `model/list` result is authoritative for the signed-in plan; this is not a general ChatGPT inference API or API SLA. |

For GPT-5.6 preview organizations only, set
`OPENAI_ENABLE_GPT_5_6_PREVIEW=yes` and select `gpt-5.6-luna`,
`gpt-5.6-terra`, or `gpt-5.6-sol`. Luna is exposed as the preview recommendation
for accounts that actually have access; it is intentionally not the global
default.

Pricing and availability above were checked on 2026-07-09 against provider-owned
sources: [OpenAI GPT-5.4 Mini/Nano](https://openai.com/index/introducing-gpt-5-4-mini-and-nano/),
[OpenAI GPT-5.6 preview](https://help.openai.com/en/articles/20001325-a-preview-of-gpt-5-6-sol-terra-and-luna),
[GitHub Copilot model pricing](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing),
[OpenRouter free router](https://openrouter.ai/docs/guides/routing/routers/free-router),
[Ollama pricing](https://ollama.com/pricing), and
[OpenCode Go](https://opencode.ai/docs/go/). Recheck them before each release;
these catalogs and plan terms are not part of Tagvico's compatibility contract.
