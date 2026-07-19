import axios from 'axios';

type AxiosClient = ReturnType<typeof axios.create>;

export interface TelegramPaperlessDocument {
  id: number;
  title?: string;
  created?: string;
  added?: string;
  content?: string;
  original_file_name?: string;
  correspondent?: number | null;
  document_type?: number | null;
  tags?: number[];
  [key: string]: unknown;
}

export interface NamedPaperlessResource {
  id: number;
  name: string;
  [key: string]: unknown;
}

interface PaperlessTask {
  status?: string;
  state?: string;
  result?: unknown;
  message?: string;
  related_document?: number | { id?: number } | null;
  [key: string]: unknown;
}

export interface ConsumptionResult {
  documentId: number | null;
  duplicate: boolean;
  task: PaperlessTask;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

function normalizeApiUrl(value: string): string {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('Paperless URL is not configured');
  return /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`;
}

function filenameFromHeader(header: unknown): string | null {
  const value = String(header || '');
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch { return encoded; }
  }
  return value.match(/filename="?([^";]+)"?/i)?.[1] || null;
}

function relatedDocumentId(task: PaperlessTask): number | null {
  if (typeof task.related_document === 'number') return task.related_document;
  if (task.related_document && typeof task.related_document === 'object') {
    const id = Number(task.related_document.id);
    if (Number.isSafeInteger(id) && id > 0) return id;
  }
  const text = JSON.stringify(task.result ?? task.message ?? '');
  const candidates = [
    /related[_ ]document[^0-9]{0,20}(\d+)/i,
    /document[^0-9]{0,20}(\d+)[^0-9]{0,30}(?:already exists|duplicate)/i,
    /(?:already exists|duplicate)[^0-9]{0,30}document[^0-9]{0,20}(\d+)/i,
    /(?:created|new|processed)[^0-9]{0,30}document(?: id)?[^0-9]{0,10}(\d+)/i,
    /document(?: id)?[^0-9]{0,10}(\d+)[^0-9]{0,30}(?:created|processed|success)/i
  ];
  for (const pattern of candidates) {
    const id = Number(text.match(pattern)?.[1]);
    if (Number.isSafeInteger(id) && id > 0) return id;
  }
  return null;
}

export class TelegramPaperlessClient {
  readonly apiUrl: string;
  readonly webUrl: string;
  private readonly client: AxiosClient;

  constructor(apiUrl: string, apiToken: string) {
    if (!String(apiToken || '').trim()) throw new Error('Paperless token is not configured');
    this.apiUrl = normalizeApiUrl(apiUrl);
    this.webUrl = this.apiUrl.replace(/\/api$/i, '');
    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: { Authorization: `Token ${apiToken}` },
      timeout: 60_000
    });
  }

  documentUrl(documentId: number): string {
    return `${this.webUrl}/documents/${documentId}/details`;
  }

  async searchDocuments(
    query: string,
    limit: number,
    filters: { createdAfter?: string; createdBefore?: string } = {}
  ): Promise<TelegramPaperlessDocument[]> {
    const response = await this.client.get('/documents/', {
      params: {
        ...(query.trim() ? { query: query.trim() } : {}),
        ...(/^\d{4}-\d{2}-\d{2}$/.test(filters.createdAfter || '') ? { created__gte: filters.createdAfter } : {}),
        ...(/^\d{4}-\d{2}-\d{2}$/.test(filters.createdBefore || '') ? { created__lt: filters.createdBefore } : {}),
        page_size: limit,
        ordering: '-created'
      }
    });
    const results = Array.isArray(response.data?.results) ? response.data.results.slice(0, limit) : [];
    return Promise.all(results.map(async (document: TelegramPaperlessDocument) => {
      if (typeof document.content === 'string' && document.content.trim()) return document;
      return this.getDocument(document.id);
    }));
  }

  async getDocument(documentId: number): Promise<TelegramPaperlessDocument> {
    const response = await this.client.get(`/documents/${documentId}/`);
    return response.data;
  }

  async downloadDocument(documentId: number): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const response = await this.client.get(`/documents/${documentId}/download/`, { responseType: 'arraybuffer' });
    const document = await this.getDocument(documentId);
    return {
      buffer: Buffer.from(response.data),
      filename: filenameFromHeader(response.headers['content-disposition'])
        || document.original_file_name
        || `${document.title || `document-${documentId}`}.pdf`,
      mimeType: String(response.headers['content-type'] || 'application/pdf')
    };
  }

  async uploadDocument(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    const form = new FormData();
    const bytes = new Uint8Array(buffer);
    form.append('document', new Blob([bytes.buffer as ArrayBuffer], { type: mimeType }), filename);
    const response = await this.client.post('/documents/post_document/', form, {
      maxBodyLength: Infinity
    });
    const taskId = typeof response.data === 'string' ? response.data : response.data?.task_id || response.data?.id;
    if (!taskId) throw new Error('Paperless accepted the upload without returning a task id');
    return String(taskId);
  }

  async waitForConsumption(taskId: string, timeoutMs: number, pollMs = 1500): Promise<ConsumptionResult> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const response = await this.client.get('/tasks/', { params: { task_id: taskId } });
      const task: PaperlessTask | undefined = Array.isArray(response.data?.results)
        ? response.data.results[0]
        : Array.isArray(response.data)
          ? response.data[0]
          : response.data;
      if (task) {
        const state = String(task.status || task.state || '').toUpperCase();
        const documentId = relatedDocumentId(task);
        const text = JSON.stringify(task.result ?? task.message ?? '').toLowerCase();
        const duplicate = text.includes('duplicate') || text.includes('already exists');
        if (documentId && (duplicate || ['SUCCESS', 'SUCCESSFUL', 'COMPLETED'].includes(state))) {
          return { documentId, duplicate, task };
        }
        if (['FAILURE', 'FAILED', 'REVOKED'].includes(state)) {
          if (documentId) return { documentId, duplicate: true, task };
          throw new Error(`Paperless could not consume the upload: ${text.slice(0, 300) || state}`);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    throw new Error(`Paperless did not finish processing the upload within ${Math.round(timeoutMs / 1000)} seconds`);
  }

  async listResources(endpoint: 'tags' | 'correspondents' | 'document_types'): Promise<NamedPaperlessResource[]> {
    const resources: NamedPaperlessResource[] = [];
    let next: string | null = `/${endpoint}/?page_size=100`;
    while (next) {
      const response: { data: { results?: NamedPaperlessResource[]; next?: string | null } } = await this.client.get(next);
      resources.push(...(Array.isArray(response.data?.results) ? response.data.results : []));
      if (!response.data?.next) break;
      const nextUrl: URL = new URL(response.data.next, this.apiUrl);
      next = `${nextUrl.pathname.replace(new URL(this.apiUrl).pathname, '')}${nextUrl.search}`;
      if (!next.startsWith('/')) next = `/${next}`;
    }
    return resources;
  }

  async resolveResource(
    endpoint: 'tags' | 'correspondents' | 'document_types',
    name: string,
    known: NamedPaperlessResource[]
  ): Promise<NamedPaperlessResource | null> {
    const normalized = String(name || '').trim().toLocaleLowerCase();
    if (!normalized) return null;
    const existing = known.find((resource) => resource.name.trim().toLocaleLowerCase() === normalized);
    if (existing) return existing;
    try {
      const response = await this.client.post(`/${endpoint}/`, { name: String(name).trim() });
      known.push(response.data);
      return response.data;
    } catch (error) {
      console.warn(`[Telegram] Could not create Paperless ${endpoint} value: ${errorMessage(error)}`);
      return null;
    }
  }

  async updateDocument(documentId: number, update: Record<string, unknown>): Promise<void> {
    await this.client.patch(`/documents/${documentId}/`, update);
  }

  async addNote(documentId: number, note: string): Promise<void> {
    if (!note.trim()) return;
    await this.client.post(`/documents/${documentId}/notes/`, { note: note.trim().slice(0, 1000) });
  }
}

export const telegramPaperlessInternals = { normalizeApiUrl, relatedDocumentId, filenameFromHeader };
