# Setup feedback kit

Use this kit to check a fresh Tagvico 3.5.0 install and report where setup
worked or stopped. Five independent installs with reproducible results are the
target. This page is a test plan, not evidence that those installs happened.

## Prepare one install

Follow the [clean-install guide](./installation) against a Paperless-ngx
instance you control. Keep scheduled scans paused and **Review first** enabled.
Do not run another automatic metadata writer on the same fields.

Use a test archive or a dedicated Paperless user whose token can access only
test documents. Read [Privacy and security](./privacy) before choosing a hosted
provider. Connection tests and chat can consume provider quota or API credit.
Bots, household invitations, public hosting and telemetry are not required.

Create a one-page PDF in any text editor using Print or Export to PDF, then
upload it to Paperless. Set its title to `Tagvico setup feedback fixture` and
wait for Paperless to finish processing it. Use this synthetic text:

```text
Tagvico setup feedback fixture
This is a synthetic document for installation testing.
Reference: TV-SETUP-001
Task: Review the test checklist.
There is no real payment, person, account or deadline in this document.
```

## Run the first-use check

Record pass, fail or not tested for each step. Stop at a failure and keep the
smallest useful error; repeated retries can spend quota without adding evidence.

1. Start the pinned `3.5.0` image. Check `/health` for HTTP `200`,
   `status: "healthy"` and `configured: false` before setup.
2. Complete the Paperless connection test, provider sign-in or connection test,
   live model selection and local owner creation. Record the step where setup
   stopped if it did not finish.
3. Sign in. Confirm `/health` now reports `configured: true` and Settings still
   show **Review first** and paused scheduled scans.
4. Open **Documents** and find only the permitted test fixture. In a new chat,
   ask `Find the document titled Tagvico setup feedback fixture. What is its
   reference?` Check that the answer says `TV-SETUP-001` and cites that document.
   Record a skipped chat check separately if the selected provider only supports
   filing. See the [provider overview](./providers).
5. With a Companion-capable provider, ask `Propose changing only the title of
   Tagvico setup feedback fixture to Tagvico setup feedback reviewed.` Confirm
   the title is unchanged in Paperless while the approval is pending. Choose
   **Reject** and confirm it remains unchanged. Repeat the request, inspect the
   proposed change and choose **Approve** only for the synthetic document.
   Confirm the new title in Paperless. If no approval card appears, record that
   outcome instead of changing a real document.
6. Run `docker compose restart tagvico-ai`. Wait for `/health` to succeed, sign
   in again, and confirm provider settings and the chat/approval outcome remain.
   Do not remove the data volume to retry a failed check.

An install counts as usable when setup, health, permitted document access and
restart persistence pass. A Companion-capable provider also needs the read and
approval checks. A filing-only result is useful feedback, but does not prove the
Companion journey. A provider block or an untested step stays visible in the report.

## Copy a short report

Keep exact versions and errors; replace private hostnames with role names such
as `paperless-host`. Do not include tokens, passwords, sign-in callback URLs,
full Compose configuration, document contents, personal names or account IDs.
Review log excerpts and screenshots manually before sharing.

```text
Tagvico image tag: 3.5.0
Install method: Compose / docker run / Unraid / other
Host OS and CPU architecture:
Docker Engine and Compose versions:
Paperless-ngx version:
Browser and OS:
Network: same Docker network / host LAN / reverse proxy / other
Provider and model, no credentials:
Time from starting the container to first sign-in:

Startup /health: pass / fail
Paperless connection test: pass / fail / not tested
Provider connection and model selection: pass / fail / not tested
Owner creation and first sign-in: pass / fail / not tested
Review first and paused scans: pass / fail / not tested
Permitted fixture in Documents: pass / fail / not tested
Chat reference and citation: pass / fail / not tested, reason:
Pending write left fixture unchanged: pass / fail / not tested
Reject left fixture unchanged: pass / fail / not tested
Approve changed only the fixture title: pass / fail / not tested
Restart kept settings and history: pass / fail / not tested

First confusing instruction or failed step:
Expected result:
Actual result and exact error, redacted:
Smallest steps to reproduce:
Useful redacted log lines, if any:
One thing that would have made setup easier:
```

Share a reviewed deployment report in the existing
[deployment discussion](https://github.com/arturict/tagvico-ai/discussions/35).
For a reproducible bug, use the
[bug report form](https://github.com/arturict/tagvico-ai/issues/new?template=bug_report.yml).
Report security problems through [the security policy](https://github.com/arturict/tagvico-ai/blob/main/SECURITY.md).

## Compare five results

The maintainer can copy this empty table into private working notes. Use
anonymous install numbers, leave untested cells explicit, and link only to
reports their authors chose to share. Do not commit participant data here.
Count independent setups, not five restarts of one installation.

| Install | Host / architecture | Paperless | Provider / model | Usable? | First blocker or confusing step | Setup time | Report |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Pending | Pending | Pending | Not tested | Pending | Pending | Pending |
| 2 | Pending | Pending | Pending | Not tested | Pending | Pending | Pending |
| 3 | Pending | Pending | Pending | Not tested | Pending | Pending | Pending |
| 4 | Pending | Pending | Pending | Not tested | Pending | Pending | Pending |
| 5 | Pending | Pending | Pending | Not tested | Pending | Pending | Pending |

Compare repeat blockers first: startup, container-to-Paperless networking,
provider access, permissions, then unclear instructions. Fix the earliest
repeated failure and ask affected testers to retry that step before broadening
scope. Keep unresolved results and support time visible alongside successes.
