import { z } from 'zod';
import type { ModelDescriptor } from './provider';

export const companionModelSelectionSchema = z.object({
  providerInstanceId: z.string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9._-]*$/i),
  modelId: z.string().trim().min(1).max(200),
  reasoningEffort: z.string().trim().min(1).max(40).optional()
}).strict();

export type CompanionModelSelection = z.infer<typeof companionModelSelectionSchema>;

export interface CompanionModelProvider {
  instanceId: string;
  name: string;
  icon: { path: string; source?: string } | null;
  models: ModelDescriptor[];
}

export interface CompanionModelCatalog {
  providers: CompanionModelProvider[];
  defaultSelection: CompanionModelSelection | null;
}

export type CompanionToolState =
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'
  | 'output-denied';

export interface CompanionToolActivity {
  toolName: string;
  label: string;
  detail: string;
  status: 'running' | 'succeeded' | 'failed' | 'waiting';
  input?: Record<string, unknown>;
  result?: {
    count?: number;
    documents?: Array<{
      id: number;
      title: string;
      created?: string;
      modified?: string;
    }>;
    tags?: Array<{
      id: number;
      name: string;
      documentCount?: number;
    }>;
    /** Durable approval created by a propose_* tool, rendered as an inline card. */
    approvalId?: string;
  };
}

const TOOL_LABELS: Record<string, string> = {
  list_actions: 'Reviewing your actions',
  count_documents: 'Counting Paperless documents',
  list_recent_documents: 'Loading recent documents',
  search_documents: 'Searching Paperless',
  get_document: 'Reading a Paperless document',
  list_tags: 'Reading Paperless tags',
  get_tag: 'Reading a Paperless tag',
  propose_document_update: 'Preparing a document change',
  propose_tag_create: 'Preparing a new tag',
  propose_tag_update: 'Preparing a tag change',
  propose_tag_delete: 'Preparing tag deletion',
  propose_action: 'Preparing an action proposal',
  propose_action_update: 'Preparing an action update'
};

export function sanitizeCompanionText(value: unknown) {
  return String(value || '')
    .replace(/\[doc:[^\r\n]*?(?:\]|$)/gi, (marker) => (
      /^\[doc:\d+\]$/i.test(marker) ? marker : ''
    ))
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function countResult(output: unknown): number | null {
  if (Array.isArray(output)) return output.length;
  if (!output || typeof output !== 'object') return null;
  const candidate = output as Record<string, unknown>;
  if (Number.isSafeInteger(Number(candidate.count)) && Number(candidate.count) >= 0) {
    return Number(candidate.count);
  }
  if (Array.isArray(candidate.results)) return candidate.results.length;
  return null;
}

export function safeCompanionToolInput(toolName: string, input: unknown): Record<string, unknown> {
  const candidate = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  if (toolName === 'get_document') {
    const documentId = Number(candidate.documentId);
    return Number.isSafeInteger(documentId) && documentId > 0 ? { documentId } : {};
  }
  if (toolName === 'search_documents') {
    const query = String(candidate.query || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    return query ? { query } : { scope: 'Paperless documents' };
  }
  if (toolName === 'list_recent_documents') {
    const limit = Math.max(1, Math.min(20, Math.trunc(Number(candidate.limit) || 8)));
    return { limit };
  }
  if (toolName === 'count_documents') return {};
  if (toolName === 'list_tags') {
    const query = String(candidate.query || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const limit = Math.max(1, Math.min(200, Math.trunc(Number(candidate.limit) || 100)));
    return { ...(query ? { query } : {}), limit };
  }
  if (toolName === 'get_tag') {
    const tagId = Number(candidate.tagId);
    return Number.isSafeInteger(tagId) && tagId > 0 ? { tagId } : {};
  }
  if (toolName === 'list_actions') {
    const status = String(candidate.status || '');
    return ['suggested', 'open', 'waiting', 'done', 'dismissed'].includes(status)
      ? { status }
      : {};
  }
  return {};
}

export function safeCompanionToolOutput(
  toolName: string,
  input: unknown,
  output: unknown
): Record<string, unknown> {
  const activity = companionToolActivity(toolName, 'output-available', input, output);
  return {
    summary: activity.detail,
    ...(activity.result || {})
  };
}

function safeDocuments(output: unknown) {
  const candidate = Array.isArray(output)
    ? output
    : output && typeof output === 'object' && Array.isArray((output as Record<string, unknown>).results)
      ? (output as Record<string, unknown>).results as unknown[]
      : output && typeof output === 'object' && Array.isArray((output as Record<string, unknown>).documents)
        ? (output as Record<string, unknown>).documents as unknown[]
      : output && typeof output === 'object'
        ? [output]
        : [];
  return candidate.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const document = item as Record<string, unknown>;
    const id = Number(document.id ?? document.documentId);
    if (!Number.isSafeInteger(id) || id <= 0) return [];
    return [{
      id,
      title: String(document.title || `Document #${id}`).replace(/\s+/g, ' ').trim().slice(0, 180),
      ...(document.created ? { created: String(document.created).slice(0, 32) } : {}),
      ...(document.modified ? { modified: String(document.modified).slice(0, 32) } : {})
    }];
  }).slice(0, 20);
}

function safeTags(output: unknown) {
  const candidate = Array.isArray(output)
    ? output
    : output && typeof output === 'object' && Array.isArray((output as Record<string, unknown>).tags)
      ? (output as Record<string, unknown>).tags as unknown[]
      : output && typeof output === 'object'
        ? [output]
        : [];
  return candidate.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const tag = item as Record<string, unknown>;
    const id = Number(tag.id ?? tag.tagId);
    const name = String(tag.name || '').replace(/\s+/g, ' ').trim().slice(0, 128);
    if (!Number.isSafeInteger(id) || id <= 0 || !name) return [];
    const documentCount = Number(tag.documentCount ?? tag.document_count);
    return [{
      id,
      name,
      ...(Number.isSafeInteger(documentCount) && documentCount >= 0 ? { documentCount } : {})
    }];
  }).slice(0, 200);
}

/**
 * Convert an AI SDK tool part into presentation-only copy. User-authored
 * search terms and document metadata stay visible; OCR, provider errors,
 * secrets and mutation payloads are intentionally never returned.
 */
export function companionToolActivity(
  toolName: string,
  state: CompanionToolState,
  input?: unknown,
  output?: unknown
): CompanionToolActivity {
  const label = TOOL_LABELS[toolName] || 'Using a Tagvico tool';
  if (state === 'output-error' || state === 'output-denied') {
    return {
      toolName,
      label,
      detail: state === 'output-denied'
        ? 'This step was not permitted.'
        : safeCompanionToolError(output),
      status: 'failed'
    };
  }
  if (state === 'approval-requested' || state === 'approval-responded') {
    return {
      toolName,
      label,
      detail: state === 'approval-requested'
        ? 'Waiting for your approval.'
        : 'Your decision was recorded.',
      status: 'waiting'
    };
  }
  if (state !== 'output-available') {
    return {
      toolName,
      label,
      detail: toolName === 'search_documents'
        ? 'Looking through document metadata in your Paperless library…'
        : toolName === 'get_document'
          ? 'Reading only the document needed for this answer…'
          : toolName === 'count_documents'
            ? 'Checking the Paperless library total…'
          : toolName === 'list_recent_documents'
              ? 'Loading recent document metadata…'
              : toolName === 'list_tags'
                ? 'Loading the Paperless tag vocabulary…'
                : toolName === 'get_tag'
                  ? 'Reading the selected tag and its usage…'
              : 'Working with the minimum information needed…',
      status: 'running',
      input: safeCompanionToolInput(toolName, input)
    };
  }

  const count = countResult(output);
  const safeInput = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const providedSummary = output && typeof output === 'object'
    ? String((output as Record<string, unknown>).summary || '').trim()
    : '';
  const documentId = Number(safeInput.documentId);
  const details: Record<string, string> = {
    list_actions: count === null ? 'Action review completed.' : `Reviewed ${count} action${count === 1 ? '' : 's'}.`,
    count_documents: count === null ? 'Paperless document count completed.' : `${count} document${count === 1 ? '' : 's'} in Paperless.`,
    list_recent_documents: count === null ? 'Recent documents loaded.' : `Loaded ${count} recent document${count === 1 ? '' : 's'}.`,
    search_documents: count === null ? 'Paperless search completed.' : `Found ${count} matching document${count === 1 ? '' : 's'}.`,
    get_document: Number.isSafeInteger(documentId) && documentId > 0
      ? `Document #${documentId} was read. Its private contents remain hidden here.`
      : 'The requested document was read. Its private contents remain hidden here.',
    list_tags: count === null ? 'Paperless tags loaded.' : `Loaded ${count} Paperless tag${count === 1 ? '' : 's'}.`,
    get_tag: 'The selected Paperless tag was read.',
    propose_document_update: 'A document change is waiting for approval. Nothing changed yet.',
    propose_tag_create: 'A new tag is waiting for approval. Nothing changed yet.',
    propose_tag_update: 'A tag change is waiting for approval. Nothing changed yet.',
    propose_tag_delete: 'Tag deletion is waiting for approval. Nothing changed yet.',
    propose_action: 'An approval card was prepared. Nothing was changed yet.',
    propose_action_update: 'An approval card was prepared. Nothing was changed yet.'
  };
  const documents = ['search_documents', 'list_recent_documents', 'get_document'].includes(toolName)
    ? safeDocuments(output)
    : [];
  const approvalId = toolName.startsWith('propose_') ? approvalIdOf(output) : null;
  const tags = ['list_tags', 'get_tag'].includes(toolName)
    ? safeTags(output)
    : [];
  return {
    toolName,
    label,
    detail: providedSummary || details[toolName] || 'Tool completed successfully.',
    status: 'succeeded',
    input: safeCompanionToolInput(toolName, input),
    result: {
      ...(count === null ? {} : { count }),
      ...(documents.length ? { documents } : {}),
      ...(tags.length ? { tags } : {}),
      ...(approvalId ? { approvalId } : {})
    }
  };
}

/* ---------- citations ---------- */

const DOCUMENT_MARKER = /(\s*)\[doc:(\d+)\]/gi;

export function companionDocumentIds(activities: CompanionToolActivity[]): number[] {
  const ids = new Set<number>();
  for (const activity of activities) {
    for (const document of activity.result?.documents || []) ids.add(document.id);
  }
  return [...ids];
}

/**
 * Keeps [doc:ID] markers only for documents a tool actually returned in this
 * conversation. A marker for any other number is the model guessing, so it is
 * dropped instead of becoming a link to an unrelated or missing document.
 */
export function groundCompanionCitations(text: string, allowed: Iterable<number>): string {
  const known = new Set(allowed);
  return String(text || '').replace(DOCUMENT_MARKER, (marker, _space: string, raw: string) => (
    known.has(Number(raw)) ? marker : ''
  ));
}

/* ---------- safe failure messages ---------- */

export const COMPANION_TOOL_ERRORS = {
  unreachable: 'Paperless could not be reached. Check that it is running.',
  access: 'Paperless access is not set up for you. Ask an owner to add your Paperless token.',
  notFound: 'Paperless has no document or tag with that ID.',
  generic: 'This step could not be completed. No private error details are shown.'
} as const;

const KNOWN_TOOL_ERRORS = new Set<string>(Object.values(COMPANION_TOOL_ERRORS));
const NETWORK_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNABORTED', 'EHOSTUNREACH', 'ENETUNREACH'
]);

/** Maps any thrown value to one of a few sentences that are safe to show and store. */
export function classifyCompanionToolError(error: unknown): string {
  const source = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const message = error instanceof Error ? error.message : String(error || '');
  if (KNOWN_TOOL_ERRORS.has(message)) return message;
  const response = source.response && typeof source.response === 'object'
    ? source.response as Record<string, unknown>
    : {};
  const status = Number(response.status);
  const code = typeof source.code === 'string' ? source.code : '';
  if (NETWORK_CODES.has(code) || /timeout of \d+ms exceeded/i.test(message)) return COMPANION_TOOL_ERRORS.unreachable;
  if (status === 401 || status === 403
    || /personal Paperless token|Paperless credentials are not configured/i.test(message)) {
    return COMPANION_TOOL_ERRORS.access;
  }
  if (status === 404) return COMPANION_TOOL_ERRORS.notFound;
  return COMPANION_TOOL_ERRORS.generic;
}

export function safeCompanionToolError(value: unknown): string {
  return typeof value === 'string' && KNOWN_TOOL_ERRORS.has(value)
    ? value
    : COMPANION_TOOL_ERRORS.generic;
}

export type CompanionErrorCode =
  | 'no-provider'
  | 'chatgpt'
  | 'provider-auth'
  | 'provider-limit'
  | 'provider-unreachable'
  | 'generic';

export interface CompanionErrorView {
  code: CompanionErrorCode;
  message: string;
}

export const NO_PROVIDER_MESSAGE = 'No AI model is ready. Connect a provider in AI models settings first.';
const GENERIC_MODEL_ERROR = 'The selected model could not complete the request. Try again or choose another model.';

/**
 * Turns a model or provider failure into a calm sentence. ChatGPT plan errors
 * already carry curated recovery text (sign in again, usage limit); every
 * other provider error is reduced to a category so no key or URL leaks.
 */
export function describeCompanionModelError(error: unknown): CompanionErrorView {
  const source = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  if (source.name === 'ChatGPTPlanError' && error instanceof Error && error.message) {
    return { code: 'chatgpt', message: error.message };
  }
  const cause = source.cause && typeof source.cause === 'object' ? source.cause as Record<string, unknown> : {};
  const status = Number(source.statusCode ?? source.status);
  const code = String(cause.code || source.code || '');
  const text = error instanceof Error ? error.message : '';
  if (/^No (?:API key|model|base URL) configured/i.test(text)) return { code: 'no-provider', message: NO_PROVIDER_MESSAGE };
  if (status === 401 || status === 403) {
    return { code: 'provider-auth', message: 'The AI provider rejected its credentials. Check the key in AI models settings.' };
  }
  if (status === 429) {
    return { code: 'provider-limit', message: 'The AI provider is limiting requests right now. Try again in a moment.' };
  }
  if (NETWORK_CODES.has(code) || /fetch failed|ECONNREFUSED|ENOTFOUND|timed? ?out/i.test(text)) {
    return { code: 'provider-unreachable', message: 'The AI provider could not be reached. Check its address in AI models settings.' };
  }
  return { code: 'generic', message: GENERIC_MODEL_ERROR };
}

export function encodeCompanionError(view: CompanionErrorView): string {
  return JSON.stringify({ error: view.message, code: view.code });
}

/** Reads the JSON that encodeCompanionError and the chat route produce; plain text stays plain. */
export function parseCompanionError(raw: string): CompanionErrorView {
  const text = String(raw || '').trim();
  try {
    const parsed = JSON.parse(text) as { error?: unknown; code?: unknown };
    if (typeof parsed.error === 'string' && parsed.error) {
      const codes: CompanionErrorCode[] = ['no-provider', 'chatgpt', 'provider-auth', 'provider-limit', 'provider-unreachable', 'generic'];
      const code = codes.find((candidate) => candidate === parsed.code) || 'generic';
      return { code, message: parsed.error };
    }
  } catch {
    // Not JSON: fall through to plain text.
  }
  return { code: 'generic', message: text || GENERIC_MODEL_ERROR };
}

/* ---------- approvals shown inline ---------- */

export interface CompanionApprovalCopy {
  title: string;
  meta: string;
  details: string[];
}

export interface CompanionApprovalOutcome {
  tone: 'done' | 'failed' | 'rejected';
  title: string;
  detail?: string;
  href?: string;
}

export type CompanionApprovalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

export interface CompanionApprovalView {
  id: string;
  status: CompanionApprovalStatus;
  sessionId: string | null;
  copy: CompanionApprovalCopy;
  outcome: CompanionApprovalOutcome | null;
  createdAt: string;
}

export interface CompanionApprovalRow {
  id: string;
  action_type: string;
  status: string;
  session_id?: string | null;
  payload: Record<string, unknown>;
  result?: unknown;
  created_at?: string;
}

function approvalValue(value: unknown) {
  if (value === null) return 'None';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return 'Unable to display';
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function approvalIdOf(output: unknown): string | null {
  const candidate = record(output);
  const value = candidate.approvalId ?? candidate.id;
  return typeof value === 'string' && /^[\w-]{8,64}$/.test(value) ? value : null;
}

/** Plain-language summary of what a pending approval would change. */
export function describeCompanionApproval(
  actionType: string,
  rawPayload: unknown
): CompanionApprovalCopy {
  const payload = record(rawPayload);
  const patch = record(payload.patch);
  const patchLines = Object.entries(patch).map(([key, value]) => `${key}: ${approvalValue(value)}`);
  const reason = String(payload.reason || '');
  switch (actionType) {
    case 'paperless.tag.create':
      return {
        title: `Create tag “${String(payload.name || 'New tag')}”`,
        meta: 'Paperless tag',
        details: [reason].filter(Boolean)
      };
    case 'paperless.tag.update':
      return {
        title: `Update tag “${String(payload.tagName || `#${payload.tagId}`)}”`,
        meta: `${Number(payload.documentCount) || 0} linked documents`,
        details: [...patchLines, reason].filter(Boolean)
      };
    case 'paperless.tag.delete':
      return {
        title: `Delete tag “${String(payload.tagName || `#${payload.tagId}`)}”`,
        meta: `${Number(payload.documentCount) || 0} linked documents`,
        details: [reason].filter(Boolean)
      };
    case 'paperless.patch':
      return {
        title: `Update ${String(payload.documentTitle || `document #${payload.documentId}`)}`,
        meta: `Document #${String(payload.documentId || '')}`,
        details: [...patchLines, reason].filter(Boolean)
      };
    case 'action.create': {
      const steps = Array.isArray(payload.steps) ? payload.steps.length : 0;
      return {
        title: String(payload.title || 'New action'),
        meta: payload.paperlessDocumentId ? `Document #${payload.paperlessDocumentId}` : 'Action',
        details: [
          String(payload.summary || ''),
          payload.dueAt ? `Due ${String(payload.dueAt).slice(0, 10)}` : '',
          payload.priority && payload.priority !== 'normal' ? `Priority: ${String(payload.priority)}` : '',
          steps ? `${steps} step${steps === 1 ? '' : 's'}` : ''
        ].filter(Boolean)
      };
    }
    default:
      return {
        title: 'Update an action',
        meta: 'Action',
        details: patchLines
      };
  }
}

function shortError(result: unknown) {
  const message = String(record(result).error || '').replace(/\s+/g, ' ').trim();
  return message ? message.slice(0, 220) : 'The change could not be applied.';
}

/** What happened after the decision, or null while the proposal is still open. */
export function describeCompanionApprovalOutcome(
  actionType: string,
  status: string,
  rawResult: unknown
): CompanionApprovalOutcome | null {
  if (status === 'rejected') return { tone: 'rejected', title: 'Rejected', detail: 'Nothing was changed.' };
  if (status === 'failed') return { tone: 'failed', title: 'Could not apply this change', detail: shortError(rawResult) };
  if (status !== 'executed') return null;
  const result = record(rawResult);
  switch (actionType) {
    case 'action.create':
    case 'action.update': {
      const created = record(result.case);
      const caseId = typeof created.id === 'string' ? created.id : '';
      const sync = record(result.sync);
      const pending = sync.ok === false ? ' It could not be written to Paperless yet.' : '';
      return {
        tone: 'done',
        title: actionType === 'action.create' ? 'Action created' : 'Action updated',
        detail: `${String(created.title || 'The action')}${created.title ? '.' : ''}${pending}`.trim(),
        ...(caseId ? { href: `/actions/${caseId}` } : {})
      };
    }
    case 'paperless.patch': {
      const fields = Array.isArray(result.changedFields) ? result.changedFields.map(String) : [];
      const documentId = Number(result.documentId);
      return {
        tone: 'done',
        title: 'Document updated in Paperless',
        ...(fields.length ? { detail: `Changed: ${fields.join(', ')}.` } : {}),
        ...(Number.isSafeInteger(documentId) && documentId > 0 ? { href: `/documents/${documentId}` } : {})
      };
    }
    case 'paperless.tag.create': {
      const tag = record(result.tag);
      return { tone: 'done', title: 'Tag created in Paperless', ...(tag.name ? { detail: `“${String(tag.name)}”.` } : {}) };
    }
    case 'paperless.tag.update': {
      const before = record(result.before);
      const after = record(result.after);
      return {
        tone: 'done',
        title: 'Tag updated in Paperless',
        ...(after.name ? { detail: before.name && before.name !== after.name ? `“${String(before.name)}” is now “${String(after.name)}”.` : `“${String(after.name)}”.` } : {})
      };
    }
    case 'paperless.tag.delete': {
      const deleted = record(result.deleted);
      return { tone: 'done', title: 'Tag deleted in Paperless', ...(deleted.name ? { detail: `“${String(deleted.name)}”.` } : {}) };
    }
    default:
      return { tone: 'done', title: 'Change applied' };
  }
}

export function toCompanionApprovalView(row: CompanionApprovalRow): CompanionApprovalView {
  const status = (['pending', 'approved', 'rejected', 'executed', 'failed'] as const)
    .find((candidate) => candidate === row.status) || 'pending';
  return {
    id: row.id,
    status,
    sessionId: row.session_id ?? null,
    copy: describeCompanionApproval(row.action_type, row.payload),
    outcome: describeCompanionApprovalOutcome(row.action_type, status, row.result),
    createdAt: String(row.created_at || '')
  };
}
