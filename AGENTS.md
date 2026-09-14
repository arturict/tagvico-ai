# Repository agent instructions

## Astra working defaults

These instructions are tuned for GPT-6 Astra. They guide execution; they do not
change the selected runtime model or expand access and external-action authority.

- Infer the intended outcome from the full conversation. Treat actionable
  requests such as “can you fix” as authorization to do the scoped work. Continue
  through implementation and verification; answer pure advice questions as advice.
- Resolve routine choices from evidence and state material assumptions. Ask only
  when an unresolved answer changes scope, correctness, cost, or authority.
  Continue independent work while waiting; incorporate steering without restarting.
- Complete authorized preparation before seeking final approval. Reuse earlier
  authorization; preserve the explicit deployment, communication, purchase,
  privacy, and destructive-action limits below. Do not invent permission gates.
- User instructions outrank skill guidelines, subject to system/developer rules.
  If a skill blocks progress, link its exact `SKILL.md`, quote the relevant rule,
  and explain the concrete conflict; do not present an interpretation as a rule.
- Delegate independent investigations, disjoint edits, or reviews when parallel
  work saves time or improves quality. Give each worker a bounded outcome and
  file ownership; integrate centrally. Respect harness limits and explicit user
  model choices. Skip delegation overhead for a short, coupled task.
- Use the smallest meaningful verification for the change and complete applicable
  repository gates. For instruction-only edits, inspect conflicts, paths, diffs
  and secrets; skip application builds unless runtime behavior is affected.
  Repeat passing checks only after a relevant change or new evidence. Do not add
  tests that merely restate implementation or remove useful behavioral coverage.
- Lead with the result in concise, plain prose. Use lists when they help scanning;
  avoid canned summaries, jargon and performative narration. Report what changed,
  what was verified, and material limits; never turn a local check into a live claim.

## Agy coding and review agent

Agy requires a real pseudo-terminal in automated sessions. Do not invoke `agy`
directly from a non-interactive tool call. Use the repository wrapper:

```bash
./scripts/agy-pty models
./scripts/agy-pty --sandbox \
  --model 'Claude Sonnet 4.6 (Thinking)' \
  --print 'Your prompt'
```

The wrapper is also installed for the current user as `agy-pty`. Keep `--print`
immediately before the prompt; Agy otherwise may interpret the next flag as the
prompt. Set `AGY_PTY_CLEAN=1` when plain captured output is preferred over the
interactive spinner output.

For Codex/Astra tasks, implement with the selected model and available native
tools. Agy and its alternative models are optional tools for explicitly
requested workflows, not prerequisites for editing or reviewing this repo.
Keep the PTY wrapper requirement whenever Agy is actually used.

The wrapper uses `script` from util-linux, safely quotes all arguments, and
propagates Agy's exit status. Verify availability with:

```bash
./scripts/agy-pty --sandbox \
  --model 'Claude Sonnet 4.6 (Thinking)' \
  --print 'Reply with exactly AGY_OK. Do not use tools.'
```

## Versioned documentation releases

Before every release, review and update the documentation source in
`website/versions/v<major>/`, including installation, upgrade, removal,
features, provider support, privacy notes, and screenshots. Run
`npm run docs:build` and verify the generated, ignored `docs-site/` output. The
Coolify docs resource builds that output in its container and serves it at
`https://tagvico.arturf.ch/docs/`.

Before the first release of a new major version, run
`npm run docs:new-major -- <major>` to snapshot the previous major's source.
Update the new version only; do not rewrite older version directories except to
fix a dangerous or broken instruction. Rebuild every version so each version
selector can link to all available majors.

Screenshots must come from a representative running installation. Inspect the
final pixels before committing: API keys, tokens, document contents, personal
names, email addresses, account identifiers, and private URLs must not appear.
Generic tags and synthetic document metadata are acceptable.
