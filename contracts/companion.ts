import { z } from 'zod';
import type { ModelDescriptor } from './provider';

export const companionModelSelectionSchema = z.object({
  providerInstanceId: z.string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9._-]*$/i),
  modelId: z.string().trim().min(1).max(200)
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
  };
}

const TOOL_LABELS: Record<string, string> = {
  list_actions: 'Reviewing your actions',
  count_documents: 'Counting Paperless documents',
  list_recent_documents: 'Loading recent documents',
  search_documents: 'Searching Paperless',
  get_document: 'Reading a Paperless document',
  propose_action: 'Preparing an action proposal',
  propose_action_update: 'Preparing an action update'
};

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
        : 'This step could not be completed. No private error details are shown.',
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
    propose_action: 'An approval card was prepared. Nothing was changed yet.',
    propose_action_update: 'An approval card was prepared. Nothing was changed yet.'
  };
  const documents = ['search_documents', 'list_recent_documents', 'get_document'].includes(toolName)
    ? safeDocuments(output)
    : [];
  return {
    toolName,
    label,
    detail: providedSummary || details[toolName] || 'Tool completed successfully.',
    status: 'succeeded',
    input: safeCompanionToolInput(toolName, input),
    result: {
      ...(count === null ? {} : { count }),
      ...(documents.length ? { documents } : {})
    }
  };
}
