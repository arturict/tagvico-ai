const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

function runIsolated(script) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-review-test-'));
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({
    name: 'tagvico-review-fixture',
    version: '0.0.0'
  }));
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      DRY_RUN: 'true',
      API_KEY: 'review-route-key',
      JWT_SECRET: 'review-route-secret-that-is-at-least-32-characters'
    }
  });
  fs.rmSync(cwd, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('review suggestions apply and reject by durable suggestion id', () => {
  const script = `
    const assert = require('node:assert/strict');
    const path = require('node:path');
    const root = ${JSON.stringify(repoRoot)};
    const modelPath = path.join(root, 'dist/models/document.js');
    const paperlessPath = path.join(root, 'dist/services/paperlessService.js');
    const historyPath = path.join(root, 'dist/services/historyService.js');
    const controlledPath = path.join(root, 'dist/services/controlledTaggingService.js');
    const customFieldsPath = path.join(root, 'dist/services/customFieldsService.js');

    let patchCall = null;
    let historyCall = null;
    require.cache[paperlessPath] = {
      id: paperlessPath,
      filename: paperlessPath,
      loaded: true,
      exports: {
        getDocument: async (id) => ({ id, title: 'Before', tags: [7], correspondent: null, owner: 99 }),
        patchDocument: async (id, patch) => {
          patchCall = { id, patch };
          return {
            ok: true,
            after: { id, ...patch },
            diff: [{ field: 'title', before: 'Before', after: patch.title, applied: true }]
          };
        },
        getOrCreateCorrespondent: async () => ({ id: 11 }),
        getOrCreateDocumentType: async () => ({ id: 12 }),
        getExistingCustomFields: async () => [],
        findExistingCustomField: async (name) => name === 'Cost center'
          ? { id: 13, name: 'Cost center', type: 'string' }
          : null,
        normalizeDocumentDate: (value) => value === '10.07.2026' ? '2026-07-10' : value,
        getUsers: async () => []
      }
    };
    require.cache[historyPath] = {
      id: historyPath,
      filename: historyPath,
      loaded: true,
      exports: {
        addToHistory: (...args) => { historyCall = args; return true; }
      }
    };
    require.cache[controlledPath] = {
      id: controlledPath,
      filename: controlledPath,
      loaded: true,
      exports: { processSuggestions: async () => ({ tagIds: [9], errors: [] }) }
    };
    require.cache[customFieldsPath] = {
      id: customFieldsPath,
      filename: customFieldsPath,
      loaded: true,
      exports: {
        listFields: async () => [],
        sanitize: () => ({ valid: {}, dropped: [] }),
        validateValue: (field, value) => field.type === 'string' && typeof value === 'string' ? null : 'invalid'
      }
    };

    const model = require(modelPath);
    const review = require(path.join(root, 'dist/services/reviewService.js'));

    (async () => {
      const reservation = await model.reserveReviewSuggestion(515, 'Original title');
      assert.ok(reservation.id > 0);
      assert.equal(await model.reserveReviewSuggestion(515, 'Duplicate'), null);
      await model.stageReviewSuggestion(reservation.id, {
        title: 'Proposed title',
        proposedMetadata: {
          title: 'Proposed title',
          tags: ['Invoice'],
          correspondent: 'Acme',
          created: '10.07.2026',
          owner: 7,
          custom_fields: {
            cost_center: { field_name: 'Cost center', value: 'CH-ZH' }
          }
        },
        originalMetadata: { title: 'Before', tags: [7], correspondent: null }
      });

      const pending = await review.listPendingSuggestions();
      assert.equal(pending.length, 1);
      assert.deepEqual(pending[0].proposed_metadata.tags, ['Invoice']);

      const applied = await review.applySuggestion(reservation.id, 'alice');
      assert.equal(applied.ok, true);
      assert.equal(patchCall.id, 515);
      assert.deepEqual(patchCall.patch.tags, [7, 9]);
      assert.equal(patchCall.patch.title, 'Proposed title');
      assert.equal(patchCall.patch.correspondent, 11);
      assert.equal(patchCall.patch.created, '2026-07-10');
      assert.equal(patchCall.patch.owner, undefined);
      assert.deepEqual(patchCall.patch.custom_fields, [{ field: 13, value: 'CH-ZH' }]);
      assert.equal(historyCall[0], 515);
      assert.equal(historyCall[3], 'Acme');

      const appliedRow = await model.getReviewSuggestion(reservation.id);
      assert.equal(appliedRow.status, 'applied');
      assert.equal(appliedRow.reviewed_by, 'alice');
      assert.equal(await model.isDocumentProcessed(515), true);
      assert.equal(JSON.parse((await model.getOriginalData(515)).snapshot_json).title, 'Before');

      const rejectedReservation = await model.reserveReviewSuggestion(516, 'Reject me');
      await model.stageReviewSuggestion(rejectedReservation.id, {
        title: 'Reject me',
        proposedMetadata: { title: 'No thanks' },
        originalMetadata: { title: 'Reject me' }
      });
      const rejected = await review.rejectSuggestion(rejectedReservation.id, 'bob', 'Wrong document');
      assert.equal(rejected.ok, true);
      const rejectedRow = await model.getReviewSuggestion(rejectedReservation.id);
      assert.equal(rejectedRow.status, 'rejected');
      assert.equal(rejectedRow.review_note, 'Wrong document');
      assert.equal(await model.isDocumentProcessed(516), true);
      assert.equal((await review.listPendingSuggestions()).length, 0);
      assert.equal((await review.applySuggestion(rejectedReservation.id, 'bob')).status, 409);

      await model.closeDatabase();
    })().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;

  runIsolated(script);
});

test('write mode supports review-first, automatic, environment override, and legacy DRY_RUN', () => {
  const script = `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const path = require('node:path');
    const root = ${JSON.stringify(repoRoot)};
    delete process.env.DRY_RUN;
    delete process.env.TAGVICO_WRITE_MODE;
    const review = require(path.join(root, 'dist/services/reviewService.js'));

    assert.equal(review.getWriteMode(), 'review');
    assert.equal(review.isReviewModeEnabled(), true);

    const automatic = review.writeReviewConfig({ WRITE_MODE: 'automatic' });
    assert.equal(automatic.WRITE_MODE, 'automatic');
    assert.equal(automatic.DRY_RUN, 'false');
    assert.equal(review.getWriteMode(), 'automatic');
    assert.equal(review.isReviewModeEnabled(), false);
    assert.match(fs.readFileSync(review.REVIEW_PATH, 'utf8'), /WRITE_MODE=automatic/);

    const legacy = review.writeReviewConfig({ DRY_RUN: 'true' });
    assert.equal(legacy.WRITE_MODE, 'review');
    assert.equal(review.getWriteMode(), 'review');

    process.env.TAGVICO_WRITE_MODE = 'full-access';
    assert.equal(review.getWriteMode(), 'automatic');
  `;

  runIsolated(script);
});

test('review routes authenticate and use stored suggestion ids for apply and reject', () => {
  const script = `
    const assert = require('node:assert/strict');
    const path = require('node:path');
    const root = ${JSON.stringify(repoRoot)};
    const setupPath = path.join(root, 'dist/services/setupService.js');
    const reviewPath = path.join(root, 'dist/services/reviewService.js');
    const calls = [];
    const analyses = [{
      id: 42,
      document_id: 900,
      proposed_metadata: {
        title: 'Stored title',
        tags: ['Invoice'],
        correspondent: 'Acme',
        document_type: 'Receipt'
      }
    }];

    require.cache[setupPath] = {
      id: setupPath,
      filename: setupPath,
      loaded: true,
      exports: { isConfigured: async () => true }
    };
    require.cache[reviewPath] = {
      id: reviewPath,
      filename: reviewPath,
      loaded: true,
      exports: {
        listPendingSuggestions: async (limit) => { calls.push(['list', limit]); return analyses; },
        WRITE_MODES: { REVIEW: 'review', AUTOMATIC: 'automatic' },
        normalizeWriteMode: (value) => value === 'automatic' ? 'automatic' : 'review',
        getWriteMode: () => 'review',
        isReviewModeEnabled: () => true,
        isDryRunEnabled: () => true,
        loadReviewConfig: () => ({ WRITE_MODE: 'review', DRY_RUN: 'true' }),
        applySuggestion: async (id, actor) => {
          calls.push(['apply', id, actor]);
          return { ok: true, suggestion: { id, document_id: 900 }, diff: [] };
        },
        rejectSuggestion: async (id, actor, note) => {
          calls.push(['reject', id, actor, note]);
          return { ok: true, suggestion: { id, document_id: 901 } };
        },
        writeReviewConfig: () => ({ DRY_RUN: 'true' })
      }
    };

    const express = require(path.join(root, 'node_modules/express'));
    const cookieParser = require(path.join(root, 'node_modules/cookie-parser'));
    const router = require(path.join(root, 'dist/routes/setup.js'));

    (async () => {
      const app = express();
      app.use(cookieParser());
      app.use((req, res, next) => {
        res.render = (view, locals) => res.json({ view, locals });
        next();
      });
      app.use(router);
      const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
      });
      const base = 'http://127.0.0.1:' + server.address().port;
      const headers = { 'x-api-key': 'review-route-key' };

      const unauthenticated = await fetch(base + '/review', { redirect: 'manual' });
      assert.equal(unauthenticated.status, 302);

      const listed = await fetch(base + '/review', { headers });
      assert.equal(listed.status, 200);
      const page = await listed.json();
      assert.equal(page.view, 'review');
      assert.equal(page.locals.analyses[0].id, 42);

      const applied = await fetch(base + '/review/42/apply', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Untrusted request-body title' })
      });
      assert.equal(applied.status, 200);
      assert.equal((await applied.json()).documentId, 900);

      const rejected = await fetch(base + '/review/43/reject', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ note: 'Not useful' })
      });
      assert.equal(rejected.status, 200);
      assert.equal((await rejected.json()).documentId, 901);

      const invalid = await fetch(base + '/review/not-an-id/apply', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: '{}'
      });
      assert.equal(invalid.status, 400);
      assert.deepEqual(calls, [
        ['list', 100],
        ['apply', 42, 'api-key'],
        ['reject', 43, 'api-key', 'Not useful']
      ]);

      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    })().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;

  runIsolated(script);
});

test('review page renders proposed metadata and durable suggestion ids', async () => {
  const ejs = require('ejs');
  const html = await ejs.renderFile(path.join(repoRoot, 'views/review.ejs'), {
    title: 'Review',
    version: 'test',
    dryRun: true,
    analyses: [{
      id: 77,
      document_id: 1234,
      proposed_metadata: {
        title: 'Quarterly invoice',
        tags: ['Invoice', 'Finance'],
        correspondent: 'Acme AG',
        document_type: 'Invoice',
        custom_fields: { amount: { field_name: 'Amount', value: '42.00' } }
      }
    }]
  }, { filename: path.join(repoRoot, 'views/review.ejs') });

  assert.match(html, /data-suggestion-id="77"/);
  assert.match(html, /Quarterly invoice/);
  assert.match(html, /Acme AG/);
  assert.match(html, /document type/);
  assert.match(html, /decideOne\(suggestionId, documentId, 'reject'\)/);
  assert.doesNotMatch(html, /data-suggestion-id="1234"/);
});

test('settings UI exposes exclusive review-first and automatic write modes', () => {
  const template = fs.readFileSync(path.join(repoRoot, 'views', 'partials', 'config-form.ejs'), 'utf8');
  const browserCode = fs.readFileSync(path.join(repoRoot, 'public', 'js', 'config-form.js'), 'utf8');
  assert.match(template, /type="radio" name="write_mode" value="review"/);
  assert.match(template, /type="radio" name="write_mode" value="automatic"/);
  assert.match(template, /Full access/);
  assert.doesNotMatch(template, /type="checkbox" name="dry_run"/);
  assert.match(browserCode, /input\[type="radio"\]/);
});

test('manual scan route completes without scheduler-only state', () => {
  const script = `
    const assert = require('node:assert/strict');
    const path = require('node:path');
    const root = ${JSON.stringify(repoRoot)};
    const setupPath = path.join(root, 'dist/services/setupService.js');
    const paperlessPath = path.join(root, 'dist/services/paperlessService.js');
    const reviewPath = path.join(root, 'dist/services/reviewService.js');

    require.cache[setupPath] = {
      id: setupPath,
      filename: setupPath,
      loaded: true,
      exports: { isConfigured: async () => true }
    };
    require.cache[paperlessPath] = {
      id: paperlessPath,
      filename: paperlessPath,
      loaded: true,
      exports: {
        getOwnUserID: async () => 7,
        getTags: async () => [],
        getAllDocuments: async () => [],
        listCorrespondentsNames: async () => [],
        listDocumentTypesNames: async () => []
      }
    };
    require.cache[reviewPath] = {
      id: reviewPath,
      filename: reviewPath,
      loaded: true,
      exports: {
        WRITE_MODES: { REVIEW: 'review', AUTOMATIC: 'automatic' },
        normalizeWriteMode: (value) => value === 'automatic' ? 'automatic' : 'review',
        getWriteMode: () => 'review',
        isReviewModeEnabled: () => true,
        isDryRunEnabled: () => true,
        loadReviewConfig: () => ({ WRITE_MODE: 'review', DRY_RUN: 'true' }),
        writeReviewConfig: () => ({ DRY_RUN: 'true' })
      }
    };

    const express = require(path.join(root, 'node_modules/express'));
    const cookieParser = require(path.join(root, 'node_modules/cookie-parser'));
    const router = require(path.join(root, 'dist/routes/setup.js'));

    (async () => {
      const app = express();
      app.use(cookieParser());
      app.use(router);
      const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
      });
      const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/scan/now', {
        method: 'POST',
        headers: { 'x-api-key': 'review-route-key' }
      });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'Task completed');
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    })().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;

  runIsolated(script);
});
