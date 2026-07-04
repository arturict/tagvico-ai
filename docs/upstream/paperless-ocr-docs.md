# Paperless-ngx OCR Language Pack Docs (Issues #4139, #4833)

**Researched:** 2026-06-29
**Verdict for Tagvico:** *Both issues are closed as "not a bug" / "dependencies." The current docs cover how to install Tesseract language packs but do not call out the *character-encoding pitfalls* (umlauts, accents) that motivated both reports. A focused upstream docs PR is worthwhile.*

## Per-issue summary

| # | Title (short) | Language | Reporter's claim | Status | Label(s) | Root cause area |
|---|---|---|---|---|---|---|
| [#4139](https://github.com/paperless-ngx/paperless-ngx/issues/4139) | Umlauts (ä, ö, ü, ß) lost from PDF after import, replaced with whitespace | German (`deu`) | Stripped from the resulting OCR'd PDF and content index | **Closed as not planned** | `not a bug`, `dependencies` | Tesseract language data / font / Ghostscript toolchain |
| [#4833](https://github.com/paperless-ngx/paperless-ngx/issues/4833) | Accented French characters (é, è, à, ç, ù, ë) missing from OCR output, replaced by non-breaking space | French (`fra`) | Same family of failure mode: characters lost, replaced by Unicode no-break space | **Closed as not planned** | `not a bug`, `dependencies` | Tesseract / OCRmyPDF; closed related PR on the OCRmyPDF dependency |

## Per-issue detail

### #4139 — German umlauts lost after OCR

- **What the reporter saw:** Importing a German PDF into paperless-ngx 1.17.0 (official Docker image, Linux host, kernel 4.4.180+, Chrome browser, `OCRmyPDF` + Tesseract `deu`) produced a file in which every umlaut (ä, ö, ü, ß) was stripped and replaced by a single space character. The reporter attached `umlaut-test.pdf` as a reproducer.
- **Key log line:** Tesseract was clearly running with the German language pack (`'language': 'deu'`), and the parser detected the document as `RasterisedDocumentParser` — i.e. there was no embedded text layer to fall back on.
- **Maintainer response:** No inline comment visible. Closed as `not a bug` with the `dependencies` label, meaning the maintainers concluded the behavior stems from the OCR toolchain (Tesseract + the language data files + Ghostscript / PDF font handling) rather than paperless-ngx code.
- **Current behavior (2026-06-29):** Unchanged in principle — character fidelity still depends on the Tesseract language pack and the source rasterisation. Modern Tesseract 5.x data files have improved, but the *class* of bug is not eliminated by paperless-ngx itself.

### #4833 — French accents dropped, replaced by non-breaking space

- **What the reporter saw:** On paperless-ngx 2.0.1 (Synology DS920+ / DSM 7.2.1, official Docker image, OCR language `fra`), accented French characters disappeared from the content tab and were replaced by larger spaces. The reporter noted the appearance of an `Incomplete sidecar file: discarding.` log line and pointed to a closed related PR on the `OCRmyPDF` dependency.
- **Maintainer response:** No inline comment visible. Closed as `not a bug` with the `dependencies` label, attributing the root cause to the OCR toolchain (Tesseract / OCRmyPDF) rather than paperless-ngx.
- **Current behavior (2026-06-29):** Unchanged in principle. The `Incomplete sidecar file: discarding.` log line is still emitted by OCRmyPDF when its intermediate `.txt` sidecar does not match the page count; this is informational and not necessarily a bug, but it correlates with the symptom of "characters were lost during OCR." The 2.x line ships OCRmyPDF versions that are more tolerant of this case, but the symptom is not gone.

## Cross-cutting diagnosis

Both issues are instances of the same general problem: **OCR output character fidelity depends on (a) the correct Tesseract language pack, (b) the source rasterisation quality, and (c) the OCRmyPDF configuration for rebuilding the searchable PDF layer.** When any of these is misconfigured, characters get replaced by spaces (most commonly) or by Unicode "no-break space" U+00A0 (less commonly). Neither issue points at a paperless-ngx code defect.

Common fix recipes (collected from OCRmyPDF / Tesseract docs and community threads, not from either issue’s closed thread):

1. **Verify the language pack is installed and matched.** `tesseract --list-langs` on the host (or inside the container) must list the language. For Docker, set `PAPERLESS_OCR_LANGUAGES=fra deu …` and `PAPERLESS_OCR_LANGUAGE=fra+deu`.
2. **Check the source rasterisation.** If the input PDF has very low DPI or the original scan was poor, Tesseract will not be able to recognise diacritics. Bumping `PAPERLESS_OCR_IMAGE_DPI` to 300+ often helps.
3. **Use `redo` mode once to get a clean OCR layer.** `PAPERLESS_OCR_MODE=redo` forces a full re-OCR; useful when the original embedded text layer is corrupt and mixing with the new OCR layer.
4. **For PDFs that already have a text layer (`Incomplete sidecar file: discarding.`):** this is a paperless-ngx log line, not an error — it means the sidecar `.txt` produced by OCRmyPDF did not include all pages. It is usually safe to ignore, but if the resulting content is wrong, try `PAPERLESS_OCR_MODE=force` (rasterises + re-OCRs).

## Current docs assessment (2026-06-29)

Reading the current `main` branch of the paperless-ngx docs:

- **`docs/configuration.md`** has a thorough section on `PAPERLESS_OCR_LANGUAGE`, `PAPERLESS_OCR_MODE`, `PAPERLESS_OCR_LANGUAGES`, and the list of OCRmyPDF-related options (`PAPERLESS_OCR_CLEAN`, `PAPERLESS_OCR_DESKEW`, `PAPERLESS_OCR_ROTATE_PAGES`, `PAPERLESS_OCR_OUTPUT_TYPE`, `PAPERLESS_OCR_PAGES`, `PAPERLESS_OCR_IMAGE_DPI`, `PAPERLESS_OCR_USER_ARGS`). It correctly warns that "language package names don’t always match language codes" (e.g. `chi-tra` not `chi_tra`).
- **`docs/usage.md`** has a one-line section on OCR ("consumption directory / web UI / email / API → OCR if needed → PDF/A creation → automatic metadata matching") with a link to the configuration reference. It does *not* call out the character-encoding pitfall.
- **`docs/setup.md`** lists `tesseract-ocr` and a few example language packs (`tesseract-ocr-eng`, `tesseract-ocr-deu`, "etc.") for bare-metal installs, but does not enumerate the full set or warn about pack-name-vs-code mismatches.
- **`docs/troubleshooting.md`** mentions installing Tesseract language files to silence "OCR for XX failed" warnings or low accuracy, but does not specifically call out accented-character loss or replacement by spaces.
- **No docs page** explicitly addresses the `Incomplete sidecar file: discarding.` log line, even though it appears in many user setups and is regularly confused with the symptom in #4833.

In short: the docs cover the *happy path* (install the language pack, set the language code, OCR runs). They do not cover the *failure modes* (characters replaced by spaces, no-break-space substitution, sidecar file warnings) that drive the majority of "OCR is wrong" reports on the issue tracker.

## Recommendation: is an upstream docs PR worthwhile?

**Yes — focused, low-risk, high-value.** A short additions PR against `docs/troubleshooting.md` (or a new `docs/ocr.md` if the maintainers prefer per-topic files) would help. Suggested content:

> ### OCR output is missing accented characters (é, è, ä, ö, ñ, ç, …)
>
> This is almost always a Tesseract configuration issue, not a paperless-ngx bug. Work through this checklist:
>
> 1. **Verify the language pack is installed.** Inside the container, run `tesseract --list-langs`. If your language is missing, add it via `PAPERLESS_OCR_LANGUAGES=<pack>` (Docker) or `apt install tesseract-ocr-<lang>` (bare metal). Note: package names use hyphens, language codes use underscores (`chi-tra` vs `chi_tra`).
> 2. **Verify the language is selected.** Set `PAPERLESS_OCR_LANGUAGE=<3-letter-code>` (e.g. `deu`, `fra`, `fra+eng` for mixed-language documents). The default is `eng`.
> 3. **Re-OCR the document once with `redo` mode.** This strips any pre-existing, possibly corrupt text layer and replaces it with a fresh one. Set `PAPERLESS_OCR_MODE=redo`, re-consume the document, then switch back to `skip` for normal use.
> 4. **For low-quality scans, raise the rasterisation DPI.** `PAPERLESS_OCR_IMAGE_DPI=300` (or higher) gives Tesseract more pixels to work with.
> 5. **If the content tab shows characters replaced by larger spaces, look for `Incomplete sidecar file: discarding.` in the logs.** This usually means the embedded text layer was incomplete; `PAPERLESS_OCR_MODE=force` will rasterise and re-OCR from scratch.
>
> If the issue persists after these steps, it is almost certainly in the underlying Tesseract / OCRmyPDF toolchain. File the issue against the OCRmyPDF project with a sample PDF and the full `paperless` log line for the document.

The PR is pure docs, references two well-known closed issues by number (gives the maintainers an easy way to confirm it is on-topic), and addresses a class of report that has been recurring since at least 2022. Expect a friendly reception.

## Sources

- https://github.com/paperless-ngx/paperless-ngx/issues/4139
- https://github.com/paperless-ngx/paperless-ngx/issues/4833
- https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/docs/configuration.md (OCR section, `PAPERLESS_OCR_LANGUAGE`, `PAPERLESS_OCR_MODE`, `PAPERLESS_OCR_LANGUAGES`, `PAPERLESS_OCR_USER_ARGS`, etc.)
- https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/docs/usage.md (consumption / processing pipeline overview)
- https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/docs/setup.md (bare-metal Tesseract dependency list)
- https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/docs/troubleshooting.md (Tesseract language installation note; no accented-character section)
- OCRmyPDF upstream: https://github.com/ocrmypdf/OCRmyPDF (referenced indirectly via the `Incomplete sidecar file: discarding.` log line in #4833)
