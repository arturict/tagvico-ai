'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('legacy manual and review backends are not exposed through Next fallback rewrites', () => {
  const config = source('next.config.ts');
  assert.doesNotMatch(config, /source:\s*['"]\/manual\/:path\*['"]/);
  assert.doesNotMatch(config, /source:\s*['"]\/review\/:path\*['"]/);
  assert.match(source('src/app/(app)/manual/page.tsx'), /redirect\(['"]\/automation\/manual['"]\)/);
});

test('review queue API authenticates reads and gates every decision by origin and role', () => {
  const list = source('src/app/api/review-queue/route.ts');
  const decision = source('src/app/api/review-queue/[id]/route.ts');

  assert.match(list, /requireApiUser\(\)/);
  assert.match(list, /canMutate:\s*workspaceFor\(user\)\.role !== ['"]viewer['"]/);
  assert.match(decision, /assertSameOrigin\(request\)/);
  assert.match(decision, /requireApiUser\(\)/);
  assert.match(decision, /assertCanMutateWorkspace\(workspaceFor\(user\)\.role\)/);
  assert.match(decision, /reviewService\.applySuggestion\(id,\s*actor\)/);
  assert.match(decision, /reviewService\.rejectSuggestion\(id,\s*actor/);
  assert.doesNotMatch(decision, /proposed_metadata|original_metadata/);
});

test('manual API reads authenticate and mutations enforce same-origin role checks', () => {
  for (const route of [
    'src/app/api/manual/options/route.ts',
    'src/app/api/manual/documents/route.ts',
    'src/app/api/manual/preview/[id]/route.ts'
  ]) {
    assert.match(source(route), /requireApiUser\(\)/, route);
  }

  for (const route of [
    'src/app/api/manual/analyze/route.ts',
    'src/app/api/manual/update-document/route.ts'
  ]) {
    const contents = source(route);
    assert.match(contents, /assertSameOrigin\(request\)/, route);
    assert.match(contents, /requireApiUser\(\)/, route);
    assert.match(contents, /assertCanMutateWorkspace\(workspaceFor\(user\)\.role\)/, route);
    assert.match(contents, /Number\.isSafeInteger/, route);
  }
});

test('manual workspace only uses guarded Next APIs and respects read-only roles', () => {
  const workspace = source('src/components/manual-processing-workspace.tsx');
  assert.match(workspace, /['"]\/api\/manual\/documents['"]/);
  assert.match(workspace, /`\/api\/manual\/preview\/\$\{encodeURIComponent\(nextId\)\}`/);
  assert.match(workspace, /['"]\/api\/manual\/analyze['"]/);
  assert.match(workspace, /['"]\/api\/manual\/update-document['"]/);
  assert.doesNotMatch(workspace, /['"]\/manual\/(documents|analyze|updateDocument)/);
  assert.match(workspace, /disabled=\{options\.canMutate !== true \|\| !previewReady/);
  assert.match(workspace, /options\.documentTypes\.find/);
  assert.match(workspace, /requestId !== previewRequest\.current/);
});

test('review workspace disables decisions for read-only roles', () => {
  const workspace = source('src/components/review-queue-workspace.tsx');
  assert.match(workspace, /if \(!canMutate\) return/);
  assert.match(workspace, /if \(!canMutate \|\| batchBusy\) return/);
  assert.match(workspace, /disabled=\{!canMutate \|\| !selectedSuggestions\.length \|\| batchBusy/);
  assert.match(workspace, /disabled=\{!canMutate \|\| batchBusy \|\| isBusy\}/);
});
