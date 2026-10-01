# ChatGPT plan (Sign in with ChatGPT)

`AI_PROVIDER=chatgpt` lets an eligible ChatGPT **Plus or Pro** plan pay for
document filing, the Companion, tag unification and TypeSafe titles. There is
no API key: you sign in with ChatGPT once and allow Tagvico to use your plan.
It uses OpenAI's official
[Sign in with ChatGPT](https://developers.openai.com/siwc) flow for
open-source apps, released on 2026-09-29.

## What you need

- A ChatGPT Plus or Pro plan. Free accounts can sign in but cannot use their
  plan for inference; Tagvico reports that and does not fall back to anything
  else.
- A browser on any machine. Tagvico itself can run anywhere, including a
  container on a home server.

## Sign in

1. Open **Settings → AI models**, choose **ChatGPT plan** and select
   **Continue with ChatGPT**. (During first-run setup, choose **ChatGPT plan**
   in the provider step.)
2. A ChatGPT tab opens. Sign in, pick the workspace, and allow Tagvico to use
   your ChatGPT plan.
3. ChatGPT then sends the tab to `http://127.0.0.1:1455/auth/callback?...`,
   which does not load. That is expected: the address is meant for an app on
   the same computer, and Tagvico usually runs somewhere else.
4. Copy the full address from that tab, paste it into Tagvico and select
   **Finish sign-in**.
5. Choose a model from the list your plan offers. Tagvico preselects GPT-6
   Luna, the lightest current tier, because filing is frequent and Plus shares
   its usage limit across apps. A plan can answer to models its list does not
   show: on 2026-10-01 a Plus plan listed `gpt-6-astra`, `gpt-5.6-sol`,
   `gpt-5.6-terra`, `gpt-5.6-luna` and `gpt-5.5`, but answered requests to the
   unlisted `gpt-6-luna`. For each of GPT-6 Luna (`gpt-6-luna`), GPT-6 Sol
   (`gpt-6-sol`) and GPT-6.1 Sol (`gpt-6.1-sol`) that the list lacks, Tagvico
   sends one tiny request (about 16 tokens) at most once a week per account,
   all three in parallel, and remembers the results. Only the models that
   answered are added to the picker. GPT-6 Luna stays the preselected model
   when it is available; otherwise Tagvico preselects the lightest listed tier.

Only Tagvico, which holds the PKCE verifier for that sign-in attempt, can
exchange the code in that address, and the code is single-use and short-lived.
Paste it into nothing else.

## Usage and limits

Requests count toward your ChatGPT plan; connecting Tagvico does not add
usage. On Plus, the five-hour usage limit is shared with every other app that
uses your plan. Under [ChatGPT Settings → Usage](https://chatgpt.com/settings/usage)
you can see Tagvico's usage, set a limit just for it, or disconnect it; the
**Manage usage** button in Settings links there. When a limit is reached,
filing stops with a message instead of switching to another provider. A large
backlog is better processed with an API provider or locally.

## What is stored

Tagvico stores the issued client ID, the account's email and name, and the
OAuth tokens in `data/chatgpt/auth.json` (owner-only permissions), plus a
random installation ID in `data/chatgpt/host.json`, and the weekly results of
the unlisted-model checks in `data/chatgpt/models.json`. Tokens never reach the
browser. Access tokens last an hour and are renewed automatically; the renewal
token stays valid for 30 days after each renewal. **Sign out** revokes the
session at OpenAI and deletes the tokens; the registration is kept so the next
sign-in does not create a second Tagvico entry in ChatGPT.

Signing in does not give Tagvico your ChatGPT conversations or memory. Document
text you file is sent to OpenAI, with `store: false`.

## Limits of the preview

OpenAI's preview accepts only streaming Responses API requests without
temperature, output-token limits or stored conversations; Tagvico sends
exactly that. Images, file search and hosted tools are not used. Reasoning
effort is passed through when you choose one.

## How the Companion uses the plan

The Companion chat runs on the plan exactly as it does on the OpenAI API: the
model decides itself which tools to call (searching documents, listing
actions, reading a document, proposing changes for your approval), receives the
results, and answers. Sources are limited to documents the tools returned, and
every change still waits for your approval.

Technically, `chatgpt` is an AI SDK runtime (`createOpenAI` with the Responses
API and `https://api.openai.com/v1`, `src/lib/server/agent/model-runtime.ts`).
A custom `fetch` (`services/chatgptPlanFetch.ts`) takes the plan access token
for every request (renewing it once after a 401), rewrites the request body to
the preview contract (`store: false`, `stream: true`, no `temperature` or
`max_output_tokens`, system and developer messages moved into `instructions`,
function tools and `tool_choice` kept) and turns plan errors, including those
inside the event stream, into the messages listed below. The SDK covers the
contract, so no hand-written tool loop is needed. With `store: false` the SDK
requests encrypted reasoning items and sends them back between tool steps. If
the plan ever refuses one of its optional hints (`include`, `parallel_tool_calls`,
caching or service-tier fields), the request is repeated once without it.

Codex and Copilot cannot call tools themselves. Their chat goes through a
guarded text adapter: a keyword planner (with a model-planned call first)
chooses the tools. Everything except small talk gets at least a search, and
questions about deadlines, to-dos, tasks, payments, bills or "this week" (in
English and German) list the open actions.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_PROVIDER` | | `chatgpt` to make it the filing provider |
| `CHATGPT_MODEL` | empty | Model slug from your plan's list; empty picks GPT-6 Luna when the plan answers to it, else the lightest listed tier |
| `CHATGPT_TIMEOUT_MS` | `120000` | Per-request timeout |

Sign-in itself cannot be configured through environment variables; use
Settings.

## Troubleshooting

| Message | Meaning |
| --- | --- |
| "belongs to a different sign-in attempt" | The pasted address is from an older tab. Start again and paste the address from the new tab. |
| "plan usage was not allowed" | Consent for plan usage was declined. Sign in again and allow it. |
| "not available for this account or workspace" | The plan or workspace is not eligible (for example a Free plan or a workspace policy). |
| "reached a ChatGPT usage limit" | The plan's or Tagvico's own limit is used up. Check ChatGPT Settings → Usage. |
| "expired or was disconnected" | The renewal token expired or Tagvico was disconnected in ChatGPT. Sign in again. |

## Compared with the Codex adapter

The older `codex` provider signs in through the bundled Codex CLI and runs
requests through the Codex runtime. It stays in maintenance mode for existing
installations. New installations should use `chatgpt`.
