# TypeScript migration

Archivista AI is being migrated from JavaScript to TypeScript incrementally. The goal is to keep the runtime behavior unchanged while turning every file in the runtime source tree into a typed, type-checked module that compiles under `tsc --noEmit`.

This document explains how the migration is driven, what the automated pass does, and what is expected from human reviewers.

## Status

- **TypeScript runtime modules** — `services/configHelpers.ts`, `services/metadataDiff.ts`, `services/thumbnailHelper.ts`, `services/confidenceGuard.ts`, `services/providerCatalogService.ts` are typed and live alongside their JavaScript counterparts during the transition. The CI `typecheck` job verifies they compile cleanly.
- **Automated JS → TS pass** — the `.github/workflows/typescript-migration.yml` workflow and the `scripts/migrate-js-to-ts.js` script handle the bulk conversion of the remaining files.
- **Type-tightening follow-up** — once a file has been auto-converted, a human reviewer removes the `// @ts-nocheck` pragma and adds proper types. The automated pass never edits an already-converted file.

## How the workflow runs

The GitHub Actions workflow in `.github/workflows/typescript-migration.yml`:

1. **Triggers** on push to `main` (when JS files change), on a weekly cron, and on manual dispatch from the Actions tab.
2. **Discovers candidates** by running `scripts/migrate-js-to-ts.js` with the configured target glob (default `services/**/*.js`).
3. **Writes a JSON report** describing candidates, converted files, and skipped files with reasons.
4. **Converts each candidate** by:
   - Prepending a `// @ts-nocheck — auto-converted by scripts/migrate-js-to-ts.js.` pragma so the file type-checks even while neighbors are still being migrated.
   - Stripping a leading `'use strict';` directive (we are CommonJS via `tsconfig.json`).
   - Saving the result next to the source as a `.ts` file. The original `.js` is **kept** for now so the runtime can fall back to it; a follow-up PR removes the JS source once the corresponding `require(...)` call sites have been updated to `import`.
5. **Opens (or updates) a draft pull request** titled `chore(ts): incremental JS → TS migration` against `main`. The PR body lists the converted files, the skipped files, and the reason for each skip.
6. **Uploads the report** as a workflow artifact for inspection.

The workflow is intentionally conservative:

- It never force-pushes or rebases the migration branch.
- The migration branch (`typescript/migrate-remaining`) is updated by merge from `main` between runs, so it does not get out of date.
- Files in the exclude set (`server.js`, `schemas.js`, `ecosystem.config.js`, `eslint.config.mjs`, `swagger.js`) are migrated manually because they are bootstrap code, build-time config, or depend on the final REST API shape.

## Running the converter locally

The script is the same one the workflow uses. Run it from the repo root:

```bash
# Dry-run: see what would be converted without writing files.
node scripts/migrate-js-to-ts.js

# Actually write the .ts files alongside the .js files.
node scripts/migrate-js-to-ts.js --write

# Convert a single file.
node scripts/migrate-js-to-ts.js --target services/paperlessService.js

# Convert everything in routes/ and services/.
node scripts/migrate-js-to-ts.js --target 'services/**/*.js'
node scripts/migrate-js-to-ts.js --target 'routes/**/*.js'
```

The script prints a short summary on stdout and writes `migration-report.json` with the per-file decisions. The report is `.gitignore`d — it is a workflow artifact, not something to commit.

## Review checklist for human reviewers

When a converted file lands in the migration PR:

1. **Verify the file is on the conversion list.** Open `migration-report.json` from the workflow run to confirm it was produced by the automated pass and not by a one-off edit.
2. **Read the converted file in full.** The conversion is mechanical; semantics are unchanged. Spot-check that nothing important was lost.
3. **Tighten the types.** Replace `// @ts-nocheck` with real types. Most files are small enough that a single commit can take them from `any` to fully typed.
4. **Switch call sites from `require` to `import`** if the surrounding code is already on `import`. We target CommonJS via `tsconfig.json`, so a `const foo = require('./foo')` still works — the import is purely a readability improvement.
5. **Remove the original `.js` file** once no other file requires it. The migration script leaves the JS in place to make the rollout safe; the cleanup commit is part of the same PR.
6. **Run `npm run typecheck` and `npm run lint`** locally before pushing. The CI `quality` job runs the same checks.

## What is *not* in scope

- **Switching the runtime to ESM.** The compiled output is still CommonJS (`module: "CommonJS"` in `tsconfig.json`). We are not changing module resolution while the migration is in flight.
- **Adding new dependencies** for the migration. The script uses only Node built-ins.
- **Refactoring unrelated code** during the conversion. Mechanical conversion only; refactors go in their own PR.
- **Replacing the CI gate.** The `quality` job in `.github/workflows/ci.yml` already runs `tsc --noEmit`. The migration workflow only *writes* the .ts files and reports the result.

## Files in this migration

- `.github/workflows/typescript-migration.yml` — the GitHub Actions workflow.
- `scripts/migrate-js-to-ts.js` — the converter script.
- `tsconfig.json` — the TypeScript configuration; updated to include the wider source tree (`routes/`, `scripts/`, `schemas.ts`, `server.ts`) so the conversion is checked end-to-end.
- `migration-report.json` (generated, `.gitignore`d) — the per-run report.
