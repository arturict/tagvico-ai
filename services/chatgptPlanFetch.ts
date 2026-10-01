// A fetch for the AI SDK's OpenAI Responses provider that talks to the user's
// ChatGPT plan instead of an API key. The chat uses the same `streamText` tool
// loop as the OpenAI API path; this adapter is the only difference. It
//   - signs every request with the plan access token (renewed once on 401),
//   - rewrites the body to OpenAI's Sign in with ChatGPT preview contract:
//     `store: false`, `stream: true`, no sampling or output-token parameters,
//     and no system or developer messages (their text moves to `instructions`),
//   - turns plan errors, also those inside the event stream, into the friendly
//     ChatGPTPlanError messages used for filing.
import chatgptPlanAuthService, { ChatGPTPlanError, RESOURCE } from './chatgptPlanAuthService';
import { planError } from './chatgptPlanService';

const config = require('../config/config');

type Body = Record<string, unknown>;

const UNSUPPORTED_FIELDS = [
  'temperature', 'top_p', 'max_output_tokens', 'previous_response_id', 'conversation',
  'metadata', 'user', 'safety_identifier'
];
// Optional hints the plan may refuse; a refusal drops the field and retries once.
const OPTIONAL_FIELDS = ['include', 'parallel_tool_calls', 'prompt_cache_key', 'prompt_cache_options', 'prompt_cache_retention', 'service_tier', 'truncation'];

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : '')
    .filter(Boolean)
    .join('\n');
}

/** Applies the plan contract to a Responses API request body. */
export function planRequestBody(body: Body): Body {
  const next: Body = { ...body };
  for (const field of UNSUPPORTED_FIELDS) delete next[field];
  next.store = false;
  next.stream = true;
  if (Array.isArray(next.input)) {
    const guidance: string[] = typeof next.instructions === 'string' && next.instructions ? [next.instructions] : [];
    next.input = next.input.filter((item) => {
      const role = item && typeof item === 'object' ? (item as { role?: unknown }).role : undefined;
      if (role !== 'system' && role !== 'developer') return true;
      const text = contentText((item as { content?: unknown }).content);
      if (text) guidance.push(text);
      return false;
    });
    if (guidance.length) next.instructions = guidance.join('\n\n');
  }
  return next;
}

/**
 * Re-emits the event stream one complete event at a time and errors it with
 * the friendly plan message when OpenAI reports a failure inside the stream
 * (a usage limit can arrive after the 200 response started).
 */
function friendlyFailures(body: ReadableStream<Uint8Array>, status: number) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = '';
  const inspect = (block: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    if (/"(?:response\.failed|error)"/.test(block)) {
      const data = block.split(/\r\n|\r|\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).replace(/^ /, '')).join('\n');
      try {
        const event = JSON.parse(data) as { type?: unknown; response?: unknown };
        if (event.type === 'response.failed' || event.type === 'error') {
          controller.error(planError(event.response && typeof event.response === 'object' ? event.response : event, status));
          return false;
        }
      } catch {
        // Not a JSON event; the SDK reports it.
      }
    }
    controller.enqueue(encoder.encode(`${block}\n\n`));
    return true;
  };
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true }).replace(/\r\n?/g, '\n');
      const blocks = pending.split('\n\n');
      pending = blocks.pop() || '';
      for (const block of blocks) if (!inspect(block, controller)) return;
    },
    flush(controller) {
      pending += decoder.decode();
      if (pending.trim()) inspect(pending, controller);
    }
  }));
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  const url = input instanceof URL ? input.href : typeof input === 'string' ? input : (input as Request).url;
  // The plan token must never be sent anywhere but the plan's resource.
  if (url !== RESOURCE && !url.startsWith(`${RESOURCE}/`)) {
    throw new ChatGPTPlanError('invalid_destination', 'ChatGPT plan requests may only go to the OpenAI API.');
  }
  return url;
}

export async function chatgptPlanFetch(input: Parameters<typeof fetch>[0], init: RequestInit = {}): Promise<Response> {
  const url = requestUrl(input);
  if (typeof init.body !== 'string') {
    throw new ChatGPTPlanError('invalid_request', 'ChatGPT plan requests must carry a JSON body.');
  }
  let body = planRequestBody(JSON.parse(init.body) as Body);
  const timeout = AbortSignal.timeout(config.chatgpt.timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;

  const send = async (token: string) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'text/event-stream');
    return fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal, cache: 'no-store' });
  };

  let token = await chatgptPlanAuthService.accessToken();
  let response = await send(token);
  let refreshed = false;
  let relaxed = false;
  for (;;) {
    if (response.ok && response.body) return new Response(friendlyFailures(response.body, response.status), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
    // An access token can be revoked before it expires; renew once and retry.
    if (response.status === 401 && !refreshed) {
      refreshed = true;
      await response.body?.cancel().catch(() => {});
      token = await chatgptPlanAuthService.accessToken({ forceRefresh: true });
      response = await send(token);
      continue;
    }
    const detail = await response.json().catch(() => null);
    const error = planError(detail, response.status);
    const param = String(((detail as { error?: { param?: unknown } } | null)?.error?.param) || '').split('.')[0];
    if (!relaxed && error.code === 'subscription_sharing_unsupported_capability' && OPTIONAL_FIELDS.includes(param) && param in body) {
      relaxed = true;
      body = { ...body };
      delete body[param];
      response = await send(token);
      continue;
    }
    throw error;
  }
}
