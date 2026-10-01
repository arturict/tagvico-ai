import assert from 'node:assert/strict';

const baseUrl = process.env.TAGVICO_ACCEPTANCE_BASE_URL || 'http://127.0.0.1:4310';
const mockUrl = process.env.TAGVICO_ACCEPTANCE_MOCK_URL || 'http://release-mock:4010';
const paperlessUrl = process.env.TAGVICO_ACCEPTANCE_PAPERLESS_URL || 'http://paperless-ngx:8000';
const paperlessUsername = process.env.TAGVICO_ACCEPTANCE_PAPERLESS_USERNAME || 'tagvico-e2e';
const paperlessPassword = process.env.TAGVICO_ACCEPTANCE_PAPERLESS_PASSWORD || 'tagvico-e2e-password';
const origin = new URL(baseUrl).origin;
const headers = { origin, 'content-type': 'application/json' };

const responseJson = async (response) => ({ response, body: await response.json().catch(() => ({})) });
const request = (path, options = {}) => fetch(`${baseUrl}${path}`, options);

function relatedDocumentId(task) {
  const directId = Number(task?.related_document);
  if (Number.isSafeInteger(directId) && directId > 0) return directId;
  if (task?.related_document && typeof task.related_document === 'object') {
    const id = Number(task.related_document.id);
    if (Number.isSafeInteger(id) && id > 0) return id;
  }
  return null;
}

const health = await responseJson(await request('/health'));
assert.equal(health.response.status, 200);

const tokenResult = await responseJson(await fetch(`${paperlessUrl}/api/token/`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: paperlessUsername, password: paperlessPassword })
}));
assert.equal(tokenResult.response.status, 200, JSON.stringify(tokenResult.body));
assert.match(String(tokenResult.body.token || ''), /^[a-f0-9]{40}$/);
const paperlessToken = String(tokenResult.body.token);
const paperlessHeaders = { authorization: `Token ${paperlessToken}` };

const paperlessUsers = await responseJson(await fetch(
  `${paperlessUrl}/api/users/?username=${encodeURIComponent(paperlessUsername)}`,
  { headers: paperlessHeaders }
));
assert.equal(paperlessUsers.response.status, 200, JSON.stringify(paperlessUsers.body));
const paperlessUser = paperlessUsers.body.results?.find((user) => user.username === paperlessUsername);
assert.ok(Number.isInteger(paperlessUser?.id));

async function uploadPaperlessDocument({ title, content, filename }) {
  const form = new FormData();
  form.append('document', new Blob([content], { type: 'text/plain' }), filename);
  form.append('title', title);
  const upload = await responseJson(await fetch(`${paperlessUrl}/api/documents/post_document/`, {
    method: 'POST',
    headers: paperlessHeaders,
    body: form
  }));
  assert.equal(upload.response.status, 200, JSON.stringify(upload.body));
  const taskId = String(upload.body || '');
  assert.match(taskId, /^[0-9a-f-]{36}$/);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const tasks = await responseJson(await fetch(
      `${paperlessUrl}/api/tasks/?task_id=${encodeURIComponent(taskId)}`,
      { headers: paperlessHeaders }
    ));
    assert.equal(tasks.response.status, 200, JSON.stringify(tasks.body));
    const task = Array.isArray(tasks.body?.results)
      ? tasks.body.results[0]
      : Array.isArray(tasks.body)
        ? tasks.body[0]
        : tasks.body;
    const state = String(task?.status || task?.state || '').toUpperCase();
    const documentId = relatedDocumentId(task);
    if (['FAILURE', 'FAILED', 'REVOKED'].includes(state)) {
      throw new Error(`Paperless failed to ingest ${filename}: ${task.result || 'unknown error'}`);
    }
    if (documentId && ['SUCCESS', 'SUCCESSFUL', 'COMPLETED'].includes(state)) {
      return documentId;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Paperless did not finish ingesting ${filename}`);
}

const releaseDocumentId = await uploadPaperlessDocument({
  title: 'Synthetic insurance renewal',
  content: 'Synthetic renewal notice. Reply by 2026-08-15.',
  filename: 'synthetic-insurance-renewal.txt'
});
const releaseActionDocumentId = await uploadPaperlessDocument({
  title: 'Synthetic follow-up letter',
  content: 'Synthetic follow-up letter for the release approval path.',
  filename: 'synthetic-follow-up-letter.txt'
});
const fixtureConfig = await responseJson(await fetch(`${mockUrl}/__release/config`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ releaseDocumentId, releaseActionDocumentId })
}));
assert.equal(fixtureConfig.response.status, 200, JSON.stringify(fixtureConfig.body));

const setupPayload = {
  paperless: {
    baseUrl: paperlessUrl,
    token: paperlessToken,
    username: paperlessUsername
  },
  provider: {
    instanceId: 'compatible',
    modelId: 'release-mock',
    values: {
      baseUrl: `${mockUrl}/v1`,
      apiKey: 'release-provider-key'
    }
  },
  account: {
    username: 'release-owner',
    password: 'Release-only-password-42!',
    confirmPassword: 'Release-only-password-42!'
  }
};

const paperlessProbe = await responseJson(await request('/api/paperless/probe', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    url: setupPayload.paperless.baseUrl,
    token: setupPayload.paperless.token
  })
}));
assert.equal(paperlessProbe.response.status, 200, JSON.stringify(paperlessProbe.body));
assert.equal(paperlessProbe.body.success, true);
assert.equal(paperlessProbe.body.instance?.authenticated, true);
assert.equal(paperlessProbe.body.instance?.error, null);

const providerProbe = await responseJson(await request('/api/setup/v3/provider-probe', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    instanceId: setupPayload.provider.instanceId,
    values: setupPayload.provider.values
  })
}));
assert.equal(providerProbe.response.status, 200, JSON.stringify(providerProbe.body));
assert.equal(providerProbe.body.ok, true);
assert.ok(providerProbe.body.models.some((model) => model.id === setupPayload.provider.modelId));
assert.equal(providerProbe.body.models.some((model) => model.id === 'text-embedding-release'), false);
assert.equal(JSON.stringify(providerProbe.body).includes(setupPayload.provider.values.apiKey), false);

const selectedProviderProbe = await responseJson(await request('/api/setup/v3/provider-probe', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    instanceId: setupPayload.provider.instanceId,
    values: setupPayload.provider.values,
    modelId: setupPayload.provider.modelId
  })
}));
assert.equal(selectedProviderProbe.response.status, 200, JSON.stringify(selectedProviderProbe.body));
assert.equal(selectedProviderProbe.body.validatedModelId, setupPayload.provider.modelId);
assert.equal(selectedProviderProbe.body.validationMode, 'tool');

const cataloglessProviderProbe = await responseJson(await request('/api/setup/v3/provider-probe', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    instanceId: setupPayload.provider.instanceId,
    values: {
      ...setupPayload.provider.values,
      baseUrl: `${mockUrl}/catalogless`
    },
    modelId: setupPayload.provider.modelId
  })
}));
assert.equal(cataloglessProviderProbe.response.status, 200, JSON.stringify(cataloglessProviderProbe.body));
assert.equal(cataloglessProviderProbe.body.validatedModelId, setupPayload.provider.modelId);
assert.equal(cataloglessProviderProbe.body.validationMode, 'tool');
assert.deepEqual(cataloglessProviderProbe.body.models.map((model) => model.id), [setupPayload.provider.modelId]);

const setup = await responseJson(await request('/api/setup/v3', { method: 'POST', headers, body: JSON.stringify(setupPayload) }));
assert.equal(setup.response.status, 200, JSON.stringify(setup.body));
assert.equal(setup.body.success, true);

const takeover = await responseJson(await request('/api/setup/v3', { method: 'POST', headers, body: JSON.stringify(setupPayload) }));
assert.equal(takeover.response.status, 409, JSON.stringify(takeover.body));

const rejectedLogin = await responseJson(await request('/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ username: 'release-owner', password: 'wrong' }) }));
assert.equal(rejectedLogin.response.status, 401);

const login = await responseJson(await request('/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ username: 'release-owner', password: setupPayload.account.password }) }));
assert.equal(login.response.status, 200, JSON.stringify(login.body));
const cookie = login.response.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie?.startsWith('jwt='));
const authenticatedHeaders = { ...headers, cookie };

const settings = await responseJson(await request('/api/settings/v3', { headers: { cookie } }));
assert.equal(settings.response.status, 200, JSON.stringify(settings.body));
assert.equal(settings.body.automation.writeMode, 'review');
assert.equal(settings.body.automation.automaticProcessing, false);
assert.equal(JSON.stringify(settings.body).includes(setupPayload.paperless.token), false);
assert.equal(JSON.stringify(settings.body).includes(setupPayload.provider.values.apiKey), false);

const action = await responseJson(await request('/api/actions', {
  method: 'POST', headers: authenticatedHeaders, body: JSON.stringify({ paperlessDocumentId: releaseDocumentId, title: 'Compare renewal offer', summary: 'Synthetic release acceptance case', dueAt: '2026-08-15', priority: 'high' })
}));
assert.equal(action.response.status, 201, JSON.stringify(action.body));
assert.equal(action.body.title, 'Compare renewal offer');
const actionId = String(action.body.id);
const ownerMemberId = String(action.body.events?.find((event) => event.event_type === 'case.created')?.actor_member_id || '');
assert.ok(ownerMemberId);

const ownerAccess = await responseJson(await request(`/api/household/members/${ownerMemberId}/paperless`, { method: 'PUT', headers: authenticatedHeaders, body: JSON.stringify({ token: paperlessToken, paperlessUserId: paperlessUser.id }) }));
assert.equal(ownerAccess.response.status, 200, JSON.stringify(ownerAccess.body));
assert.equal(JSON.stringify(ownerAccess.body).includes(paperlessToken), false);

const recoveredSync = await responseJson(await request(`/api/actions/${actionId}/sync`, { method: 'POST', headers: authenticatedHeaders }));
assert.equal(recoveredSync.response.status, 200, JSON.stringify(recoveredSync.body));
assert.equal(recoveredSync.body.ok, true);
const syncedCases = await responseJson(await request('/api/actions', { headers: { cookie } }));
assert.equal(syncedCases.response.status, 200, JSON.stringify(syncedCases.body));
assert.equal(syncedCases.body.cases.find((item) => String(item.id) === actionId)?.syncStatus, 'synced');

const step = await responseJson(await request(`/api/actions/${actionId}/steps`, { method: 'POST', headers: authenticatedHeaders, body: JSON.stringify({ title: 'Request comparison quote' }) }));
assert.equal(step.response.status, 201, JSON.stringify(step.body));
const stepId = String(step.body.steps?.at(-1)?.id || '');
assert.ok(stepId);

const completedStep = await responseJson(await request(`/api/actions/${actionId}/steps/${stepId}`, { method: 'PATCH', headers: authenticatedHeaders, body: JSON.stringify({ status: 'done' }) }));
assert.equal(completedStep.response.status, 200, JSON.stringify(completedStep.body));
assert.equal(completedStep.body.steps[0].status, 'done');

const member = await responseJson(await request('/api/household/members', { method: 'POST', headers: authenticatedHeaders, body: JSON.stringify({ displayName: 'Release Adult', role: 'adult' }) }));
assert.equal(member.response.status, 201, JSON.stringify(member.body));
const memberId = String(member.body.id);

const access = await responseJson(await request(`/api/household/members/${memberId}/paperless`, { method: 'PUT', headers: authenticatedHeaders, body: JSON.stringify({ token: paperlessToken, paperlessUserId: paperlessUser.id }) }));
assert.equal(access.response.status, 200, JSON.stringify(access.body));
assert.equal(JSON.stringify(access.body).includes(paperlessToken), false);

const cases = await responseJson(await request('/api/actions', { headers: { cookie } }));
assert.equal(cases.response.status, 200);
assert.equal(cases.body.cases.length, 1);

const companionSession = await responseJson(await request('/api/companion', { headers: { cookie } }));
assert.equal(companionSession.response.status, 200, JSON.stringify(companionSession.body));
assert.match(String(companionSession.body.sessionId), /^[0-9a-f-]{36}$/);
const companionRead = await request('/api/companion', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    sessionId: companionSession.body.sessionId,
    messages: [{ id: 'release-read-request', role: 'user', parts: [{ type: 'text', text: 'When is the insurance renewal due?' }] }]
  })
});
const companionReadBody = await companionRead.text();
assert.equal(companionRead.status, 200, companionReadBody);
assert.match(companionReadBody, new RegExp(`doc:${releaseDocumentId}\\b`));
const companion = await request('/api/companion', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    sessionId: companionSession.body.sessionId,
    messages: [{ id: 'release-proposal-request', role: 'user', parts: [{ type: 'text', text: `Prepare a follow-up action for document ${releaseActionDocumentId}.` }] }]
  })
});
const companionBody = await companion.text();
assert.equal(companion.status, 200, companionBody);
assert.match(companionBody, /ready for approval/);
const approvals = await responseJson(await request('/api/approvals', { headers: { cookie } }));
assert.equal(approvals.response.status, 200, JSON.stringify(approvals.body));
assert.equal(approvals.body.approvals.length, 1);
assert.equal(approvals.body.approvals[0].action_type, 'action.create');
const approved = await responseJson(await request(`/api/approvals/${approvals.body.approvals[0].id}`, {
  method: 'POST', headers: authenticatedHeaders, body: JSON.stringify({ decision: 'approved' })
}));
assert.equal(approved.response.status, 200, JSON.stringify(approved.body));
assert.equal(approved.body.status, 'executed');
const casesAfterApproval = await responseJson(await request('/api/actions', { headers: { cookie } }));
assert.equal(casesAfterApproval.body.cases.length, 2);
assert.equal(casesAfterApproval.body.cases.find((item) => item.title === 'Review synthetic renewal terms')?.syncStatus, 'synced');

const legacyMutation = await responseJson(await request('/api/codex/login/release-missing/cancel', { method: 'POST', headers: authenticatedHeaders }));
assert.equal(legacyMutation.response.status, 200, JSON.stringify(legacyMutation.body));
assert.equal(legacyMutation.body.success, false);

const fixtureState = await responseJson(await fetch(`${mockUrl}/__release/state`));
assert.equal(fixtureState.response.status, 200, JSON.stringify(fixtureState.body));
assert.equal(fixtureState.body.releaseDocumentId, releaseDocumentId);
assert.equal(fixtureState.body.releaseActionDocumentId, releaseActionDocumentId);

const actionTags = await responseJson(await fetch(
  `${paperlessUrl}/api/tags/?name__iexact=${encodeURIComponent('tagvico/action')}`,
  { headers: paperlessHeaders }
));
assert.equal(actionTags.response.status, 200, JSON.stringify(actionTags.body));
const actionTag = actionTags.body.results?.find((item) => item.name === 'tagvico/action');
assert.ok(Number.isInteger(actionTag?.id));

for (const documentId of [releaseDocumentId, releaseActionDocumentId]) {
  const paperlessDocument = await responseJson(await fetch(
    `${paperlessUrl}/api/documents/${documentId}/`,
    { headers: paperlessHeaders }
  ));
  assert.equal(paperlessDocument.response.status, 200, JSON.stringify(paperlessDocument.body));
  const document = paperlessDocument.body;
  const fieldIds = document.custom_fields.map((item) => item.field);
  assert.equal(fieldIds.length, 4);
  assert.equal(new Set(fieldIds).size, 4);
  assert.ok(document.tags.includes(actionTag.id));
}

for (const page of ['/actions', `/actions/${actionId}`, '/companion', '/settings']) {
  const response = await request(page, { headers: { cookie } });
  assert.equal(response.status, 200, `${page} returned ${response.status}`);
  assert.equal(new URL(response.url).pathname, page, `${page} redirected to ${response.url}`);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  const html = await response.text();
  assert.match(html, page === '/companion' ? /<title>Chat · Tagvico<\/title>/i : page === '/settings' ? /Settings · Tagvico/i : /Action center|Compare renewal offer/i);
}

process.stdout.write(JSON.stringify({
  ok: true,
  actionId,
  ownerMemberId,
  memberId,
  paperlessDocumentIds: [releaseDocumentId, releaseActionDocumentId],
  checks: 'passed'
}, null, 2) + '\n');
