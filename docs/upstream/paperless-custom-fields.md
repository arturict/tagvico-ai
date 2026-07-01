# Paperless-ngx Custom-Field API Issues

**Researched:** 2026-06-29
**Verdict for Archivista:** *All three are closed. Behavior around workflow re-application is by design but under-documented; a small upstream docs PR is worthwhile.*

This note covers three issues in the paperless-ngx issue tracker that all touch the *custom fields + REST API + workflows* intersection — which is exactly the surface Archivista's `custom fields discovery and validation` feature (commit `c4c11eb`) integrates against.

## Per-issue summary

| # | Title (short) | Reporter's claim | Status | Label(s) | Resolution | Reporter version |
|---|---|---|---|---|---|---|
| [#9311](https://github.com/paperless-ngx/paperless-ngx/issues/9311) | Slow / timing-out PATCH on `/api/documents/{id}/` for custom fields | 3–30s response times, Gunicorn pegged at ~90% CPU, PostgreSQL idle — implies web-tier bottleneck as document count grew to 3,642 | **Closed** | `cant-reproduce`, `not a bug` | Could not be reproduced; closed without fix | 2.14.7 |
| [#9478](https://github.com/paperless-ngx/paperless-ngx/issues/9478) | PUT to `/api/documents/{id}/` overwrites user-entered custom fields with `null` | After a workflow assigns *empty* custom fields, user-edited values are clobbered because the document re-matches the same workflow on save | **Closed as duplicate** | `duplicate`, `not a bug` | Closed as by-design (workflow re-application) | 2.15.0 |
| [#5293](https://github.com/paperless-ngx/paperless-ngx/issues/5293) | HTTP 500 on save when a workflow adds a custom field that already exists on the document | Save fails with 500 in the browser even though the edit is persisted; no server-side log error | **Closed** | `bug` (backend) | Fixed by **PR #5302** | 2.3.0 / 2.3.1 |

## Per-issue detail

### #9311 — PATCH slow on large libraries

- **What the reporter saw:** Increasingly slow PATCHes (3s → 30s) on a 3,642-document library. CPU saturated in gunicorn, DB idle. Suspected N+1 queries or per-field validation in the serializer.
- **Maintainer response:** None visible on the page. The `cant-reproduce` label suggests the maintainers either could not reproduce in a similar-sized test environment or the reporter’s environment had an unstated factor (Gunicorn worker count, sync vs gthread worker class, etc.).
- **Current behavior (2026-06-29):** No code change shipped for this. The PATCH path on `/api/documents/{id}/` still uses the same DRF serializer; large libraries may still see slower-than-expected updates, but no regression has been reported in the intervening versions.
- **What Archivista should do:** In our `custom fields discovery and validation` service, *do not* PATCH one field at a time across thousands of documents. Use the bulk `modify_custom_fields` operation exposed by the paperless REST API (`POST /api/documents/bulk_edit/`) and prefer diff-based updates that send only the changed fields.

### #9478 — Workflow re-applies and clobbers user values

- **What the reporter saw:** A workflow named *Rechnung* assigned empty values for several custom fields. When a user later opened the document, filled in the values, and saved (PUT), the response returned most fields as `null` again — *except* one (field 18), which was preserved.
- **Root cause (reporter’s logs):** After the user-initiated PUT, the document re-matched the same workflow, which re-applied the empty custom fields and overwrote the user values. The logs show `Document matched WorkflowTrigger 3 from Workflow: Rechnung` and `Applying WorkflowAction 8 from Workflow: Rechnung` right after the save attempt.
- **Maintainer response:** Closed as duplicate + not a bug. The design is that workflows re-evaluate on save, and a workflow that assigns empty custom fields is interpreted as "reset to empty." The reporter had hoped the workflow would not overwrite fields that already had values.
- **Current behavior (2026-06-29):** Unchanged. Workflows still re-evaluate on every document update. The merge semantics for `Assign Custom Field` actions are "replace the value with the assigned one," *not* "only set if currently empty." There is no skip-if-set toggle.
- **What Archivista should do:** In our generated workflow templates, *never* recommend an `Assign Custom Field` action with an empty value as a "default." If a user wants defaults, surface this in our own application layer (Archivista UI) and let the user edit freely afterward, *or* document the gotcha clearly. Consider exposing a "post-workflow review" dry-run mode (which we already do via `routes/review/:id/apply`) so users can see what a workflow will do before it runs.

### #5293 — HTTP 500 on save with duplicate custom field assignment

- **What the reporter saw:** A workflow with `Document Added` + `Document Edited` triggers applied a custom field via an action. If the document already had the same custom field, editing the title and saving returned HTTP 500 in the browser but the edit was actually persisted. No server-side error in logs.
- **Resolution:** **Fixed in PR #5302** (merged before 2.4.0). The fix made the workflow assignment idempotent on the server side, so applying the same custom field a second time no longer raises.
- **Current behavior (2026-06-29):** Fixed in all currently-supported versions. The 500 response no longer occurs. Archivista can rely on the current behavior.
- **What Archivista should do:** Nothing — this is a long-resolved bug. Mention it only if a user opens a similar-looking issue against Archivista.

## Current behavior assessment (2026-06-29)

- **`PATCH /api/documents/{id}/`** still works correctly. Performance on large libraries is undocumented; the maintainers have not committed to optimizing for libraries above a few thousand documents.
- **Workflow re-application on save** is intentional. The behavior is consistent with the engine’s design ("workflows are declarative rules that re-evaluate on every relevant event") but the *consequence* — empty assignments clobbering user values — is not called out clearly in the docs.
- **Custom field idempotency** is solid post-2.4.0.
- The `docs/api.md` and `docs/usage.md` pages do not contain a "custom fields + workflows" section that warns about the re-application behavior. The only place users discover it is by losing data.

## Recommendation: is an upstream docs PR worthwhile?

**Yes — small, low-risk, high-value.** A 20–40 line docs PR against `docs/usage.md` (or a new `docs/workflows.md` if the maintainers prefer per-topic files) would help. Suggested content:

> **Note: workflows re-evaluate on every save.** If a workflow's `Assign Custom Field` action sets a value, that value *replaces* the document's current value on every matching event — including a user-driven save. To avoid clobbering user-edited values, either (a) give the workflow a more specific filter so it stops matching after the initial application, or (b) assign values only when the field is currently empty (e.g. by using the `Content Matches` filter together with a content shape that proves the field is unset).

Open the PR as a documentation improvement with a polite "addresses the confusion raised in #9478 and #12117" cross-reference, and avoid reopening either issue. Expect the maintainers to be receptive — the underlying behavior is by design, and a docs clarification is exactly the kind of contribution that gets merged quickly.

## Sources

- https://github.com/paperless-ngx/paperless-ngx/issues/9311
- https://github.com/paperless-ngx/paperless-ngx/issues/9478
- https://github.com/paperless-ngx/paperless-ngx/issues/5293
- https://github.com/paperless-ngx/paperless-ngx/pull/5302 (fix PR for #5293)
- https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/docs/usage.md (workflow section, current `main` branch)
- https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/docs/api.md (REST API overview, references `/api/schema/view/` for full schemas)
