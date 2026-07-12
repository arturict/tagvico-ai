# Documentation

This directory contains legacy project documentation and the standalone landing
page. The production VitePress site is built into the ignored `docs-site/`
directory and served by Coolify at `https://tagvico.arturf.ch/docs/`.

| File / directory | Purpose |
| --- | --- |
| `index.html` | Standalone landing page (the public docs site). |
| `STATUS.md` | Current development status, compatibility policy, upgrade guidance. |
| `screenshots/` | Product screenshots used in the README and landing page. |
| `providers/` | Per-provider setup and troubleshooting guides. |
| `V2_COMPETITIVE_REVIEW.md` | Source-level v2 feature comparison and release gates. |
| `upstream/` | Research notes on the upstream Paperless-ngx project (issue tracking, not a product dependency). |
| `launch-post.md` | Drafts for community launch posts (r/selfhosted, r/Paperlessngx). |

## Editing the public site

`index.html` is intentionally a single self-contained file with no build step. Edit the markup in place, keep the inline CSS variables in `:root` consistent, and verify the copy buttons still work after changes.

Edit versioned docs in `website/versions/v<major>/`. Use `npm run docs:dev` for
the v2 authoring server and `npm run docs:build` to rebuild the current site and
all major-version archives. Create a snapshot with
`npm run docs:new-major -- 3` before starting v3 documentation. The latest
major is built at `/docs/`; immutable archives are built at `/docs/v<major>/`.

## Updating screenshots

See `screenshots/README.md` for the rules around capturing and committing product screenshots.

## When you add a provider

1. Create `providers/<name>.md` following the structure of the existing files.
2. Link the new file from `providers/README.md`.
3. Add a row to the provider matrix in the top-level `README.md`.
