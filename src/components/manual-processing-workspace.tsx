'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';

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

  return <div className="page-column is-wide man-page">
    <Link className="btn btn-ghost btn-28 pg-back" href="/automation"><ArrowLeft aria-hidden="true" /> Overview</Link>
    <header className="page-header pg-header">
      <div className="page-header-text">
        <h1 className="page-title">Manual processing</h1>
        <p className="page-description">Nothing reaches Paperless until you save.</p>
      </div>
    </header>

    {options.canMutate === false ? <p className="pg-status" role="note">
      Your role is read-only. You can look at documents but cannot run AI or save changes.
    </p> : null}
    {status ? <p className="pg-status" role="status">{status}</p> : null}

    <div className="man-layout">
      <section className="man-fields" aria-label="Metadata">
        <label className="man-field">
          <span className="field-label">Document</span>
          <select className="select" value={documentId} disabled={Boolean(busy)} onChange={(event) => void loadDocument(event.target.value)}>
            <option value="">Choose a document…</option>
            {documents.map((document) => <option key={document.id} value={document.id}>{document.title || document.original_filename || `Document ${document.id}`}</option>)}
          </select>
        </label>
        <label className="man-field"><span className="field-label">Title</span><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="man-field"><span className="field-label">Correspondent</span><input className="input" list="manual-correspondents" value={correspondent} onChange={(event) => setCorrespondent(event.target.value)} /></label>
        <label className="man-field"><span className="field-label">Document type</span><input className="input" list="manual-document-types" value={documentType} onChange={(event) => setDocumentType(event.target.value)} /></label>
        <label className="man-field"><span className="field-label">Owner</span><select className="select" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
          <option value="">No owner</option>
          {options.users.map((user) => user.id ? <option key={user.id} value={user.id}>{user.username || `User ${user.id}`}</option> : null)}
        </select></label>
        <label className="man-field">
          <span className="field-label">Tags</span>
          <textarea className="textarea" rows={3} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="invoice, utilities, personal" />
          <span className="field-help">Separate tags with commas.</span>
        </label>

        <div className="man-actions">
          <button className="btn btn-secondary" type="button" disabled={options.canMutate !== true || !previewReady || !content.trim() || Boolean(busy)} onClick={() => void analyze()}>{busy === 'analyzing' ? 'Analyzing…' : 'Suggest with AI'}</button>
          <button className="btn btn-primary" type="button" disabled={options.canMutate !== true || !previewReady || Boolean(busy)} onClick={() => void save()}>{busy === 'saving' ? 'Saving…' : 'Save to Paperless'}</button>
        </div>
      </section>

      <section className="section man-preview" aria-labelledby="man-text-title">
        <div className="man-preview-head">
          <h2 className="section-title" id="man-text-title">Text</h2>
          <span className="meta">{content ? `${content.length.toLocaleString()} characters` : ''}</span>
          {documentId ? <a className="btn btn-ghost btn-28 btn-icon" href={`/api/manual/preview/${documentId}`} target="_blank" rel="noreferrer" aria-label="Open raw document data" title="Raw document data"><ExternalLink aria-hidden="true" /></a> : null}
        </div>
        {content
          ? <pre className="pg-ocr">{content}</pre>
          : <p className="pg-muted">{documentId ? 'No OCR text is available.' : 'Choose a document to see its text.'}</p>}
      </section>
    </div>

    <datalist id="manual-correspondents">{options.correspondents.map((item) => item.name ? <option key={`${item.id}-${item.name}`} value={item.name} /> : null)}</datalist>
    <datalist id="manual-document-types">{options.documentTypes.map((item) => item.name ? <option key={`${item.id}-${item.name}`} value={item.name} /> : null)}</datalist>
  </div>;
}
