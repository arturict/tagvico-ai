# Documentation

This directory contains the Tagvico AI documentation site (`index.html`), provider setup guides, and the project status page.

| File / directory | Purpose |
| --- | --- |
| `index.html` | Standalone landing page (the public docs site). |
| `STATUS.md` | Current development status, alpha expectations, upgrade guidance. |
| `screenshots/` | Product screenshots used in the README and landing page. |
| `providers/` | Per-provider setup and troubleshooting guides. |
| `V2_COMPETITIVE_REVIEW.md` | Source-level v2 feature comparison and release gates. |
| `upstream/` | Research notes on the upstream Paperless-ngx project (issue tracking, not a product dependency). |
| `launch-post.md` | Drafts for community launch posts (r/selfhosted, r/Paperlessngx). |

## Editing the landing page

`index.html` is intentionally a single self-contained file with no build step. Edit the markup in place, keep the inline CSS variables in `:root` consistent, and verify the copy buttons still work after changes.

## Updating screenshots

See `screenshots/README.md` for the rules around capturing and committing product screenshots.

## When you add a provider

1. Create `providers/<name>.md` following the structure of the existing files.
2. Link the new file from `providers/README.md`.
3. Add a row to the provider matrix in the top-level `README.md`.
