const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-tag-unification-'));
process.env.TAGVICO_DATA_DIR = dataDir;

const { createTagUnificationService } = require('../dist/services/tagUnificationService');
const store = require('../dist/services/tagUnificationStore');
const documentModel = require('../dist/models/document');

function fakePaperless() {
  const tags = new Map([
    [1, { id: 1, name: 'Invoices' }],
    [2, { id: 2, name: 'Invoice' }],
    [3, { id: 3, name: 'Finance' }],
    [4, { id: 4, name: 'Bills' }]
  ]);
  const documents = new Map([
    [101, { id: 101, title: 'A', tags: [1, 3] }],
    [102, { id: 102, title: 'B', tags: [1] }],
    [103, { id: 103, title: 'C', tags: [4] }]
  ]);
  const calls = { patches: 0, deletes: 0 };
  const countFor = (tagId) => [...documents.values()].filter((document) => document.tags.includes(tagId)).length;
  return {
    calls,
    tags,
    documents,
    async getTags() {
      return [...tags.values()].map((tag) => ({ ...tag, document_count: countFor(tag.id) }));
    },
    async getTag(id) {
      const tag = tags.get(id);
      return tag ? { ...tag, document_count: countFor(id) } : null;
    },
    async getDocumentsByTag(id) {
      return [...documents.values()]
        .filter((document) => document.tags.includes(id))
        .map((document) => ({ ...document, tags: [...document.tags] }));
    },
    async getDocument(id) {
      const document = documents.get(id);
      if (!document) throw new Error('Document not found');
      return { ...document, tags: [...document.tags] };
    },
    async patchDocument(id, patch) {
      const document = documents.get(id);
      if (!document) return { ok: false, error: 'Document not found' };
      calls.patches += 1;
      document.tags = [...patch.tags];
      return { ok: true };
    },
    async deleteUnusedTag(id) {
      const tag = tags.get(id);
      if (!tag) throw new Error('Tag not found');
      if (countFor(id)) throw new Error('Tag is assigned to documents');
      calls.deletes += 1;
      tags.delete(id);
      return tag;
    }
  };
}

function fakeInference() {
  return {
    async configuredProviders() {
      return [{ instanceId: 'codex', name: 'ChatGPT subscription', discovery: 'codex' }];
    },
    async analyze(_input, tags) {
      const crypto = require('node:crypto');
      return {
        output: {
          suggestions: [{
            sourceTagId: 1,
            targetTagId: 2,
            reason: 'Plural and singular forms represent the same invoice concept.',
            confidence: 0.97
          }, {
            sourceTagId: 4,
            targetTagId: 2,
            reason: 'Bills is used as a duplicate invoice label.',
            confidence: 0.91
          }, {
            sourceTagId: 2,
            targetTagId: 3,
            reason: 'This overlapping chain must be discarded for safe independent review.',
            confidence: 0.6
          }, {
            sourceTagId: 99,
            targetTagId: 2,
            reason: 'A hallucinated tag ID must be discarded.',
            confidence: 0.9
          }]
        },
        snapshotHash: crypto.createHash('sha256').update(JSON.stringify(tags)).digest('hex')
      };
    }
  };
}

test.after(async () => {
  await documentModel.closeDatabase();
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test('analysis is read-only and every unification requires approval plus two explicit idempotent phases', async () => {
  const paperless = fakePaperless();
  const service = createTagUnificationService({ paperless, inference: fakeInference(), store });

  const analysis = await service.analyze({
    providerInstanceId: 'codex',
    modelId: 'gpt-5.6-terra'
  });
  assert.equal(analysis.tagsAnalyzed, 4);
  assert.equal(analysis.suggestions.length, 2);
  assert.deepEqual(
    analysis.suggestions.map((suggestion) => suggestion.targetTagId),
    [2, 2]
  );
  assert.equal(paperless.calls.patches, 0);
  assert.equal(paperless.calls.deletes, 0);

  const duplicateAnalysis = await service.analyze({
    providerInstanceId: 'codex',
    modelId: 'gpt-5.6-terra'
  });
  assert.equal(duplicateAnalysis.suggestions.length, 0);

  const suggestion = analysis.suggestions[0];
  await assert.rejects(
    service.execute(suggestion.id, { phase: 'move' }, 'owner'),
    /Approve this suggestion/
  );

  const approved = service.decide(suggestion.id, { decision: 'approved' }, 'owner');
  assert.equal(approved.status, 'approved');
  await assert.rejects(
    service.execute(suggestion.id, { phase: 'delete' }, 'owner'),
    /Move all documents/
  );

  const moved = await service.execute(suggestion.id, { phase: 'move' }, 'owner');
  assert.equal(moved.suggestion.status, 'moved');
  assert.deepEqual(paperless.documents.get(101).tags.sort((a, b) => a - b), [2, 3]);
  assert.deepEqual(paperless.documents.get(102).tags, [2]);
  assert.equal(paperless.calls.patches, 2);
  assert.equal(paperless.calls.deletes, 0);

  const repeatedMove = await service.execute(suggestion.id, { phase: 'move' }, 'owner');
  assert.equal(repeatedMove.idempotent, true);
  assert.equal(paperless.calls.patches, 2);

  const deleted = await service.execute(suggestion.id, { phase: 'delete' }, 'owner');
  assert.equal(deleted.suggestion.status, 'completed');
  assert.equal(paperless.tags.has(1), false);
  assert.equal(paperless.calls.deletes, 1);

  const repeatedDelete = await service.execute(suggestion.id, { phase: 'delete' }, 'owner');
  assert.equal(repeatedDelete.idempotent, true);
  assert.equal(paperless.calls.deletes, 1);

  const audit = service.get(suggestion.id).audit;
  assert.ok(audit.some((entry) => entry.phase === 'decision' && entry.action === 'approved'));
  assert.equal(audit.filter((entry) => entry.action === 'replace_document_tag' && entry.outcome === 'success').length, 2);
  assert.ok(audit.some((entry) => entry.phase === 'delete' && entry.action === 'delete_source_tag'));
  assert.equal(
    service.decide(analysis.suggestions[1].id, { decision: 'rejected' }, 'owner').status,
    'rejected'
  );
});

test('rejected suggestions can never mutate Paperless', async () => {
  const paperless = fakePaperless();
  const service = createTagUnificationService({ paperless, inference: fakeInference(), store });
  const analysis = await service.analyze({
    providerInstanceId: 'codex',
    modelId: 'gpt-5.6-luna'
  });
  const suggestion = analysis.suggestions[0];
  assert.equal(service.decide(suggestion.id, { decision: 'rejected' }, 'owner').status, 'rejected');
  await assert.rejects(
    service.execute(suggestion.id, { phase: 'move' }, 'owner'),
    /Approve this suggestion/
  );
  assert.equal(paperless.calls.patches, 0);
  assert.equal(paperless.calls.deletes, 0);
});
