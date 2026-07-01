# Paperless-ngx Issue #12117 — Workflow Trigger Timing

**Upstream:** https://github.com/paperless-ngx/paperless-ngx/issues/12117
**Researched:** 2026-06-29
**Verdict for Archivista:** *Worth a small docs/discussion nudge upstream; low immediate risk for Archivista users.*

## Problem

`Document Added` workflow triggers in paperless-ngx are evaluated *too early* in the consumption pipeline — before OCR text extraction and the automatic matching step (correspondent, document type, tags, storage paths) have completed. As a result, two common filter types never fire on freshly added documents:

1. **Content-matching regex filters** — the OCR text is not yet present.
2. **`Has Correspondent` / `Has Document Type` / `Has Tag` filters** — the auto-matching Celery task has not yet run.

The same regex *does* match a minute or so later when the standalone automatic-matching task executes, but the workflow is not re-evaluated at that point. The reporter’s central claim is that this contradicts the official documentation, which states that `Document Added` runs *after* the document content has been extracted and metadata has been set.

## Current state (2026-06-29)

- **Status:** Closed as *not a bug* (label: `not a bug in paperless-ngx`).
- **Resolution date:** unclear from the rendered page; the issue appears to have been closed in 2025.
- **Maintainer reply:** No maintainer comment is visible on the page explaining the closure. The reporter is asking for behavior that, in the maintainers’ view, is working as designed (or is a docs-clarity issue, not a code bug).
- **Affected version (reporter):** paperless-ngx 2.20.7, Docker on a UGREEN DXP2800 NAS, PostgreSQL 17.
- **Linked PRs / related issues:** None visible on the issue page. No branch or PR references the issue.
- **Documentation reality check:** The current `docs/usage.md` in `main` shows the consumption flow as:
  ```
  New Document
     → Consumption triggers evaluated
          → If match: Workflow Actions Run
     → Document Added
          → Paperless-ngx 'matching' of tags, etc.
          → Added triggers evaluated
               → If match: Workflow Actions Run
     → Document Finalized
  ```
  The diagram itself is ambiguous: it places the `Added` trigger *before* the matching step in the same line, which the reporter reasonably reads as "content is available at that point." In practice, the trigger is emitted by the consumer task, but the OCR / auto-match Celery tasks run *concurrently* after that, so the workflow engine sees the document in a partially-processed state.

## Reproduction recipe

1. Spin up paperless-ngx 2.20.x with the official Docker image.
2. Create a `Document Added` workflow whose filter is **either**:
   - **Option A — regex on content:** a `content matches /Invoice\\s\\d+/` filter, with an action that assigns the `Invoice` tag.
   - **Option B — metadata filter:** a `Has Correspondent` filter, with an action that assigns the `Needs Review` tag.
3. Drop a PDF containing the string `Invoice 12345` into the consumption directory.
4. Observe:
   - The `Invoice` tag is **not** applied during the consumption task.
   - 50–90 seconds later, the tag *is* applied — by the automatic-matching task, not the workflow.
   - Re-running the workflow manually picks up the document correctly.
5. Inspect the Celery worker logs: the `Added` trigger fires from the `consume_file_task`; the matching happens in `match_document_task` shortly after.

## Proposed fix direction

There are three plausible directions; the first is the safest, the third is the cleanest.

1. **Documentation clarification (lowest risk).** The maintainers appear to consider this a docs/expectation mismatch, not a code bug. A short addendum to the workflow section clarifying that `Document Added` is emitted when the *consumption task* completes, while the *matching* and *OCR* tasks are queued and may not have finished, would resolve the user-visible contradiction. This is what the maintainers are likely to accept.
2. **Split the trigger.** Introduce a fifth trigger type, e.g. `Document Matched`, emitted after the auto-match Celery task completes. This would let users express "after matching has run" semantics explicitly. This is a more invasive change and would require a deprecation path for `Document Added` users who relied on the old timing.
3. **Re-evaluate `Document Added` after matching.** Treat `Document Added` as a deferred event and re-fire the trigger after the matching task has populated metadata. This is the most user-friendly option but risks double-firing actions and complicates idempotency semantics for `Assign` actions.

For Archivista’s purposes, option 1 is the most likely outcome upstream. We should be ready to document the timing semantics clearly in our own integration guides.

## Risk for Archivista users

**Severity: low to medium, depending on workflow.** Archivista v1 mostly *reads* from paperless-ngx; it does not yet define or evaluate paperless workflows on the user’s behalf. The risk surface is:

- **Future Archivista workflow scaffolding.** If we ever auto-generate paperless workflows (e.g. "auto-tag invoices"), we must not assume the `Document Added` trigger sees matched metadata. The integration needs to either: (a) use the trigger anyway and run a second pass after matching, or (b) guide users toward a `Scheduled` trigger that runs every N minutes and re-evaluates pending documents.
- **Confused users.** Archivista users who follow our "set up these paperless workflows" docs will hit the same surprise as the reporter in #12117. Our own docs must explicitly call this out.
- **No immediate action required upstream.** The issue is closed, the maintainers’ position is firm, and the problem is well-understood. A docs PR or comment on the issue is the only realistic upstream contribution. We should *not* open a duplicate or argue for a behavior change — that would burn good will for no expected outcome.

## Action items for Archivista

- [ ] Add a "Workflow timing caveats" subsection to our `docs/integrations/paperless.md` once it exists.
- [ ] Avoid auto-generating `Document Added` workflows that depend on matched metadata; prefer `Scheduled` triggers for those cases.
- [ ] If/when a friendly window opens, post a one-paragraph docs-clarification comment on #12117 — *do not* reopen the issue.

## Sources

- https://github.com/paperless-ngx/paperless-ngx/issues/12117
- https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/docs/usage.md (workflow trigger section, current `main` branch)
- https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/docs/configuration.md (OCR configuration reference)
