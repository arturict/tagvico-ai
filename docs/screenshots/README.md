# Screenshots

This directory holds the screenshot set that accompanies the Archivista
AI launch materials. The actual captures are taken from a real Fudligagg
Lab install and will be committed in a separate PR; placeholder SVGs
(`*-placeholder.svg`) mark each slot until then.

Do not add fabricated or stock images. Each slot below lists the screen
to capture, the final filename, and what the shot must show.

## Screenshot inventory

| # | Slot | Final file | Placeholder | What it must show |
|---|---|---|---|---|
| 1 | Setup wizard | `setup.png` | `setup-placeholder.svg` | First-run `/setup` screen with the "Scan for Paperless-ngx" panel and the model provider picker. Triggered by launching with a fresh `data/` volume. |
| 2 | Dashboard | `dashboard.png` | `dashboard-placeholder.svg` | Main dashboard view after setup is complete, showing scan status, processed-documents count, and the recent-activity list. Uses the production colour palette. (A preview image exists at the repo root; this is the Fudligagg Lab hero shot at the same surface.) |
| 3 | Provider picker | `provider-picker.png` | `provider-picker-placeholder.svg` | Provider selection panel in the settings page, with all five providers visible (OpenAI, OpenRouter, Ollama, LM Studio, Azure OpenAI) and a tooltip explaining the privacy trade-offs. |
| 4 | Document history | `document-history.png` | `document-history-placeholder.svg` | Per-document history view, showing a processed document with the AI-generated title, tags, correspondent, document type, and a link to the original Paperless record. |
| 5 | Before / after | `paperless-before-after.png` | `paperless-before-after-placeholder.svg` | Side-by-side of a Paperless document detail page before and after Archivista has processed it, highlighting the added title, tags, correspondent, and custom fields. |

## Anonymization requirements

Every screenshot must pass this checklist before it is committed. A
reviewer must independently verify each item during PR review.

- [ ] **No API tokens, API keys, or secrets** visible in any field,
      tooltip, URL, or browser autofill.
- [ ] **No real names, email addresses, or usernames.** Use placeholder
      values such as `Alex M.`, `user@example.org`, or `demo-user`.
- [ ] **No private document content.** Use fabricated invoices,
      contracts, and letters from fictional companies (e.g. "Acme
      Supplies GmbH", "Riverdale Accounting").
- [ ] **No personally identifiable information** — no real addresses,
      phone numbers, tax IDs, IBANs, or account numbers.
- [ ] **No real instance URLs.** Use `http://paperless-ngx:8000` or
      `http://localhost:8000`; never a public domain.
- [ ] **Browser chrome is clean.** Bookmarks bar hidden, extensions
      and ad-blockers disabled, no personal tabs or history visible.
- [ ] **OS chrome is clean.** System tray, clock, wallpaper, and
      account name are cropped out or blurred.
- [ ] **Metadata stripped.** Export with "Save for Web" or run
      `exiftool -all= <file>` before committing. Verify with
      `exiftool <file>` that no personal data remains.

The capture script
([`scripts/capture-screenshots.sh`](../../scripts/capture-screenshots.sh))
prints this checklist and can be run with `--check` to verify that
every placeholder SVG is still in place.

## Capture settings

- **Resolution:** 1200 × 800 px display size; export at 2× DPI
  (2400 × 1600 source) for retina screens.
- **Format:** PNG, lossless. Do not transcode to JPG or WebP.
- **Seed data:** one example document per Paperless workflow (invoice,
  contract, letter, receipt) so the screens show realistic variety.
- **Paperless side:** the "before" half of the before/after shot must
  match a vanilla Paperless install — disable any Archivista-specific
  UI customisations on the left pane.

## How to replace a placeholder

When a real screenshot is ready for a slot, follow these steps:

1. **Capture** the screenshot from the Fudligagg Lab install at the
   resolution and format described above.
2. **Anonymize** — walk through every item in the anonymization
   checklist and redact, crop, or re-shoot anything that fails.
3. **Strip metadata** with `exiftool -all= <file>` (or your editor's
   "Save for Web" equivalent) and verify the output is clean.
4. **Save** the final image as the slot's filename in this directory,
   e.g. `setup.png` for the setup wizard slot.
5. **Update the README.** In the table above, the `Final file` column
   already lists the target name; the root [`README.md`](../../README.md)
   references the placeholder SVGs — update those references to point
   to the new PNG once it lands. For example:

   ```markdown
   <!-- before -->
   ![Setup wizard](docs/screenshots/setup-placeholder.svg)
   <!-- after -->
   ![Setup wizard](docs/screenshots/setup.png)
   ```

6. **Remove the placeholder SVG** for the slot you just filled:
   `git rm docs/screenshots/<name>-placeholder.svg`.
7. **Open a PR** with the new images. The PR description must confirm
   that the anonymization checklist was run and the reviewer must
   independently verify it before merging.

Repeat the process for each slot until every placeholder has been
replaced. Once all five slots are filled, this README should be updated
to remove references to the placeholder workflow.
