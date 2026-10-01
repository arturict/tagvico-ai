'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Play, RefreshCw, Trash2 } from 'lucide-react';
import { fetchJson } from '@/lib/client/fetch-json';
import { WorkspaceLoadError } from '@/components/workspace-load-error';

type QueueRow = { document_id: number; title?: string; status?: string; attempts?: number };
type FailureRow = QueueRow & { failed_reason?: string };
type IgnoredRow = QueueRow & { reason?: string; ignored_at?: string; updated_at?: string };
type QueuePayload<T> = { rows?: T[]; total?: number };
type StatusPayload = { ocrEnabled: boolean; ocrProvider: string; version: string };

export function OperationsWorkspace() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [ocrRows, setOcrRows] = useState<QueueRow[]>([]);
  const [failures, setFailures] = useState<FailureRow[]>([]);
  const [ignored, setIgnored] = useState<IgnoredRow[]>([]);
  const [ocrDocumentId, setOcrDocumentId] = useState('');
  const [ignoredDocumentId, setIgnoredDocumentId] = useState('');
  const [ignoredReason, setIgnoredReason] = useState('');
  const [notice, setNotice] = useState('Loading recovery queues…');
  const [busy, setBusy] = useState<string | null>(null);
  const [statusError, setStatusError] = useState('');
  const [ocrError, setOcrError] = useState('');
  const [failuresError, setFailuresError] = useState('');
  const [ignoredError, setIgnoredError] = useState('');
  const [statusLoading, setStatusLoading] = useState(true);
  const [ocrLoading, setOcrLoading] = useState(true);
  const [failuresLoading, setFailuresLoading] = useState(true);
  const [ignoredLoading, setIgnoredLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError('');
    try {
      setStatus(await fetchJson<StatusPayload>('/api/operations/status'));
      return true;
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Recovery status is unavailable.');
      return false;
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadOcr = useCallback(async () => {
    setOcrLoading(true);
    setOcrError('');
    try {
      const payload = await fetchJson<QueuePayload<QueueRow>>('/api/ocr/queue?limit=100');
      setOcrRows(payload.rows || []);
      return true;
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : 'The OCR queue is unavailable.');
      return false;
    } finally {
      setOcrLoading(false);
    }
  }, []);

  const loadFailures = useCallback(async () => {
    setFailuresLoading(true);
    setFailuresError('');
    try {
      const payload = await fetchJson<QueuePayload<FailureRow>>('/api/failures?limit=100');
      setFailures(payload.rows || []);
      return true;
    } catch (error) {
      setFailuresError(error instanceof Error ? error.message : 'The failure queue is unavailable.');
      return false;
    } finally {
      setFailuresLoading(false);
    }
  }, []);

  const loadIgnored = useCallback(async () => {
    setIgnoredLoading(true);
    setIgnoredError('');
    try {
      const payload = await fetchJson<QueuePayload<IgnoredRow>>('/api/ignored?limit=100');
      setIgnored(payload.rows || []);
      return true;
    } catch (error) {
      setIgnoredError(error instanceof Error ? error.message : 'The ignored-document list is unavailable.');
      return false;
    } finally {
      setIgnoredLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setNotice('Loading recovery queues…');
    const results = await Promise.allSettled([loadStatus(), loadOcr(), loadFailures(), loadIgnored()]);
    const loaded = results.map((result) => result.status === 'fulfilled' && result.value);
    if (!loaded.some(Boolean)) {
      setNotice('Recovery data could not be loaded. Retry the affected sections.');
    } else if (!loaded.every(Boolean)) {
      setNotice('Some recovery data could not be loaded. Available sections remain usable.');
    } else {
      setNotice('Recovery queues are current.');
    }
  }, [loadFailures, loadIgnored, loadOcr, loadStatus]);

  useEffect(() => { void refresh(); }, [refresh]);

  const refreshQueues = useCallback(async () => {
    const refreshes = await Promise.allSettled([loadOcr(), loadFailures(), loadIgnored()]);
    return refreshes.every((result) => result.status === 'fulfilled' && result.value);
  }, [loadFailures, loadIgnored, loadOcr]);

  const action = async (key: string, work: () => Promise<void>, success: string) => {
    setBusy(key);
    setNotice('Applying operation…');
    try {
      await work();
      const refreshed = await refreshQueues();
      setNotice(refreshed ? success : `${success} Some queue data could not be refreshed.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The operation failed.');
    } finally {
      setBusy(null);
    }
  };

  const addOcrDocument = async (event: FormEvent) => {
    event.preventDefault();
    const id = positiveInteger(ocrDocumentId);
    if (!id) {
      setNotice('Enter a valid Paperless document ID.');
      return;
    }
    await action(`add-ocr-${id}`, async () => {
      await fetchJson('/api/ocr/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: id })
      });
      setOcrDocumentId('');
    }, `Document ${id} was added to the OCR rescue queue.`);
  };

  const addIgnoredDocument = async (event: FormEvent) => {
    event.preventDefault();
    const id = positiveInteger(ignoredDocumentId);
    if (!id) {
      setNotice('Enter a valid Paperless document ID.');
      return;
    }
    await action(`ignore-${id}`, async () => {
      await fetchJson('/api/ignored', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: id, reason: ignoredReason.trim() })
      });
      setIgnoredDocumentId('');
      setIgnoredReason('');
    }, `Document ${id} will stay out of automatic processing until you un-ignore it.`);
  };

  const processDocument = async (id: number) => {
    await action(`process-${id}`, async () => {
      const response = await fetch(`/api/ocr/process/${id}`, {
        method: 'POST',
        signal: AbortSignal.timeout(120_000)
      });
      const text = await response.text();
      if (!response.ok) throw new Error('OCR processing failed.');
      const events = text.trim().split('\n\n').map((line) => {
        try { return JSON.parse(line.replace(/^data:\s*/, '')) as { message?: string; step?: string }; } catch { return null; }
      }).filter(Boolean);
      const final = events.at(-1);
      if (final?.step === 'error') throw new Error(final.message || 'OCR processing failed.');
    }, `Processing finished for document ${id}.`);
  };

  return <div className="page-column rec-page">
    <Link className="btn btn-ghost btn-28 pg-back" href="/automation"><ArrowLeft aria-hidden="true" /> Overview</Link>
    <header className="page-header pg-header">
      <div className="page-header-text">
        <h1 className="page-title">Recovery</h1>
      </div>
      <div className="page-actions pg-actions">
        <button className="btn btn-danger btn-32" type="button" disabled={busy === 'stop'} onClick={() => void action('stop', async () => { await fetchJson('/api/scan/stop', { method: 'POST' }); }, 'Stop requested. Active work will return safely to the queue.')}>Stop scan</button>
      </div>
    </header>

    <p className="pg-status" role="status">{notice}</p>

    <section className="section rec-section" aria-labelledby="rec-ocr-title">
      <div className="rec-section-head">
        <div className="rec-section-text">
          <h2 className="section-title" id="rec-ocr-title">OCR queue</h2>
          {statusError ? null : statusLoading && !status ? <p className="pg-muted shimmer">Checking OCR…</p> : <p className="pg-muted">
            {status?.ocrEnabled ? `OCR rescue is on (${status.ocrProvider}).` : 'OCR rescue is off. Turn it on in Settings.'}
          </p>}
        </div>
        <button className="btn btn-ghost btn-32 btn-icon" type="button" disabled={ocrLoading} aria-label="Refresh OCR queue" title="Refresh" onClick={() => void loadOcr()}><RefreshCw aria-hidden="true" /></button>
      </div>
      {statusError ? <WorkspaceLoadError
        title="Recovery status is unavailable"
        message={statusError}
        retrying={statusLoading}
        onRetry={() => void loadStatus()}
      /> : null}
      <form className="rec-form" onSubmit={addOcrDocument}>
        <label className="rec-field">
          <span className="sr-only">Paperless document ID</span>
          <input className="input input-32" inputMode="numeric" value={ocrDocumentId} onChange={(event) => setOcrDocumentId(event.target.value)} placeholder="Paperless document ID" />
        </label>
        <button className="btn btn-secondary btn-32" type="submit" disabled={busy?.startsWith('add-ocr-')}>Add to queue</button>
      </form>
      {ocrError ? <WorkspaceLoadError
        title="OCR queue is unavailable"
        message={ocrError}
        retrying={ocrLoading}
        onRetry={() => void loadOcr()}
      /> : ocrLoading && !ocrRows.length ? <RowSkeleton label="Loading OCR queue" /> : ocrRows.length ? <ul className="list rec-list">
        {ocrRows.map((row) => <li className="list-row" key={row.document_id}>
          <div className="list-row-main">
            <span className="list-row-title">{row.title || 'Untitled document'}</span>
            <span className="list-row-meta">#{row.document_id} · {humanize(row.status || 'queued')} · {attempts(row.attempts)}</span>
          </div>
          <div className="list-row-actions">
            <button className="btn btn-ghost btn-28 btn-icon" type="button" aria-label={`Process document ${row.document_id}`} title="Process now" disabled={busy === `process-${row.document_id}`} onClick={() => void processDocument(row.document_id)}><Play aria-hidden="true" /></button>
            <button className="btn btn-ghost btn-28 btn-icon" type="button" aria-label={`Remove document ${row.document_id}`} title="Remove from queue" disabled={busy === `remove-${row.document_id}`} onClick={() => void action(`remove-${row.document_id}`, async () => { await fetchJson(`/api/ocr/queue/${row.document_id}`, { method: 'DELETE' }); }, `Document ${row.document_id} was removed from the OCR queue.`)}><Trash2 aria-hidden="true" /></button>
          </div>
        </li>)}
      </ul> : <p className="pg-muted rec-empty">No documents are waiting for OCR.</p>}
    </section>

    <section className="section rec-section" id="failed-documents" aria-labelledby="rec-failed-title">
      <div className="rec-section-head">
        <div className="rec-section-text">
          <h2 className="section-title" id="rec-failed-title">Failed documents</h2>
        </div>
        <button className="btn btn-ghost btn-32 btn-icon" type="button" disabled={failuresLoading} aria-label="Refresh failure queue" title="Refresh" onClick={() => void loadFailures()}><RefreshCw aria-hidden="true" /></button>
      </div>
      {failuresError ? <WorkspaceLoadError
        title="Failure queue is unavailable"
        message={failuresError}
        retrying={failuresLoading}
        onRetry={() => void loadFailures()}
      /> : failuresLoading && !failures.length ? <RowSkeleton label="Loading failure queue" /> : failures.length ? <ul className="list rec-list">
        {failures.map((row) => <li className="list-row" key={row.document_id}>
          <div className="list-row-main">
            <span className="list-row-title">{row.title || 'Untitled document'}</span>
            <span className="list-row-meta">#{row.document_id} · {row.failed_reason || 'No reason recorded'} · {attempts(row.attempts)}</span>
          </div>
          <div className="list-row-actions">
            <button className="btn btn-secondary btn-28" type="button" disabled={busy === `reset-${row.document_id}`} onClick={() => void action(`reset-${row.document_id}`, async () => { await fetchJson(`/api/failures/${row.document_id}/reset`, { method: 'POST' }); }, `Document ${row.document_id} may be scanned again.`)}>Reset</button>
            <button className="btn btn-danger btn-28" type="button" disabled={busy === `ignore-failed-${row.document_id}`} onClick={() => void action(`ignore-failed-${row.document_id}`, async () => { await fetchJson(`/api/failures/${row.document_id}/ignore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: row.failed_reason || 'Moved from permanently failed' }) }); }, `Document ${row.document_id} is now permanently ignored.`)}>Ignore</button>
          </div>
        </li>)}
      </ul> : <p className="pg-muted rec-empty">No failed documents.</p>}
    </section>

    <section className="section rec-section" id="ignored-documents" aria-labelledby="rec-ignored-title">
      <div className="rec-section-head">
        <div className="rec-section-text">
          <h2 className="section-title" id="rec-ignored-title">Permanent skip list</h2>
          <p className="pg-muted">Documents here stay out of every scan until you un-ignore them.</p>
        </div>
        <button className="btn btn-ghost btn-32 btn-icon" type="button" disabled={ignoredLoading} aria-label="Refresh ignored documents" title="Refresh" onClick={() => void loadIgnored()}><RefreshCw aria-hidden="true" /></button>
      </div>
      <form className="rec-form" onSubmit={addIgnoredDocument}>
        <label className="rec-field is-id">
          <span className="sr-only">Document ID</span>
          <input className="input input-32" inputMode="numeric" value={ignoredDocumentId} onChange={(event) => setIgnoredDocumentId(event.target.value)} placeholder="Document ID" />
        </label>
        <label className="rec-field">
          <span className="sr-only">Reason (optional)</span>
          <input className="input input-32" value={ignoredReason} onChange={(event) => setIgnoredReason(event.target.value)} placeholder="Reason (optional)" />
        </label>
        <button className="btn btn-secondary btn-32" type="submit" disabled={busy?.startsWith('ignore-')}>Ignore document</button>
      </form>
      {ignoredError ? <WorkspaceLoadError
        title="Ignored documents are unavailable"
        message={ignoredError}
        retrying={ignoredLoading}
        onRetry={() => void loadIgnored()}
      /> : ignoredLoading && !ignored.length ? <RowSkeleton label="Loading ignored documents" /> : ignored.length ? <ul className="list rec-list">
        {ignored.map((row) => {
          const since = row.ignored_at || row.updated_at;
          return <li className="list-row" key={row.document_id}>
            <div className="list-row-main">
              <span className="list-row-title">{row.title || 'Untitled document'}</span>
              <span className="list-row-meta">#{row.document_id} · {row.reason || 'No reason given'}</span>
            </div>
            <span className="list-row-trailing">{since ? <time dateTime={String(since)}>{new Date(String(since)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</time> : null}</span>
            <div className="list-row-actions">
              <button className="btn btn-secondary btn-28" type="button" disabled={busy === `unignore-${row.document_id}`} onClick={() => void action(`unignore-${row.document_id}`, async () => { await fetchJson(`/api/ignored/${row.document_id}`, { method: 'DELETE' }); }, `Document ${row.document_id} was un-ignored and queued for a filter-bypassing rescan.`)}>Un-ignore</button>
            </div>
          </li>;
        })}
      </ul> : <p className="pg-muted rec-empty">No documents are ignored.</p>}
    </section>
  </div>;
}

function RowSkeleton({ label }: { label: string }) {
  return <div className="pg-skeleton-rows" aria-label={label}>
    {Array.from({ length: 3 }, (_, index) => <div className="pg-skeleton-row" key={index}>
      <span className="pg-skeleton-stack"><span className="pg-skeleton-bar is-title" /><span className="pg-skeleton-bar is-meta" /></span>
    </div>)}
  </div>;
}

function attempts(count?: number) {
  const value = count || 0;
  return `${value} attempt${value === 1 ? '' : 's'}`;
}

function humanize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}

function positiveInteger(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
