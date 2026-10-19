# CI cost and storage baseline

This document records the July 2026 baseline used to keep Tagvico's GitHub
Actions usage predictable without weakening quality, security, review,
multiarch, or release gates.

## Measured baseline

The measurements came from GitHub Actions run and cache metadata for
`arturict/tagvico-ai` on 29 July 2026.

| Workload | Observed usage |
| --- | ---: |
| 8 release Docker runs | 144.8 runner minutes |
| 10 scheduled Docker runs | 122.2 runner minutes |
| Pull request CI | 1.6 minutes per run on average |
| v3.2.5 arm64 application build | 566 seconds |
| v3.2.5 Actions cache export | 338 seconds |
| Active Actions caches | 12.16 GiB across 58 entries |
| Default-branch caches | 5.40 GiB |
| v3.2.5 tag caches | 3.70 GiB |
| v3.2.0 tag caches | 2.42 GiB |
| Pull request cache | 0.65 GiB |
| Retained workflow artifacts | one 287-byte artifact |
| v3.2.5 image layers | 718 MiB amd64 and 664 MiB arm64 |
| Optimized cold local multiarch build | 484 seconds |
| Optimized multiarch OCI archive | 1,377.5 MiB |

Standard GitHub-hosted runners are free for public repositories. The same work
still consumes finite runner capacity, and container package storage shares the
account's artifact and package allowance. Actions cache storage is a separate
per-repository allowance. See
[GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Cost controls

- Pull requests, pushes to `main`, and manual runs retain the required
  `quality` check. Only a small allowlist of non-product repository metadata
  skips Node setup and the full test suite. The workflow itself still runs so
  branch protection receives a successful `quality` result.
- Pull requests do not write package caches. A branch-scoped npm cache was
  about 697 MB, while a warm cache saved only tens of seconds. Pushes to `main`
  retain one useful default-branch pnpm store cache.
- Every release still builds and publishes `linux/amd64` and `linux/arm64`.
  The architecture-independent TypeScript, Next.js, and versioned docs build
  runs once on `BUILDPLATFORM`. Production dependencies run on each
  `TARGETPLATFORM`, preserving native `better-sqlite3` binaries.
- Release-tag and manual builds read the canonical default-branch BuildKit
  cache but do not export their own `mode=max` copies. The weekly scheduled
  build is the sole writer for scope `tagvico-docker-main`.
- Scheduled multiarch validation runs weekly. Release publishing remains
  event-driven, and manual publishing remains available.
- Manual publishing cannot overwrite `nightly` or immutable release tags.
  Rebuilding `latest` manually is restricted to `main`.
- Docker build-record artifact upload is disabled. Build logs and summaries
  remain available. The current repository had no material artifact footprint.
- Stale-issue maintenance runs weekly, which is proportionate to its 60-day
  stale and 30-day close windows.

At the observed cadence, moving the scheduled Docker build from daily to
weekly removes about 26 scheduled runs per 30-day month. Using the ten-run
sample, this avoids roughly 318 runner minutes per month before release
activity. Not exporting release caches also removes about 5.6 minutes from a
full release like v3.2.5 and prevents multi-GiB cache copies for each tag.
Actual savings vary with source and lockfile changes.

A cold local build of the optimized Dockerfile completed both architectures in
484 seconds, compared with 1,270 seconds for the measured v3.2.5 release run
including its cache export. Both images still contain the full production
dependency set, so the initial multiarch pull size remains similar. The
long-term package-storage benefit is version-to-version deduplication: the old
per-architecture application layers totalled about 1,204 MiB and changed with
every source commit. With an unchanged lockfile, the optimized layout keeps the
large target-specific dependency layers stable and limits a new release mainly
to roughly 45 MiB of application and documentation layers.

## Gates retained

The required CI job still runs type checks, lint and policy checks, a production
build, unit tests, the versioned documentation build, a high-severity audit of
production dependencies, compiled-server syntax validation, and package script
validation. Release and manual image workflows remain multiarch and continue
to publish only through their existing explicit events.

No workflow in this change merges a pull request, publishes a GitHub release,
or mutates a production deployment.

## Optional cache cleanup after merge

The workflow change stops new release-tag cache growth. Existing tag caches can
expire naturally. After the new default-branch cache has been created and
verified, a repository owner may reclaim the two measured tag scopes with:

```bash
gh cache delete --all --ref refs/tags/v3.2.0 --repo arturict/tagvico-ai
gh cache delete --all --ref refs/tags/v3.2.5 --repo arturict/tagvico-ai
```

These commands are intentionally manual and must not run from pull request
workflows.
