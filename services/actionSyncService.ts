import crypto from 'node:crypto';
import axios from 'axios';
import * as actionCenter from '../models/actionCenter';
import { decryptSecret } from './secretBox';

const config = require('../config/config');

const FIELDS = {
  caseId: { name: 'Tagvico Case ID', type: 'string' },
  status: { name: 'Tagvico Status', type: 'string' },
  due: { name: 'Tagvico Due', type: 'date' },
  assignee: { name: 'Tagvico Assignee', type: 'string' }
} as const;
const ACTION_TAG = 'tagvico/action';
const MAX_PAPERLESS_JSON_BYTES = 10 * 1024 * 1024;

type PaperlessResource = { id: number; name: string; [key: string]: unknown };

function paperlessClient(token: string) {
  if (!config.paperless.apiUrl || !token) throw new Error('Paperless credentials are not configured');
  return axios.create({
    baseURL: config.paperless.apiUrl,
    timeout: 30_000,
    maxContentLength: MAX_PAPERLESS_JSON_BYTES,
    headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' }
  });
}

function clientFor(householdId: string, memberId: string | null) {
  const globalToken = String(config.paperless.apiToken || '');
  let token = globalToken;
  if (memberId) {
    const member = actionCenter.getMemberSecretRecord(householdId, memberId);
    if (!member) throw new Error('Household member not found');
    if (member.paperless_token_encrypted) token = decryptSecret(String(member.paperless_token_encrypted));
    else if (String(member.role) !== 'owner') throw new Error('A personal Paperless token is required for this household member');
  }
  if (!token) throw new Error('Paperless credentials are not configured for this member');
  return paperlessClient(token);
}

function schemaClientFor(householdId: string, memberId: string | null) {
  const globalToken = String(config.paperless.apiToken || '');
  return globalToken ? paperlessClient(globalToken) : clientFor(householdId, memberId);
}

async function ensureNamedResource(client: ReturnType<typeof axios.create>, endpoint: string, name: string, body: Record<string, unknown>): Promise<PaperlessResource> {
  const found = await client.get(endpoint, { params: { name__iexact: name, page_size: 1 } });
  const existing = found.data?.results?.[0];
  if (existing) return existing;
  const created = await client.post(endpoint, body);
  return created.data;
}

async function ensureSchema(client: ReturnType<typeof axios.create>) {
  const fields: Record<string, PaperlessResource> = {};
  for (const [key, field] of Object.entries(FIELDS)) {
    fields[key] = await ensureNamedResource(client, '/custom_fields/', field.name, { name: field.name, data_type: field.type, extra_data: {} });
  }
  const tag = await ensureNamedResource(client, '/tags/', ACTION_TAG, { name: ACTION_TAG, color: '#6d5dfc', text_color: '#ffffff' });
  return { fields, tag };
}

let schemaCache: { key: string; value: Promise<Awaited<ReturnType<typeof ensureSchema>>> } | null = null;
function schemaFor(householdId: string, memberId: string | null) {
  const key = String(config.paperless.apiUrl || '');
  if (!schemaCache || schemaCache.key !== key) {
    const value = ensureSchema(schemaClientFor(householdId, memberId));
    schemaCache = { key, value };
    void value.catch(() => { if (schemaCache?.value === value) schemaCache = null; });
  }
  return schemaCache.value;
}

function customFieldValue(document: Record<string, unknown>, fieldId: number) {
  const fields = Array.isArray(document.custom_fields) ? document.custom_fields : [];
  return (fields.find((entry: unknown) => typeof entry === 'object' && entry !== null && Number((entry as { field?: unknown }).field) === fieldId) as { value?: unknown } | undefined)?.value ?? null;
}

function fingerprint(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function pushCase(householdId: string, caseId: string, memberId: string | null) {
  const action = actionCenter.getCase(householdId, caseId);
  if (!action) throw new Error('Action case not found');
  try {
    const client = clientFor(householdId, memberId);
    const { fields, tag } = await schemaFor(householdId, memberId);
    const before = (await client.get(`/documents/${action.paperlessDocumentId}/`, { params: { fields: 'id,custom_fields,tags' } })).data as Record<string, unknown>;
    const existingFields = Array.isArray(before.custom_fields) ? before.custom_fields : [];
    const managedIds = new Set(Object.values(fields).map((field) => field.id));
    const customFields = existingFields.filter((entry: unknown) => typeof entry !== 'object' || entry === null || !managedIds.has(Number((entry as { field?: unknown }).field)));
    const due = action.dueAt ? String(action.dueAt).slice(0, 10) : null;
    customFields.push(
      { field: fields.caseId.id, value: action.id },
      { field: fields.status.id, value: action.status },
      { field: fields.due.id, value: due },
      { field: fields.assignee.id, value: action.assignee_name || null }
    );
    const existingTags = Array.isArray(before.tags) ? before.tags.map(Number).filter(Number.isFinite) : [];
    const patch = { custom_fields: customFields, tags: Array.from(new Set([...existingTags, tag.id])) };
    await client.patch(`/documents/${action.paperlessDocumentId}/`, patch);
    const after = (await client.get(`/documents/${action.paperlessDocumentId}/`, { params: { fields: 'id,custom_fields,tags' } })).data;
    const currentFingerprint = fingerprint({ custom_fields: after.custom_fields, tags: after.tags });
    actionCenter.markSynced(householdId, caseId, currentFingerprint);
    actionCenter.addEvent(caseId, memberId, 'paperless.synced', { fingerprint: currentFingerprint });
    return { ok: true, documentId: action.paperlessDocumentId, fingerprint: currentFingerprint };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    actionCenter.markSynced(householdId, caseId, null, message);
    actionCenter.addEvent(caseId, memberId, 'paperless.sync_failed', { error: message });
    throw error;
  }
}

export async function pullCase(householdId: string, caseId: string, memberId: string | null) {
  const action = actionCenter.getCase(householdId, caseId);
  if (!action) throw new Error('Action case not found');
  const client = clientFor(householdId, memberId);
  const { fields } = await schemaFor(householdId, memberId);
  const document = (await client.get(`/documents/${action.paperlessDocumentId}/`, { params: { fields: 'id,custom_fields,tags' } })).data as Record<string, unknown>;
  const statusValue = String(customFieldValue(document, fields.status.id) || '');
  const dueValue = customFieldValue(document, fields.due.id);
  const patch: Partial<actionCenter.ActionCaseInput> = {};
  if (['suggested', 'open', 'waiting', 'done', 'dismissed'].includes(statusValue) && statusValue !== action.status) patch.status = statusValue as actionCenter.CaseStatus;
  if ((dueValue || null) !== (action.dueAt ? String(action.dueAt).slice(0, 10) : null)) patch.dueAt = dueValue ? String(dueValue) : null;
  if (Object.keys(patch).length) actionCenter.updateCase(householdId, caseId, memberId, patch);
  const currentFingerprint = fingerprint({ custom_fields: document.custom_fields, tags: document.tags });
  actionCenter.markSynced(householdId, caseId, currentFingerprint);
  actionCenter.addEvent(caseId, memberId, 'paperless.pulled', { changed: Object.keys(patch), fingerprint: currentFingerprint });
  return { ok: true, changed: Object.keys(patch), case: actionCenter.getCase(householdId, caseId) };
}

export async function patchPaperlessDocument(householdId: string, memberId: string | null, documentId: number, patch: Record<string, unknown>) {
  const allowed = new Set(['title', 'tags', 'correspondent', 'document_type', 'language', 'custom_fields', 'created', 'owner']);
  const safePatch = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.has(key)));
  if (!Object.keys(safePatch).length) throw new Error('No supported Paperless fields were requested');
  const client = clientFor(householdId, memberId);
  const changedFields = Object.keys(safePatch);
  const selectChangedFields = (document: Record<string, unknown>) => Object.fromEntries(changedFields.map((key) => [key, document[key]]));
  const selectedFields = ['id', ...changedFields].join(',');
  const before = (await client.get(`/documents/${documentId}/`, { params: { fields: selectedFields } })).data as Record<string, unknown>;
  await client.patch(`/documents/${documentId}/`, safePatch);
  const after = (await client.get(`/documents/${documentId}/`, { params: { fields: selectedFields } })).data as Record<string, unknown>;
  return { ok: true, documentId, changedFields, before: selectChangedFields(before), after: selectChangedFields(after) };
}

export async function getPaperlessDocument(householdId: string, memberId: string | null, documentId: number) {
  const client = clientFor(householdId, memberId);
  const response = await client.get(`/documents/${documentId}/`, { params: { fields: 'id,title,created,modified,content,tags,correspondent,document_type,custom_fields' } });
  const document = response.data as Record<string, unknown>;
  if (typeof document.content === 'string' && document.content.length > 12_000) document.content = `${document.content.slice(0, 12_000)}\n[truncated]`;
  return document;
}

export async function searchPaperlessDocuments(householdId: string, memberId: string | null, query: string) {
  const client = clientFor(householdId, memberId);
  const response = await client.get('/documents/', { params: { query: String(query).slice(0, 300), page_size: 8, fields: 'id,title,created,modified' } });
  return Array.isArray(response.data?.results) ? response.data.results : [];
}

type ReconciliationResult = { checked: number; changed: number; failed: number };
let activeReconciliation: Promise<ReconciliationResult> | null = null;

async function runReconciliation(limit: number): Promise<ReconciliationResult> {
  const results = { checked: 0, changed: 0, failed: 0 };
  for (const target of actionCenter.listSyncTargets(limit)) {
    try {
      if (['pending', 'error'].includes(target.sync_status)) {
        await pushCase(target.household_id, target.case_id, target.member_id);
        results.checked += 1; results.changed += 1;
      } else {
        const result = await pullCase(target.household_id, target.case_id, target.member_id);
        results.checked += 1; results.changed += result.changed.length ? 1 : 0;
      }
    } catch { results.failed += 1; }
  }
  return results;
}

export async function reconcileAllCases(limit = 250) {
  if (activeReconciliation) return activeReconciliation;
  activeReconciliation = runReconciliation(limit);
  try { return await activeReconciliation; }
  finally { activeReconciliation = null; }
}
