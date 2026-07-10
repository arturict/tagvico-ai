# Repository agent instructions

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

Use Claude Sonnet 4.6 or Claude Opus 4.6 for implementation work. Use Gemini
3.5 Flash for the independent review pass when that workflow is requested.

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
