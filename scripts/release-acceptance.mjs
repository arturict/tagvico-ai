import assert from 'node:assert/strict';

const baseUrl = process.env.TAGVICO_ACCEPTANCE_BASE_URL || 'http://127.0.0.1:4310';
const mockUrl = process.env.TAGVICO_ACCEPTANCE_MOCK_URL || 'http://release-mock:4010';
const origin = new URL(baseUrl).origin;
const headers = { origin, 'content-type': 'application/json' };

const responseJson = async (response) => ({ response, body: await response.json().catch(() => ({})) });
const request = (path, options = {}) => fetch(`${baseUrl}${path}`, options);

const health = await responseJson(await request('/health'));
assert.equal(health.response.status, 200);

const setupPayload = {
  paperless: {
    baseUrl: mockUrl,
    token: 'release-paperless-token',
    username: 'release-owner'
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

const action = await responseJson(await request('/api/actions', {
  method: 'POST', headers: authenticatedHeaders, body: JSON.stringify({ paperlessDocumentId: 42, title: 'Compare renewal offer', summary: 'Synthetic release acceptance case', dueAt: '2026-08-15', priority: 'high' })
}));
assert.equal(action.response.status, 201, JSON.stringify(action.body));
assert.equal(action.body.title, 'Compare renewal offer');
const actionId = String(action.body.id);
const ownerMemberId = String(action.body.events?.find((event) => event.event_type === 'case.created')?.actor_member_id || '');
assert.ok(ownerMemberId);

const ownerAccess = await responseJson(await request(`/api/household/members/${ownerMemberId}/paperless`, { method: 'PUT', headers: authenticatedHeaders, body: JSON.stringify({ token: 'release-paperless-token', paperlessUserId: 1 }) }));
assert.equal(ownerAccess.response.status, 200, JSON.stringify(ownerAccess.body));
assert.equal(JSON.stringify(ownerAccess.body).includes('release-paperless-token'), false);

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

const access = await responseJson(await request(`/api/household/members/${memberId}/paperless`, { method: 'PUT', headers: authenticatedHeaders, body: JSON.stringify({ token: 'release-paperless-token', paperlessUserId: 1 }) }));
assert.equal(access.response.status, 200, JSON.stringify(access.body));
assert.equal(JSON.stringify(access.body).includes('release-paperless-token'), false);

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
assert.match(companionReadBody, /doc:42/);
const companion = await request('/api/companion', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    sessionId: companionSession.body.sessionId,
    messages: [{ id: 'release-proposal-request', role: 'user', parts: [{ type: 'text', text: 'Prepare a follow-up action for document 43.' }] }]
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
assert.ok(fixtureState.body.groundedDocumentReads >= 1);
for (const documentId of [42, 43]) {
  const document = fixtureState.body.documents.find((item) => item.id === documentId);
  const fieldIds = document.custom_fields.map((item) => item.field);
  assert.equal(fieldIds.length, 4);
  assert.equal(new Set(fieldIds).size, 4);
  assert.ok(document.tags.includes(fixtureState.body.tags.find((item) => item.name === 'tagvico/action').id));
}

for (const page of ['/actions', `/actions/${actionId}`, '/companion', '/settings']) {
  const response = await request(page, { headers: { cookie } });
  assert.equal(response.status, 200, `${page} returned ${response.status}`);
  assert.equal(new URL(response.url).pathname, page, `${page} redirected to ${response.url}`);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  const html = await response.text();
  assert.match(html, page === '/companion' ? /Household companion/i : page === '/settings' ? /Settings \| Tagvico AI/i : /Action center|Compare renewal offer/i);
}

process.stdout.write(JSON.stringify({ ok: true, actionId, ownerMemberId, memberId, checks: 46 }, null, 2) + '\n');
