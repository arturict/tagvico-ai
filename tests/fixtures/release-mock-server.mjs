import http from 'node:http';

const port = Number(process.env.PORT || 4010);
const documents = new Map([
  [42, {
    id: 42,
    title: 'Synthetic insurance renewal',
    content: 'Synthetic renewal notice. Reply by 2026-08-15.',
    tags: [],
    correspondent: null,
    document_type: null,
    custom_fields: [],
    created: '2026-07-21',
    language: 'en',
    owner: 1
  }],
  [43, {
    id: 43,
    title: 'Synthetic follow-up letter',
    content: 'Synthetic follow-up letter for the release approval path.',
    tags: [],
    correspondent: null,
    document_type: null,
    custom_fields: [],
    created: '2026-07-22',
    language: 'en',
    owner: 1
  }]
]);
const tags = [];
const customFields = [];
let groundedDocumentReads = 0;

const readBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
};

const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

const collection = (results) => ({ count: results.length, next: null, previous: null, results });

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const path = url.pathname;

  if (path === '/health') return json(response, 200, { ok: true });
  if (path === '/__release/state') return json(response, 200, { documents: [...documents.values()], tags, customFields, groundedDocumentReads });
  if ((path === '/' || path === '/api/' || path === '/api') && request.headers.authorization === 'Token release-paperless-token') {
    return json(response, 200, { paperless_version: 'release-fixture' });
  }
  if (path === '/v1/models' && request.method === 'GET') {
    return json(response, 200, { object: 'list', data: [{ id: 'release-mock', object: 'model', owned_by: 'tagvico' }] });
  }
  if (path === '/v1/chat/completions' && request.method === 'POST') {
    const body = await readBody(request);
    const requestsProposal = JSON.stringify(body.messages || []).includes('Prepare a follow-up action');
    const requestsDocumentRead = JSON.stringify(body.messages || []).includes('When is the insurance renewal due');
    const hasToolResult = Array.isArray(body.messages) && body.messages.some((message) => message.role === 'tool');
    if (body.stream && requestsProposal && !hasToolResult) {
      const argumentsJson = JSON.stringify({
        paperlessDocumentId: 43,
        title: 'Review synthetic renewal terms',
        summary: 'Prepared by the synthetic v3 release fixture.',
        priority: 'high',
        dueAt: '2026-08-15',
        steps: [{ title: 'Compare renewal terms', dueAt: '2026-08-10' }]
      });
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      response.write(`data: ${JSON.stringify({ id: 'chatcmpl-release-tool', object: 'chat.completion.chunk', created: 0, model: body.model || 'release-mock', choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_release_proposal', type: 'function', function: { name: 'propose_action', arguments: argumentsJson } }] }, finish_reason: null }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ id: 'chatcmpl-release-tool', object: 'chat.completion.chunk', created: 0, model: body.model || 'release-mock', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`);
      response.end('data: [DONE]\n\n');
      return;
    }
    if (body.stream && requestsDocumentRead && !hasToolResult) {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      response.write(`data: ${JSON.stringify({ id: 'chatcmpl-release-read', object: 'chat.completion.chunk', created: 0, model: body.model || 'release-mock', choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_release_document', type: 'function', function: { name: 'get_document', arguments: JSON.stringify({ documentId: 42 }) } }] }, finish_reason: null }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ id: 'chatcmpl-release-read', object: 'chat.completion.chunk', created: 0, model: body.model || 'release-mock', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`);
      response.end('data: [DONE]\n\n');
      return;
    }
    const content = requestsProposal
      ? 'The requested synthetic proposal is ready for approval.'
      : requestsDocumentRead
        ? 'The synthetic insurance renewal is due on 15 August 2026 [doc:42].'
        : 'Synthetic release response.';
    if (body.stream) {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      response.write(`data: ${JSON.stringify({ id: 'chatcmpl-release', object: 'chat.completion.chunk', created: 0, model: body.model || 'release-mock', choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ id: 'chatcmpl-release', object: 'chat.completion.chunk', created: 0, model: body.model || 'release-mock', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
      response.end('data: [DONE]\n\n');
      return;
    }
    return json(response, 200, {
      id: 'chatcmpl-release',
      object: 'chat.completion',
      created: 0,
      model: body.model || 'release-mock',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 12, total_tokens: 24 }
    });
  }

  if (!path.startsWith('/api/')) return json(response, 404, { detail: 'Not found' });
  if (request.headers.authorization !== 'Token release-paperless-token') return json(response, 401, { detail: 'Invalid token' });

  if (path === '/api/documents/' && request.method === 'GET') return json(response, 200, collection([...documents.values()]));
  if (path === '/api/tags/' && request.method === 'GET') {
    const name = url.searchParams.get('name__iexact')?.toLowerCase();
    return json(response, 200, collection(name ? tags.filter((item) => String(item.name).toLowerCase() === name) : tags));
  }
  if (path === '/api/correspondents/' && request.method === 'GET') return json(response, 200, collection([{ id: 1, name: 'Synthetic insurer' }]));
  if (path === '/api/document_types/' && request.method === 'GET') return json(response, 200, collection([{ id: 1, name: 'Letter' }]));
  if (path === '/api/custom_fields/' && request.method === 'GET') {
    const name = url.searchParams.get('name__iexact')?.toLowerCase();
    return json(response, 200, collection(name ? customFields.filter((item) => String(item.name).toLowerCase() === name) : customFields));
  }
  if (path === '/api/users/' && request.method === 'GET') return json(response, 200, collection([{ id: 1, username: 'release-owner' }]));

  if (path === '/api/tags/' && request.method === 'POST') {
    const body = await readBody(request); const item = { id: tags.length + 1, name: String(body.name || ''), color: body.color || '#8b7cff' }; tags.push(item); return json(response, 201, item);
  }
  if (path === '/api/custom_fields/' && request.method === 'POST') {
    const body = await readBody(request); const item = { id: customFields.length + 1, ...body }; customFields.push(item); return json(response, 201, item);
  }

  const documentMatch = path.match(/^\/api\/documents\/(\d+)\/$/);
  if (documentMatch) {
    const id = Number(documentMatch[1]); const item = documents.get(id);
    if (!item) return json(response, 404, { detail: 'Not found' });
    if (request.method === 'GET') {
      if (String(url.searchParams.get('fields') || '').includes('content')) groundedDocumentReads += 1;
      return json(response, 200, item);
    }
    if (request.method === 'PATCH') {
      const body = await readBody(request); const next = { ...item, ...body, id }; documents.set(id, next); return json(response, 200, next);
    }
  }

  return json(response, 404, { detail: `Unhandled release fixture route: ${request.method} ${path}` });
});

server.listen(port, '0.0.0.0', () => process.stdout.write(`release mock listening on ${port}\n`));
