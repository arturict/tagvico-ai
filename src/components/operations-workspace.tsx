'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CircleStop, Gauge, Play, Plus, RefreshCw, RotateCcw, ShieldCheck, Trash2, Wrench } from 'lucide-react';
import { fetchJson } from '@/lib/client/fetch-json';
import { WorkspaceLoadError } from '@/components/workspace-load-error';

type QueueRow = { document_id: number; title?: string; status?: string; attempts?: number };
type FailureRow = QueueRow & { failed_reason?: string };
type QueuePayload<T> = { rows?: T[]; total?: number };
type StatusPayload = { ocrEnabled: boolean; ocrProvider: string; version: string };

export function OperationsWorkspace() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [ocrRows, setOcrRows] = useState<QueueRow[]>([]);
  const [failures, setFailures] = useState<FailureRow[]>([]);
  const [documentId, setDocumentId] = useState('');
  const [notice, setNotice] = useState('Loading recovery queues…');
  const [busy, setBusy] = useState<string | null>(null);
  const [statusError, setStatusError] = useState('');
  const [ocrError, setOcrError] = useState('');
  const [failuresError, setFailuresError] = useState('');
  const [statusLoading, setStatusLoading] = useState(true);
  const [ocrLoading, setOcrLoading] = useState(true);
  const [failuresLoading, setFailuresLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError('');
    try {
      const payload = await fetchJson<StatusPayload>('/api/operations/status');
      setStatus(payload);
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

  const refresh = useCallback(async () => {
    setNotice('Loading recovery queues…');
    const results = await Promise.allSettled([loadStatus(), loadOcr(), loadFailures()]);
    const loaded = results.map((result) => result.status === 'fulfilled' && result.value);
    if (!loaded.some(Boolean)) {
      setNotice('Recovery data could not be loaded. Retry the affected sections.');
    } else if (!loaded.every(Boolean)) {
      setNotice('Some recovery data could not be loaded. Available sections remain usable.');
    } else {
      setNotice('Recovery queues are current.');
    }
  }, [loadFailures, loadOcr, loadStatus]);

  useEffect(() => { void refresh(); }, [refresh]);

  const action = async (key: string, work: () => Promise<void>, success: string) => {
    setBusy(key);
    setNotice('Applying operation…');
    try {
      await work();
      const refreshes = await Promise.allSettled([loadOcr(), loadFailures()]);
      const refreshed = refreshes.every((result) => result.status === 'fulfilled' && result.value);
      setNotice(refreshed ? success : `${success} Some queue data could not be refreshed.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The operation failed.');
    } finally {
      setBusy(null);
    }
  };

  const addDocument = async (event: FormEvent) => {
    event.preventDefault();
    const id = Number(documentId);
    if (!Number.isInteger(id) || id <= 0) {
      setNotice('Enter a valid Paperless document ID.');
      return;
    }
    await action(`add-${id}`, async () => {
      await fetchJson('/api/ocr/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: id })
      });
      setDocumentId('');
    }, `Document ${id} was added to the OCR rescue queue.`);
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

  return <div className="page operations-page">
    <header className="page-head operations-page-head">
      <div><p className="eyebrow">Automation · Recovery</p><h1>Recovery</h1><p className="lede">Inspect stalled documents, rescue weak OCR and stop a running scan without touching the service.</p></div>
      <div className="workspace-actions">
        <Link className="button" href="/automation"><Gauge /> Automation overview</Link>
        <button className="button danger" type="button" disabled={busy === 'stop'} onClick={() => void action('stop', async () => { await fetchJson('/api/scan/stop', { method: 'POST' }); }, 'Stop requested. Active work will return safely to the queue.')}><CircleStop /> Stop scan</button>
      </div>
    </header>

    <div className="workspace-notice" role="status">{notice}</div>

    {statusError ? <WorkspaceLoadError
      title="Recovery status is unavailable"
      message={statusError}
      retrying={statusLoading}
      onRetry={() => void loadStatus()}
    /> : statusLoading && !status ? <div className="workspace-skeleton" aria-label="Loading recovery status">
      {Array.from({ length: 3 }, (_, index) => <span key={index} />)}
    </div> : <section className="signal-grid" aria-label="Recovery status">
      <Signal icon={<Wrench />} label="OCR rescue" value={status?.ocrEnabled ? 'Ready' : 'Disabled'} detail={status?.ocrEnabled ? `Provider: ${status.ocrProvider}` : 'Enable OCR in Settings'} active={Boolean(status?.ocrEnabled)} />
      <Signal icon={<ShieldCheck />} label="Queue discipline" value="Durable" detail="Interrupted work returns after restart" active />
      <Signal
        icon={<RotateCcw />}
        label="Terminal failures"
        value={failuresError ? 'Unavailable' : failuresLoading ? '…' : String(failures.length)}
        detail={failuresError ? 'Could not refresh the failure queue' : 'Explicit reset required before rescan'}
        active={!failuresError && !failuresLoading && !failures.length}
      />
    </section>}

    <section className="workspace-grid">
      <article className="workspace-card workspace-span-7">
        <div className="workspace-card-head">
          <div><p className="eyebrow">OCR queue</p><h2>Documents awaiting rescue</h2></div>
          <button className="icon-button" type="button" disabled={ocrLoading} aria-label="Refresh OCR queue" onClick={() => void loadOcr()}><RefreshCw /></button>
        </div>
        <form className="operations-add" onSubmit={addDocument}>
          <label><span className="sr-only">Paperless document ID</span><input inputMode="numeric" value={documentId} onChange={(event) => setDocumentId(event.target.value)} placeholder="Paperless document ID" /></label>
          <button className="button primary" type="submit" disabled={busy?.startsWith('add-')}><Plus /> Add to queue</button>
        </form>
        {ocrError ? <WorkspaceLoadError
          title="OCR queue is unavailable"
          message={ocrError}
          retrying={ocrLoading}
          onRetry={() => void loadOcr()}
        /> : ocrLoading && !ocrRows.length ? <div className="workspace-skeleton" aria-label="Loading OCR queue">
          {Array.from({ length: 3 }, (_, index) => <span key={index} />)}
        </div> : <div className="workspace-table-wrap">
          <table className="workspace-table">
            <thead><tr><th>Document</th><th>Status</th><th>Attempts</th><th>Actions</th></tr></thead>
            <tbody>{ocrRows.length ? ocrRows.map((row) => <tr key={row.document_id}>
              <td><strong>#{row.document_id}</strong><small>{row.title || 'Untitled document'}</small></td>
              <td><span className="status-pill">{row.status || 'queued'}</span></td>
              <td>{row.attempts || 0}</td>
              <td><div className="table-actions">
                <button className="icon-button" type="button" aria-label={`Process document ${row.document_id}`} disabled={busy === `process-${row.document_id}`} onClick={() => void processDocument(row.document_id)}><Play /></button>
                <button className="icon-button is-danger" type="button" aria-label={`Remove document ${row.document_id}`} disabled={busy === `remove-${row.document_id}`} onClick={() => void action(`remove-${row.document_id}`, async () => { await fetchJson(`/api/ocr/queue/${row.document_id}`, { method: 'DELETE' }); }, `Document ${row.document_id} was removed from the OCR queue.`)}><Trash2 /></button>
              </div></td>
            </tr>) : <tr><td colSpan={4}><div className="empty-compact">No OCR rescue work is queued.</div></td></tr>}</tbody>
          </table>
        </div>}
      </article>

      <article className="workspace-card workspace-span-5">
        <div className="workspace-card-head">
          <div><p className="eyebrow">Failure queue</p><h2>Needs operator attention</h2></div>
          <button className="icon-button" type="button" disabled={failuresLoading} aria-label="Refresh failure queue" onClick={() => void loadFailures()}><RefreshCw /></button>
        </div>
        <div className="failure-list">
          {failuresError ? <WorkspaceLoadError
            title="Failure queue is unavailable"
            message={failuresError}
            retrying={failuresLoading}
            onRetry={() => void loadFailures()}
          /> : failuresLoading && !failures.length ? <div className="workspace-skeleton" aria-label="Loading failure queue">
            {Array.from({ length: 3 }, (_, index) => <span key={index} />)}
          </div> : failures.length ? failures.map((row) => <div key={row.document_id}>
            <div><strong>#{row.document_id} · {row.title || 'Untitled document'}</strong><span>{row.failed_reason || 'No failure reason recorded'} · {row.attempts || 0} attempts</span></div>
            <button className="button" type="button" disabled={busy === `reset-${row.document_id}`} onClick={() => void action(`reset-${row.document_id}`, async () => { await fetchJson(`/api/failures/${row.document_id}/reset`, { method: 'POST' }); }, `Document ${row.document_id} may be scanned again.`)}><RotateCcw /> Reset</button>
          </div>) : <div className="empty"><h2>No terminal failures</h2><p>The automation queue is healthy.</p></div>}
        </div>
      </article>
    </section>
  </div>;
}

function Signal({ icon, label, value, detail, active }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  active: boolean;
}) {
  return <article className={`signal-card${active ? ' is-active' : ''}`}><div>{icon}</div><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
