# Tagvico AI v2 product review

This review compares the checked-out Tagvico AI and Paperless AI Next source
trees as of 2026-07-09. It is an engineering checklist, not a claim that either
project is universally better.

## What Paperless users actually need

1. **Predictable ingestion:** detect new documents once, recover interrupted
   work, and never create a paid retry loop.
2. **Useful Paperless metadata:** titles, tags, correspondents, document types,
   dates/languages, custom fields, and optional owners.
3. **A safe first run:** test Paperless and provider access, start in review
   mode, show the proposed change, and require an explicit decision before the
   first write.
4. **Controlled vocabulary:** prefer existing values, cap tags, keep related
   tags in understandable groups, and route unknowns to an exception queue.
5. **Recovery:** durable failures, clear retry actions, original-metadata
   snapshots, restore, and idempotent re-scans.
6. **Provider choice without credential tricks:** local inference, normal API
   keys, and official subscription SDK/auth flows where providers support them.
7. **Observable cost and health:** model identity, token/request usage, provider
   health, batch state, and no hidden fallback from a subscription to paid API.
8. **Privacy boundaries:** no unauthenticated document previews, no secret
   leakage, no prompt-enrichment SSRF, and clear disclosure when OCR leaves the
   home network.

## Source-level comparison

| Capability | Paperless AI Next | Tagvico v2 direction |
| --- | --- | --- |
| Core metadata | Strong existing Paperless workflow | Titles, tags, correspondents, types, dates, languages, custom fields, owners |
| Provider breadth | Conventional local/API providers | Local/API providers plus isolated ChatGPT/Codex and GitHub Copilot SDK paths, OpenCode Go, and Ollama Cloud |
| Cost modes | Provider-dependent immediate requests | Standard, OpenAI Flex, and OpenAI/Anthropic batch modes |
| OCR recovery | Mature bulk workflow with progress/text inspection | Durable rescue queue; bulk progress and reanalysis remain a v2 follow-up |
| Setup | Explicit connection/model preflight | Guided Paperless discovery, connection tests, provider picker, tag-policy defaults, and review-first setup |
| Model discovery | Strong provider-specific discovery | Ollama discovery today; account-driven discovery should expand for subscription providers |
| Controlled tags | Existing-value controls | Tag groups, a permanent Other group, caps, exceptions, and unmanaged-tag cleanup |
| Review and rollback | Practical review features | Durable review-before-write, structured diffs, retries, original snapshot restore |
| Operations | Established operational screens | Health endpoint, interrupted-job recovery, OCR/terminal failure queues, reconciliation, manual re-runs |
| Security boundary | Private thumbnail cache and hardened enrichment | v2 adopts the same minimum bar: authenticated thumbnail proxy and SSRF-safe declarative enrichment |

## Release gates before claiming the upper hand

- Run a real Paperless-ngx ingest test from consumption folder to metadata
  write, including an OCR-poor PDF.
- Prove dry-run mode creates zero Paperless writes and that Apply/Reject are
  durable across restarts.
- Exercise each advertised provider with a real entitled account; compile-only
  support is not enough for a release claim.
- Test restore after a bad suggestion and interrupted-process recovery.
- Finish bulk OCR progress/text inspection and optional immediate reanalysis.
- Keep the project labeled alpha until those checks are repeatable in CI or a
  documented release checklist.

The practical v2 differentiator is not the number of provider logos. It is a
review-first, recoverable filing loop that can use inference people already pay
for through official SDKs while keeping every other provider isolated and
replaceable.
