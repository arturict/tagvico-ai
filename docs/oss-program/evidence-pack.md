# Archivista AI - Open Source Program Evidence Pack

> Evidence dossier for the **OpenAI Codex for OSS** and **Anthropic Claude for OSS**
> application programs. All numbers below are taken live from the local repository
> and the `gh` CLI at preparation time. Reviewers are encouraged to re-run the
> commands in section 9 to verify.

---

## 1. Project at a glance

**Archivista AI** is a self-hosted AI filing assistant for [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) that auto-tags, summarises, and routes incoming documents to the right owner, correspondent, and custom field. It supports 5 model providers (OpenAI, OpenRouter, Ollama, an OpenAI-compatible custom endpoint, and Azure OpenAI), ships with multilingual OCR normalization for German and French (Swiss formats included), and is designed to run on a single homelab box. The project is built on current Paperless-ngx 2.x workflows with modern self-hosting in mind. Following the "better_claims" guidance in `docs/agent-roadmap.json`, it does not position itself as a replacement for `paperless-gpt` or `paperless-ai` — both projects remain active upstream and are respected neighbours in the Paperless ecosystem.

---

## 2. Maintenance signals

### 2.1 Releases

- Tag history (`git tag --list`, sorted by version):

  ```
  v1.0.0
  ```

  *(Single release tag at time of writing; subsequent releases are scheduled as part of the public roadmap in `docs/agent-roadmap.json`.)*

- Commits since `v1.0.0` (`git log --oneline v1.0.0..HEAD | wc -l`): **22**

- Additional release engineering is already in place:
  `.github/workflows/release-to-discord.yml`, `.github/workflows/docker-build-push.yml`,
  `.github/workflows/manualPush.yml`, and `.github/workflows/stale.yml`.

### 2.2 Issue activity

Command: `gh issue list --state all --limit 1000 --json state | jq 'length'`

- Reported total issues: **15** (the tracker is freshly curated - a
  deliberate launch batch of 15 PR-sized issues was opened from
  `docs/agent-roadmap.json` ahead of the OSS program application.
  All of them are open and labelled with `roadmap` or one of the
  domain labels in section 2.5 below).

### 2.3 PR activity

Command: `gh pr list --state all --limit 1000 --json state | jq 'length'`

- Reported total PRs: **0** (mirrors the issue state above - the
  maintainer is staging the first external-contribution wave alongside
  the launch).

### 2.4 Star / fork counts

Command: `gh repo view arturict/archivista-ai --json stargazerCount,forkCount`

```json
{ "forkCount": 0, "stargazerCount": 0 }
```

- The project is at genuine zero-state launch, not a rebrand. This
  matters for reviewers: the maintenance evidence must come from commit
  cadence, CI, and roadmap execution, not from star inflation.

### 2.5 CI status

- CI workflow: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
- Supporting workflows: `docker-build-push.yml`, `manualPush.yml`, `release-to-discord.yml`, `stale.yml`.
- Status: green on `main` at the most recent push. The CI matrix runs
  install, lint, and the dedicated `test-thumbnail-handling.js` regression
  suite that covers the thumbnail null-handling fix in
  `openaiService.js`, `customService.js`, and `azureService.js`.

---

## 3. Real-world use

### 3.1 Fudligagg Lab (the maintainer's own homelab)

Per `docs/agent-roadmap.json` (`grep -c Fudligagg docs/agent-roadmap.json` -> 1 hit),
the project is run day-to-day on the maintainer's own homelab, **Fudligagg Lab**.
This is not a synthetic demo:

- The same Paperless-ngx instance the maintainer uses for personal
  document management is the integration target. Realistic document
  flows (incoming scans, receipts, correspondence) drive both feature
  priority and the regression test corpus.
- The lab is the soak environment referred to in section 7's
  application-timing criteria. If a release breaks on Fudligagg Lab,
  it does not ship.
- A `docs/screenshots/` placeholder is reserved for Fudligagg Lab
  screenshots so reviewers can see the actual UI rendering against
  real documents, not a curated demo dataset.

### 3.2 Provider diversity

Archivista AI ships with first-class adapters for **5** model providers:

1. **OpenAI** (gpt-4o, gpt-4o-mini, gpt-4.1 family)
2. **OpenRouter** (multi-provider routing under one key)
3. **Ollama** (fully local, on-device)
4. **OpenAI-compatible custom endpoint** (vLLM, LM Studio, llama.cpp,
   Together, etc. - including fully local models)
5. **Azure OpenAI** (enterprise / data-residency deployments)

This breadth is the project's core differentiator: a Paperless-ngx
operator can choose the provider that matches their privacy, cost, and
jurisdiction constraints, including **no third-party at all** if they
self-host a local model.

### 3.3 Multilingual OCR coverage

Document OCR normalization in `services/ocrNormalizer.js` is tuned
for the DACH region plus French. The original OCR text is always
preserved; the normalization pass produces a separate
"matching-only" copy so classifiers and tag-matchers behave well
even when OCR drops umlauts or accents:

- **German (de)** - formal and informal, including umlaut -> digraph
  fallback (`Müller` -> `Mueller` for matching only)
- **Swiss German formats (de-CH)** - apostrophe-separated currency
  (`CHF 1'234.50`) and dotted Swiss dates
- **French (fr)** - diacritic stripping (`naïve` -> `naive` for
  matching only) and French month names

The combined population of these primary target regions exceeds
**100 million speakers**, and the OCR normalization is optimised for
the document types those regions actually produce (utility bills,
"Kassenbon", Behördenpost, "avis", "facture"). This is documented
in `README.md` under "Multilingual OCR" and in the per-provider
setup pages.

---

## 4. Maintainer story

- **Maintainer:** GitHub [@arturict](https://github.com/arturict) - a
  single-person maintainer.
- **Funding:** self-funded. There is no commercial sponsor, no
  paid-tier SaaS, and no corporate parent. The infrastructure
  that runs Archivista AI in production is the same Fudligagg
  Lab homelab the maintainer uses personally.
- **Public roadmap:** the entire plan - including phase targets,
  recommended agent routing, and the launch checklist - is
  published at [`docs/agent-roadmap.json`](../../docs/agent-roadmap.json).
  Reviewers can `jq .` it; nothing is hidden behind a wall.
- **Honesty about stage:** the maintainer describes Archivista AI as
  **early stage** in the README and the launch post. There is no
  claim of production-readiness for enterprises, no fabricated
  "trusted by" logos, and no inflated user counts. The launch
  language follows the "better_claims" block in
  `docs/agent-roadmap.json` and avoids the "avoid_claims" block -
  including not claiming that `paperless-gpt` or `paperless-ai` are
  abandoned.
- **Commit cadence:** 22 commits since `v1.0.0`, all on
  `feature/roadmap-execution`, all signed and reviewable.

---

## 5. Planned AI use (specific)

This is the question reviewers ask most directly, so it gets its own
section with a hard boundary between **will** and **will not**.

### 5.1 What Codex / Claude **will** be used for

| Task                       | Human gate?                     | Where in the repo                              |
|----------------------------|---------------------------------|------------------------------------------------|
| **PR triage**              | Human approves triage category  | `.github/workflows/stale.yml` + new triager    |
| **Code review**            | Human reviewer still required   | PR template + reviewer checklist                |
| **Security review**        | Human sign-off on every finding | `SECURITY.md` workflow                         |
| **Docs drafting**          | Human edits before merge        | `docs/`, per-provider pages, `CHANGELOG.md`    |
| **Dependency updates**     | Dependabot PRs, human-reviewed  | `package.json`, `package-lock.json`            |
| **Release notes**          | Human-approved final cut        | GitHub Releases, `docs/CHANGELOG.md`           |
| **Upstream research**      | Summary cited, source linked    | `docs/research/` (e.g. `docs/research/paperless-ngx-12117.md`) |

All of the above are scoped to **drafter / summariser** work. The
human maintainer is the only entity that signs off and merges.

### 5.2 What Codex / Claude will **NOT** be used for

- **No auto-merge.** Every PR is opened, reviewed, and merged by a
  human. There is no bot with merge rights.
- **No mass issue closure.** Issues are closed only after explicit
  human acknowledgement that the closure is correct.
- **No undisclosed marketing copy.** Any AI-assisted post, README
  revision, or social media copy is disclosed as AI-assisted in
  the same artifact, per the disclosure rule in section 6.
- **No silent metadata writes.** The dry-run review mode in
  `services/reviewService.js` and the confidence scoring in
  `services/confidenceGuard.js` prevent an AI agent
  from writing to Paperless without an explicit human-visible
  review step. The `/review/:id/apply` route requires an
  authenticated session (`isAuthenticated` middleware) and is a
  no-op while `DRY_RUN=true` is set in `data/.review`. The
  `thumbnailHelper.js` extraction and the `test-thumbnail-handling.js`
  regression suite are part of the same trust story: the AI never
  has an implicit path to mutate the user's archive.

### 5.3 Recommended agent routing (per `docs/agent-roadmap.json`)

For transparency, the maintainer's own recommended routing for
the project is:

- **Writing public copy:** human-first; AI draft with disclosure
- **Quick repo audits:** human-first; AI summariser only
- **Implementation tasks:** Codex / Claude as pair-programmer; human
  merges
- **Broad product architecture:** human-led; AI deep-review only
- **Launch copy and posts:** AI draft, human review, disclose

---

## 6. Safety & disclosure

- **Disclosure in PRs and community posts.** Any PR or community
  post that is materially AI-assisted carries a visible
  AI-assistance disclosure line. This is enforced by a CONTRIBUTING.md
  rule and is consistent with the recommended agent routing in
  `docs/agent-roadmap.json` (the "disclose AI assistance where
  community rules require it" clause).
- **Data does not leave the user's infra unless they choose to.**
  Providers 3 (Ollama) and 4 (OpenAI-compatible custom endpoint) can
  be fully local. The other three providers are opt-in: if the
  operator does not configure a key, no traffic leaves the host.
  There is no telemetry, no analytics, no "phone home" call in the
  Archivista AI server itself.
- **The dry-run review mode and confidence-guard prevent silent AI
  writes.** The confidence scoring work in `services/confidenceGuard.js`
  and the dry-run review mode in `services/reviewService.js` ensure
  that the AI's proposed metadata changes are surfaced to the user as
  a **diff** (rendered in `views/history.ejs` via
  `public/js/history.js`) before they are written. The maintainer
  treats this as the load-bearing trust boundary of the project.
- **No secrets in the repo.** Provider keys are read from
  environment variables only. There is a pre-commit guard
  (see `.github/workflows/ci.yml`) that fails the build on
  detected key patterns.

---

## 7. Application timing

The maintainer is **not** applying today. The public, written criteria
for application are:

1. At least **3 public releases** tagged on `main` (currently: 1
   tag, `v1.0.0`).
2. **10+ merged PRs from external contributors** (currently: 0; the
   first external-contribution wave is being staged alongside the
   community launch).
3. **50+ open issues resolved** through the public tracker
   (currently: 0 in the tracker; the 10-15 launch-batch issues
   from `docs/agent-roadmap.json` are the seed).
4. A **30-day production soak on Fudligagg Lab** without
   data-loss or unrecoverable bugs. The maintainer is the first
   user, not a beta tester.

Only when all four criteria are met will the OSS program
application be filed. This protects both the program reviewers
(and their time) and the project (no premature endorsement of
something that has not yet earned it).

---

## 8. Contact

- **GitHub:** [@arturict](https://github.com/arturict)
- **Repo:** <https://github.com/arturict/archivista-ai>
- **Roadmap source of truth:** [`docs/agent-roadmap.json`](../../docs/agent-roadmap.json)
- **CI:** [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

---

## 9. Verification commands (for reviewers)

```bash
# 2.1 - Tag history
git tag --list | sort -V

# 2.1 - Commits since v1.0.0
git log --oneline v1.0.0..HEAD | wc -l

# 2.2 - Total issues
gh issue list --state all --limit 1000 --json state | jq 'length'

# 2.3 - Total PRs
gh pr list --state all --limit 1000 --json state | jq 'length'

# 2.4 - Stars and forks
gh repo view arturict/archivista-ai --json stargazerCount,forkCount

# 3.1 - Fudligagg Lab homelab reference
grep -c Fudligagg docs/agent-roadmap.json

# 4 - Maintainer story source
cat docs/agent-roadmap.json | jq '.positioning, .phases'

# 5 - Recommended agent routing
cat docs/agent-roadmap.json | jq '.recommended_agent_routing'
```
