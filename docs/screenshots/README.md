# Screenshots

This directory is a placeholder for the Fudligagg Lab screenshot set
that will accompany the launch materials. The files do not exist yet
on purpose — they will be captured in a real Archivista AI install and
committed in a separate PR.

Do not add fabricated images. Each entry below lists the screen to
capture, the suggested filename, and the URL or feature flag to set so
the screenshot reflects the real product.

## TASKS

The following five screenshots still need to be captured. Once a real
install is available, run through these flows and replace the
placeholder files in this directory.

1. **setup.png** — First-run `/setup` screen with the "Scan for
   Paperless-ngx" panel and the model provider picker. Triggered by a
   fresh `data/` volume.
2. **dashboard.png** — The main dashboard view after setup is
   complete, showing the scan status, processed-documents count, and
   the recent-activity list. (A preview image already exists at the
   repo root for the README; this entry is for the Fudligagg Lab
   hero shot at the same surface but with the production palette.)
3. **provider-picker.png** — The provider selection panel in the
   settings page, with all five providers visible (OpenAI,
   OpenRouter, Ollama, LM Studio, Azure OpenAI) and a tooltip
   explaining the privacy trade-offs.
4. **document-history.png** — The per-document history view, showing a
   processed document with the AI-generated title, tags, correspondent,
   document type, and a link to the original Paperless record.
5. **paperless-before-after.png** — A side-by-side of a Paperless
   document detail page before and after Archivista has processed it,
   highlighting the added title, tags, correspondent, and custom
   fields.

## Capture notes

- Use a clean install with one example document per Paperless
  workflow (invoice, contract, letter, receipt) so the screens
  reflect realistic data.
- Disable browser extensions and ad-blockers that touch Paperless
  pages, since the side-by-side shot should look identical to a
  vanilla Paperless install on the left half.
- Export at 2x DPI for retina displays and keep the original PNGs;
  do not transcode to JPG.
