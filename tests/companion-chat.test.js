const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('node:http');

const companion = require('../dist/contracts/companion');
const research = require('../dist/services/companionResearchService');

const json = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
};
const readBody = async (request) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
};

test('citations survive only for documents a tool returned', () => {
  const text = 'Renewal is due [doc:6]. A guess [doc:99] and another [doc:7].';
  assert.equal(
    companion.groundCompanionCitations(text, [6, 7]),
    'Renewal is due [doc:6]. A guess and another [doc:7].'
  );
  assert.equal(companion.groundCompanionCitations('Nothing found [doc:1]', []), 'Nothing found');
  const ids = companion.companionDocumentIds([
    { toolName: 'search_documents', label: '', detail: '', status: 'succeeded', result: { documents: [{ id: 6, title: 'A' }, { id: 7, title: 'B' }] } },
    { toolName: 'list_actions', label: '', detail: '', status: 'succeeded', result: { count: 2 } }
  ]);
  assert.deepEqual(ids, [6, 7]);
});

test('tool and model failures reduce to calm, private-detail-free sentences', () => {
  const refused = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:8000'), { code: 'ECONNREFUSED' });
  assert.equal(companion.classifyCompanionToolError(refused), companion.COMPANION_TOOL_ERRORS.unreachable);
  assert.equal(
    companion.classifyCompanionToolError(Object.assign(new Error('Request failed with status code 403'), { response: { status: 403 } })),
    companion.COMPANION_TOOL_ERRORS.access
  );
  assert.equal(
    companion.classifyCompanionToolError(new Error('A personal Paperless token is required for this household member')),
    companion.COMPANION_TOOL_ERRORS.access
  );
  assert.equal(companion.classifyCompanionToolError(new Error('secret-token-in-url')), companion.COMPANION_TOOL_ERRORS.generic);

  const failed = companion.companionToolActivity('search_documents', 'output-error', {}, companion.COMPANION_TOOL_ERRORS.unreachable);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.detail, companion.COMPANION_TOOL_ERRORS.unreachable);
  assert.equal(
    companion.companionToolActivity('search_documents', 'output-error', {}, 'raw provider text with a token').detail,
    companion.COMPANION_TOOL_ERRORS.generic
  );

  class ChatGPTPlanError extends Error { constructor(message) { super(message); this.name = 'ChatGPTPlanError'; } }
  const plan = companion.describeCompanionModelError(new ChatGPTPlanError('Sign in with ChatGPT in Settings first.'));
  assert.deepEqual(plan, { code: 'chatgpt', message: 'Sign in with ChatGPT in Settings first.' });
  assert.equal(companion.describeCompanionModelError(Object.assign(new Error('401 for sk-secret'), { statusCode: 401 })).code, 'provider-auth');
  assert.equal(companion.describeCompanionModelError(Object.assign(new Error('x'), { statusCode: 429 })).code, 'provider-limit');
  assert.equal(companion.describeCompanionModelError(new Error('fetch failed')).code, 'provider-unreachable');
  assert.equal(companion.describeCompanionModelError(new Error('No API key configured for openai')).code, 'no-provider');
  const generic = companion.describeCompanionModelError(new Error('sk-secret at https://internal.example'));
  assert.equal(generic.code, 'generic');
  assert.equal(JSON.stringify(generic).includes('sk-secret'), false);

  const encoded = companion.encodeCompanionError(plan);
  assert.deepEqual(companion.parseCompanionError(encoded), plan);
  assert.deepEqual(companion.parseCompanionError('plain failure'), { code: 'generic', message: 'plain failure' });
});

test('proposals are described in plain words and their outcome survives a reload', () => {
  const pending = companion.toCompanionApprovalView({
    id: 'a1', action_type: 'action.create', status: 'pending', session_id: 's1', created_at: '2026-10-01 10:00:00',
    payload: { paperlessDocumentId: 6, title: 'Review renewal', summary: 'Compare offers', dueAt: '2026-10-15', priority: 'high', steps: [{ title: 'Call' }] }
  });
  assert.equal(pending.copy.title, 'Review renewal');
  assert.equal(pending.copy.meta, 'Document #6');
  assert.deepEqual(pending.copy.details, ['Compare offers', 'Due 2026-10-15', 'Priority: high', '1 step']);
  assert.equal(pending.outcome, null);

  const executed = companion.toCompanionApprovalView({
    id: 'a1', action_type: 'action.create', status: 'executed', payload: {},
    result: { case: { id: 'case-1', title: 'Review renewal' }, sync: { ok: false, error: 'down' } }
  });
  assert.equal(executed.outcome.tone, 'done');
  assert.equal(executed.outcome.href, '/actions/case-1');
  assert.match(executed.outcome.detail, /could not be written to Paperless/);

  const patched = companion.describeCompanionApprovalOutcome('paperless.patch', 'executed', { documentId: 6, changedFields: ['title', 'tags'] });
  assert.equal(patched.href, '/documents/6');
  assert.equal(patched.detail, 'Changed: title, tags.');
  assert.equal(companion.describeCompanionApprovalOutcome('paperless.tag.create', 'failed', { error: 'Paperless said no' }).detail, 'Paperless said no');
  assert.equal(companion.describeCompanionApprovalOutcome('paperless.tag.create', 'rejected', null).tone, 'rejected');
  assert.equal(companion.describeCompanionApprovalOutcome('paperless.tag.create', 'approved', null), null);

  const withId = companion.companionToolActivity('propose_tag_create', 'output-available', {}, { id: 'abcd1234-aaaa-bbbb', status: 'pending' });
  assert.equal(withId.result.approvalId, 'abcd1234-aaaa-bbbb');
  const fromSafeOutput = companion.companionToolActivity('propose_tag_create', 'output-available', {}, companion.safeCompanionToolOutput('propose_tag_create', {}, { id: 'abcd1234-aaaa-bbbb' }));
  assert.equal(fromSafeOutput.result.approvalId, 'abcd1234-aaaa-bbbb');
  assert.equal(companion.companionToolActivity('search_documents', 'output-available', {}, [{ id: 3, title: 'X' }]).result.approvalId, undefined);
});

test('start prompts only promise what the tools can do and use real titles', () => {
  const offline = research.buildCompanionSuggestions({ nextAction: null });
  assert.deepEqual(offline.map((entry) => entry.icon), ['calendar']);

  const online = research.buildCompanionSuggestions({
    nextAction: { title: 'Pay rent', dueAt: '2026-10-03T00:00:00Z' },
    recentDocuments: [{ id: 6, title: 'Hausratversicherung “Verlängerung”' }]
  });
  assert.equal(online[0].hint, 'Next: Pay rent, due 2026-10-03');
  assert.ok(online.some((entry) => entry.prompt === 'Summarize document #6, “Hausratversicherung Verlängerung”.'));
  assert.ok(online.some((entry) => entry.kind === 'Approval'));
  // Every prompt must map to a tool plan without a model.
  for (const entry of online) {
    const plan = research.planCompanionResearch(entry.prompt);
    assert.ok(plan.steps.length > 0, `no tool plan for: ${entry.prompt}`);
  }
  assert.deepEqual(research.planCompanionResearch('Prepare a follow-up action for document #6.').steps, [
    { toolName: 'propose_followup', input: { documentId: 6, request: 'Prepare a follow-up action for document #6.' } }
  ]);
  assert.deepEqual(research.planCompanionResearch('Which tags do I have, and how many documents use each?').steps, [
    { toolName: 'list_tags', input: { limit: 100 } }
  ]);
  const quoted = research.planCompanionResearch('Find the document “Mietvertrag Kriens” and summarize it.');
  assert.deepEqual(quoted.steps.map((step) => step.toolName), ['search_documents']);
  assert.equal(quoted.steps[0].input.query, 'Mietvertrag Kriens');
});

async function createHarness() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-chat-'));
  const documents = new Map([
    [6, { id: 6, title: 'Hausrat renewal', created: '2026-09-29', modified: '2026-09-29', content: 'Reply by 2026-10-15.', tags: [], custom_fields: [] }],
    [7, { id: 7, title: 'Tax question', created: '2026-09-28', modified: '2026-09-28', content: 'Please send receipts.', tags: [], custom_fields: [] }]
  ]);
  const tags = new Map();
  const customFields = new Map();
  let nextId = 100;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const resource = url.pathname === '/api/tags/' ? tags : url.pathname === '/api/custom_fields/' ? customFields : null;
    if (resource && request.method === 'GET') {
      const exact = url.searchParams.get('name__iexact');
      const contains = url.searchParams.get('name__icontains')?.toLowerCase();
      const results = exact
        ? [resource.get(exact)].filter(Boolean)
        : [...resource.values()].filter((entry) => !contains || entry.name.toLowerCase().includes(contains));
      return json(response, 200, { count: results.length, results });
    }
    if (resource && request.method === 'POST') {
      const body = await readBody(request);
      const created = { id: nextId++, name: body.name, color: body.color || '#ffffff', text_color: '#000000', document_count: 0, ...body };
      resource.set(body.name, created);
      return json(response, 201, created);
    }
    const tagDetail = url.pathname.match(/^\/api\/tags\/(\d+)\/$/);
    if (tagDetail) {
      const entry = [...tags.values()].find((tag) => tag.id === Number(tagDetail[1]));
      return entry ? json(response, 200, entry) : json(response, 404, { detail: 'Not found' });
    }
    const detail = url.pathname.match(/^\/api\/documents\/(\d+)\/$/);
    if (detail) {
      const document = documents.get(Number(detail[1]));
      if (!document) return json(response, 404, { detail: 'Not found' });
      if (request.method === 'PATCH') {
        Object.assign(document, await readBody(request));
        return json(response, 200, document);
      }
      return json(response, 200, document);
    }
    if (url.pathname === '/api/documents/') {
      const query = url.searchParams.get('query')?.toLowerCase();
      const results = [...documents.values()]
        .filter((document) => !query || document.title.toLowerCase().includes(query))
        .map(({ id, title, created, modified }) => ({ id, title, created, modified }));
      return json(response, 200, { count: documents.size, results });
    }
    return json(response, 404, { detail: 'Not found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  {
    const address = server.address();
    process.env.TAGVICO_DATA_DIR = dataDir;
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-chat-tests';
    delete process.env.PAPERLESS_API_URL;
    delete process.env.PAPERLESS_API_TOKEN;
    const writeEnv = (url) => fs.writeFileSync(path.join(dataDir, '.env'), [
      `PAPERLESS_API_URL=${url}`,
      'PAPERLESS_API_TOKEN=owner-admin-token'
    ].join('\n'));
    writeEnv(`http://127.0.0.1:${address.port}/api`);
    const documentModel = require('../dist/models/document');
    const actions = require('../dist/models/actionCenter');
    const agent = require('../dist/services/companionAgentService');
    const executor = require('../dist/services/approvalExecutor');
    const db = documentModel.getDatabase();
    const userId = Number(db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('owner', 'hash').lastInsertRowid);
    const workspace = actions.ensureWorkspaceForUser(userId, 'owner');
    const sessionId = actions.createSession(workspace.id, workspace.member_id, 'web');
    const context = { householdId: workspace.id, memberId: workspace.member_id, sessionId };
    return {
      server, actions, agent, executor, context, workspace, documents, tags, writeEnv, url: `http://127.0.0.1:${address.port}/api`,
      turn: async (history, generateText) => {
        const chunks = [];
        const result = await agent.runAdapterTurn({
          context,
          history,
          signal: new AbortController().signal,
          generateText,
          write: (chunk) => chunks.push(chunk)
        });
        return { ...result, chunks };
      }
    };
  }
}

// One database per process, so every test shares one household and Paperless.
let sharedHarness;
const harness = () => {
  sharedHarness ||= createHarness();
  return sharedHarness;
};
async function withChatWorkspace(run) {
  await run(await harness());
}
test.after(async () => {
  if (!sharedHarness) return;
  const { server } = await sharedHarness;
  await new Promise((resolve) => server.close(resolve));
  await require('../dist/models/document').closeDatabase();
});

test('text-adapter turn reads real Paperless data, cites only returned documents and stores approvals durably', async () => {
  await withChatWorkspace(async ({ actions, context, turn }) => {
    const prompts = [];
    const planned = JSON.stringify({ calls: [{ toolName: 'search_documents', input: { query: 'hausrat' } }] });
    const generate = async (prompt) => {
      prompts.push(prompt);
      return prompts.length === 1
        ? planned
        : 'Your renewal is in document [doc:6] and not in [doc:7] or the invented [doc:55].';
    };
    const result = await turn([{ role: 'user', text: 'Find my Hausrat insurance documents' }], generate);

    assert.deepEqual(result.activities.map((entry) => [entry.toolName, entry.status]), [['search_documents', 'succeeded']]);
    assert.deepEqual(result.activities[0].result.documents.map((entry) => entry.id), [6]);
    assert.equal(result.text, 'Your renewal is in document [doc:6] and not in or the invented.');
    assert.match(prompts[1], /Hausrat renewal/, 'the answer prompt must carry the Paperless research');
    const types = result.chunks.map((chunk) => chunk.type);
    assert.deepEqual(types.slice(0, 3), ['tool-input-start', 'tool-input-available', 'tool-output-available']);
    assert.equal(types.at(-1), 'text-end');
    assert.equal(JSON.stringify(result.chunks).includes('Reply by'), false, 'document content must not reach the browser');

    const proposal = await turn(
      [{ role: 'user', text: 'Create a Paperless tag named “To review”.' }],
      async () => 'I prepared the tag. It waits for approval.'
    );
    assert.equal(proposal.activities[0].toolName, 'propose_tag_create');
    const approvalId = proposal.activities[0].result.approvalId;
    assert.ok(approvalId, 'the proposal activity links to its approval');
    const stored = actions.getApproval(context.householdId, approvalId);
    assert.equal(stored.status, 'pending');
    assert.equal(stored.session_id, context.sessionId);
    assert.equal(stored.payload.name, 'To review');
  });
});

test('follow-up proposals without a planning model still read the document and create an approval that executes', async () => {
  await withChatWorkspace(async ({ actions, context, turn, executor, workspace }) => {
    const result = await turn(
      [{ role: 'user', text: 'Prepare a follow-up action for document #6.' }],
      async () => 'Prepared. It waits for your approval.'
    );
    assert.deepEqual(result.activities.map((entry) => entry.toolName), ['get_document', 'propose_action']);
    const approval = actions.getApproval(context.householdId, result.activities[1].result.approvalId);
    assert.equal(approval.payload.title, 'Follow up: Hausrat renewal');
    assert.equal(approval.payload.paperlessDocumentId, 6);

    actions.decideApproval(context.householdId, approval.id, workspace.member_id, 'approved');
    const done = await executor.executeApproval(context.householdId, approval.id, workspace.member_id);
    assert.equal(done.status, 'executed');
    const view = companion.toCompanionApprovalView({ id: done.id, action_type: done.action_type, status: done.status, payload: done.payload, result: done.result });
    assert.equal(view.outcome.tone, 'done');
    assert.match(view.outcome.href, /^\/actions\//);
    assert.equal(actions.listCases(context.householdId, { status: 'open' }).some((entry) => entry.title === 'Follow up: Hausrat renewal'), true);
  });
});

test('Paperless outages and missing tokens surface as calm tool failures, and the answer still arrives', async () => {
  await withChatWorkspace(async ({ actions, agent, context, turn, writeEnv, workspace, url }) => {
    writeEnv('http://127.0.0.1:9/api');
    const down = await turn([{ role: 'user', text: 'How many documents are in Paperless?' }], async () => 'I could not reach Paperless.');
    assert.equal(down.activities[0].status, 'failed');
    assert.equal(down.activities[0].detail, companion.COMPANION_TOOL_ERRORS.unreachable);
    assert.equal(down.chunks.find((chunk) => chunk.type === 'tool-output-error').errorText, companion.COMPANION_TOOL_ERRORS.unreachable);
    assert.equal(down.text, 'I could not reach Paperless.');

    const member = actions.addHouseholdMember(workspace.id, 'Kid', 'member');
    const executors = agent.companionToolExecutors({ ...context, memberId: member.id });
    await assert.rejects(() => executors.search_documents({ query: 'tax' }), new RegExp(companion.COMPANION_TOOL_ERRORS.access));
    await assert.rejects(() => executors.get_document({ documentId: -1 }), new RegExp(companion.COMPANION_TOOL_ERRORS.generic));
    writeEnv(url);
  });
});

test('list_actions hands the model compact cases, not raw database rows', async () => {
  await withChatWorkspace(async ({ actions, agent, context, workspace }) => {
    actions.createCase(workspace.id, workspace.member_id, { paperlessDocumentId: 7, title: 'Pay invoice', dueAt: '2026-10-03', priority: 'high' });
    const listed = await agent.companionToolExecutors(context).list_actions({});
    const invoice = listed.find((entry) => entry.title === 'Pay invoice');
    assert.deepEqual(Object.keys(invoice).sort(), [
      'assignee', 'dueAt', 'id', 'paperlessDocumentId', 'priority', 'status', 'steps', 'stepsDone', 'summary', 'title'
    ]);
    assert.equal(invoice.dueAt, '2026-10-03');

    // One action per document: a second proposal is explained, not queued as an approval that could never apply.
    const duplicate = await agent.companionToolExecutors(context).propose_action({ paperlessDocumentId: 7, title: 'Again' });
    assert.equal(duplicate.created, false);
    assert.match(duplicate.summary, /already has the action “Pay invoice”/);
    const activity = companion.companionToolActivity('propose_action', 'output-available', {}, duplicate);
    assert.equal(activity.result.approvalId, undefined);
    assert.match(activity.detail, /No proposal was created/);
  });
});

test('the adapter planner only trusts a fully valid plan', () => {
  const agent = require('../dist/services/companionAgentService');
  assert.deepEqual(
    agent.parseAdapterToolPlan('```json\n{"calls":[{"toolName":"get_document","input":{"documentId":6}}]}\n```'),
    [{ toolName: 'get_document', input: { documentId: 6 } }]
  );
  assert.deepEqual(agent.parseAdapterToolPlan('{"calls":[{"toolName":"get_document","input":{"documentId":"six"}}]}'), []);
  assert.deepEqual(agent.parseAdapterToolPlan('{"calls":[{"toolName":"delete_everything","input":{}}]}'), []);
  assert.deepEqual(agent.parseAdapterToolPlan('not json'), []);
  assert.match(agent.companionSystemPrompt(new Date('2026-10-01T10:00:00Z')), /Today is 2026-10-01/);
  assert.doesNotMatch(agent.companionSystemPrompt(), /Ask Tagvico/);
});
