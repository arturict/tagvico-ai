'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, ExternalLink, FileSearch, Save } from 'lucide-react';

type DocumentSummary = { id: number; title?: string; original_filename?: string };
type NamedOption = { id?: number; name?: string };
type UserOption = { id?: number; username?: string };
type ManualOptions = {
  correspondents: NamedOption[];
  documentTypes: NamedOption[];
  users: UserOption[];
  canMutate: boolean | null;
};
type DocumentPreview = {
  content?: string;
  tags?: string[];
  correspondent?: { name?: string } | string | null;
  documentType?: string | number;
  title?: string;
  owner?: { id?: number } | null;
};

async function json<T>(url: string, init?: RequestInit, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The request failed.');
    return payload as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export function ManualProcessingWorkspace() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [options, setOptions] = useState<ManualOptions>({ correspondents: [], documentTypes: [], users: [], canMutate: null });
  const [documentId, setDocumentId] = useState('');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [correspondent, setCorrespondent] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [status, setStatus] = useState('Loading Paperless documents…');
  const [busy, setBusy] = useState<'loading' | 'analyzing' | 'saving' | null>('loading');
  const [previewReady, setPreviewReady] = useState(false);
  const previewRequest = useRef(0);

  const loadIndex = useCallback(async () => {
    setBusy('loading');
    setStatus('Loading Paperless documents…');
    try {
      const [nextDocuments, nextOptions] = await Promise.all([
        json<DocumentSummary[]>('/api/manual/documents', undefined, 30_000),
        json<ManualOptions>('/api/manual/options')
      ]);
      setDocuments(nextDocuments);
      setOptions(nextOptions);
      setStatus(nextDocuments.length ? '' : 'No Paperless documents are available.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Paperless documents are unavailable.');
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => { void loadIndex(); }, [loadIndex]);

  const loadDocument = async (nextId: string) => {
    const requestId = ++previewRequest.current;
    setDocumentId(nextId);
    setPreviewReady(false);
    setContent('');
    setTitle('');
    setTags('');
    setCorrespondent('');
    setDocumentType('');
    setOwnerId('');
    if (!nextId) {
      setStatus('');
      return;
    }
    setBusy('loading');
    setStatus('Loading document preview…');
    try {
      const doc = await json<DocumentPreview>(`/api/manual/preview/${encodeURIComponent(nextId)}`, undefined, 30_000);
      if (requestId !== previewRequest.current) return;
      setContent(doc.content || '');
      setTags(Array.isArray(doc.tags) ? doc.tags.join(', ') : '');
      setCorrespondent(typeof doc.correspondent === 'string' ? doc.correspondent : (doc.correspondent?.name || ''));
      const documentType = options.documentTypes.find((item) =>
        item.id !== undefined && String(item.id) === String(doc.documentType)
      );
      setDocumentType(documentType?.name || (typeof doc.documentType === 'string' ? doc.documentType : ''));
      setTitle(doc.title || '');
      setOwnerId(doc.owner?.id ? String(doc.owner.id) : '');
      setPreviewReady(true);
      setStatus('');
    } catch (error) {
      if (requestId !== previewRequest.current) return;
      setStatus(error instanceof Error ? error.message : 'The preview is unavailable.');
    } finally {
      if (requestId === previewRequest.current) setBusy(null);
    }
  };

  const existingTags = useMemo(
    () => tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    [tags]
  );

  const analyze = async () => {
    if (!documentId) return;
    setBusy('analyzing');
    setStatus('Asking the configured model for filing suggestions…');
    try {
      const result = await json<{ document?: Record<string, unknown> }>('/api/manual/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, id: documentId, existingTags })
      }, 120_000);
      const doc = result.document || {};
      if (Array.isArray(doc.tags)) setTags(doc.tags.map(String).join(', '));
      if (doc.correspondent) setCorrespondent(String(doc.correspondent));
      if (doc.document_type) setDocumentType(String(doc.document_type));
      if (doc.title) setTitle(String(doc.title));
      setStatus('Suggestions are ready. Review every field before saving.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Analysis failed.');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!documentId) return;
    setBusy('saving');
    setStatus('Saving the reviewed metadata to Paperless…');
    try {
      await json('/api/manual/update-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          tags: existingTags,
          correspondent: correspondent.trim(),
          documentType: documentType.trim(),
          title: title.trim(),
          ownerId: ownerId || null
        })
      }, 60_000);
      setStatus('Document updated successfully.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The document could not be updated.');
    } finally {
      setBusy(null);
    }
  };

  return <div className="page operations-page manual-processing-page">
    <header className="page-head operations-page-head">
      <div>
        <p className="eyebrow">Automation · Manual processing</p>
        <h1>Review before filing</h1>
        <p className="lede">Inspect OCR, ask the configured model for suggestions, then decide exactly what reaches Paperless.</p>
      </div>
      <Link className="button" href="/automation"><FileSearch aria-hidden="true" /> Automation overview</Link>
    </header>

    {options.canMutate === false ? <div className="workspace-notice" role="note">
      Your workspace role is read-only. You can inspect documents, but cannot run AI or save changes.
    </div> : null}
    {status ? <div className="workspace-notice" role="status">{status}</div> : null}

    <section className="manual-processing-grid">
      <article className="workspace-card manual-fields">
        <div className="workspace-card-head">
          <div><p className="eyebrow">Document</p><h2>Reviewed metadata</h2></div>
          {documentId ? <a className="icon-button" href={`/api/manual/preview/${documentId}`} target="_blank" rel="noreferrer" aria-label="Open raw document data"><ExternalLink /></a> : null}
        </div>

        <label><span>Paperless document</span><select value={documentId} disabled={Boolean(busy)} onChange={(event) => void loadDocument(event.target.value)}>
          <option value="">Choose a document…</option>
          {documents.map((document) => <option key={document.id} value={document.id}>{document.title || document.original_filename || `Document ${document.id}`}</option>)}
        </select></label>
        <label><span>Title</span><input className="field" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label><span>Correspondent</span><input className="field" list="manual-correspondents" value={correspondent} onChange={(event) => setCorrespondent(event.target.value)} /></label>
        <label><span>Document type</span><input className="field" list="manual-document-types" value={documentType} onChange={(event) => setDocumentType(event.target.value)} /></label>
        <label><span>Owner</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
          <option value="">No owner</option>
          {options.users.map((user) => user.id ? <option key={user.id} value={user.id}>{user.username || `User ${user.id}`}</option> : null)}
        </select></label>
        <label><span>Tags</span><textarea className="field" rows={4} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="invoice, utilities, personal" /><small>Comma-separated. Nothing is written until you save.</small></label>

        <div className="workspace-actions">
          <button className="button" type="button" disabled={options.canMutate !== true || !previewReady || Boolean(busy)} onClick={() => void analyze()}><Bot aria-hidden="true" /> {busy === 'analyzing' ? 'Analyzing…' : 'Suggest with AI'}</button>
          <button className="button primary" type="button" disabled={options.canMutate !== true || !previewReady || Boolean(busy)} onClick={() => void save()}><Save aria-hidden="true" /> {busy === 'saving' ? 'Saving…' : 'Save to Paperless'}</button>
        </div>
      </article>

      <article className="workspace-card manual-preview">
        <div className="workspace-card-head"><div><p className="eyebrow">Source</p><h2>OCR preview</h2></div><span className="workspace-muted">{content.length.toLocaleString()} characters</span></div>
        <pre>{content || (documentId ? 'No OCR text is available.' : 'Choose a document to begin.')}</pre>
      </article>
    </section>

    <datalist id="manual-correspondents">{options.correspondents.map((item) => item.name ? <option key={`${item.id}-${item.name}`} value={item.name} /> : null)}</datalist>
    <datalist id="manual-document-types">{options.documentTypes.map((item) => item.name ? <option key={`${item.id}-${item.name}`} value={item.name} /> : null)}</datalist>
  </div>;
}
