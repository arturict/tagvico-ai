'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileClock,
  Info,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Undo2,
  X
} from 'lucide-react';
import { fetchJson } from '@/lib/client/fetch-json';
import { WorkspaceLoadError } from '@/components/workspace-load-error';

type Tag = { id: number; name: string; color?: string };
type HistoryRow = {
  history_id: number;
  document_id: number;
  title: string;
  created_at: string;
  tags: Tag[];
  correspondent: string;
  link: string;
};
type HistoryPayload = { recordsTotal: number; recordsFiltered: number; data: HistoryRow[] };
type FilterPayload = { tags: Tag[]; correspondents: string[] };
type DiffEntry = { field: string; before: unknown; after: unknown; applied?: boolean; error?: string };
type HistoryEvent = {
  id?: number;
  document_id: number;
  title?: string;
  created_at?: string;
  event_type?: string;
  source?: string;
  diff?: DiffEntry[];
  metadata?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
};
type HistoryDetails = {
  documentId: number;
  latest: HistoryEvent;
  events: HistoryEvent[];
  original: Record<string, unknown>;
  metadata: Record<string, unknown>;
  metrics: Record<string, unknown>;
};
type DetailsState = {
  documentId: number;
  title: string;
  loading: boolean;
  error: string;
  data: HistoryDetails | null;
};
type ConfirmState =
  | { kind: 'restore'; id: number }
  | { kind: 'rescanAll' }
  | { kind: 'cleanup'; count: number };

export function HistoryWorkspace() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [filters, setFilters] = useState<FilterPayload>({ tags: [], correspondents: [] });
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [correspondent, setCorrespondent] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState('');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [orphanCount, setOrphanCount] = useState<number | null>(null);
  const [details, setDetails] = useState<DetailsState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const pageSize = 10;

  const query = useMemo(() => {
    const params = new URLSearchParams({
      draw: '1',
      start: String(page * pageSize),
      length: String(pageSize),
      'search[value]': search,
      tag,
      correspondent
    });
    return params.toString();
  }, [correspondent, page, search, tag]);

  const load = useCallback(async () => {
    setLoadState('loading');
    setLoadError('');
    try {
      const payload = await fetchJson<HistoryPayload>(`/api/history?${query}`);
      setRows(payload.data || []);
      setTotal(payload.recordsFiltered || 0);
      setSelected(new Set());
      setLoadState('ready');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'History is unavailable.');
      setLoadState('error');
    }
  }, [query]);

  useEffect(() => {
    void fetchJson<FilterPayload>('/api/history/filters').then(setFilters).catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 220);
    return () => window.clearTimeout(timer);
  }, [load]);

  const mutate = async (url: string, init: RequestInit, success: string) => {
    setStatus('Applying change…');
    try {
      await fetchJson(url, init);
      setStatus(success);
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The change failed.');
    }
  };

  const rescanSelected = async () => {
    if (!selected.size) {
      setStatus('Select at least one document first.');
      return;
    }
    await mutate('/api/reset-documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selected] })
    }, `${selected.size} document${selected.size === 1 ? '' : 's'} queued for rescan. Their restore snapshots were preserved.`);
  };

  const validateHistory = async () => {
    setStatus('Comparing local history with Paperless-ngx…');
    try {
      const payload = await fetchJson<{ count: number }>('/api/reconciliation/preview');
      setOrphanCount(payload.count || 0);
      setStatus(payload.count
        ? `${payload.count} orphaned history record${payload.count === 1 ? '' : 's'} found. Review and clean them up when ready.`
        : 'History is valid. Every tracked document still exists in Paperless-ngx.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'History validation failed.');
    }
  };

  const openDetails = async (row: HistoryRow) => {
    setDetails({ documentId: row.document_id, title: row.title, loading: true, error: '', data: null });
    try {
      const data = await fetchJson<HistoryDetails>(`/api/history/${row.document_id}/details`);
      setDetails({ documentId: row.document_id, title: row.title, loading: false, error: '', data });
    } catch (error) {
      setDetails({
        documentId: row.document_id,
        title: row.title,
        loading: false,
        error: error instanceof Error ? error.message : 'Document details are unavailable.',
        data: null
      });
    }
  };

  const confirmMutation = async () => {
    if (!confirm) return;
    const current = confirm;
    setConfirm(null);
    if (current.kind === 'rescanAll') {
      await mutate('/api/reset-all-documents', { method: 'POST' }, 'All history documents were queued for rescan. Restore snapshots were preserved.');
      return;
    }
    if (current.kind === 'cleanup') {
      setStatus('Removing orphaned local records…');
      try {
        const payload = await fetchJson<{ removed: number }>('/api/reconciliation/run', { method: 'POST' });
        setOrphanCount(0);
        setStatus(`${payload.removed || 0} orphaned record${payload.removed === 1 ? '' : 's'} removed.`);
        await load();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'History cleanup failed.');
      }
      return;
    }
    await mutate(`/api/history/${current.id}/restore`, { method: 'POST' }, `Document ${current.id} was restored to its first saved state.`);
    setDetails(null);
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return <div className="page operations-page">
    <header className="page-head operations-page-head">
      <div>
        <p className="eyebrow">Audit trail</p>
        <h1>Activity</h1>
        <p className="lede">Inspect every AI decision, token count and original value. Rescan safely or restore the first saved state.</p>
      </div>
      <div className="workspace-actions">
        <button className="button" type="button" onClick={() => void validateHistory()}><ShieldCheck /> Validate history</button>
        {orphanCount ? <button className="button danger" type="button" onClick={() => setConfirm({ kind: 'cleanup', count: orphanCount })}><Trash2 /> Clean up {orphanCount}</button> : null}
        <button className="button" type="button" onClick={() => void rescanSelected()}><RefreshCcw /> Rescan selected</button>
        <button className="button danger" type="button" onClick={() => setConfirm({ kind: 'rescanAll' })}><RotateCcw /> Rescan all</button>
      </div>
    </header>

    {status ? <div className="workspace-notice" role="status">{status}</div> : null}

    <section className="workspace-card history-filters" aria-label="History filters">
      <label className="workspace-search"><Search aria-hidden="true" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search titles, correspondents or tags…" /></label>
      <label><span>Tag</span><select value={tag} onChange={(event) => { setTag(event.target.value); setPage(0); }}><option value="">All tags</option>{filters.tags.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>Correspondent</span><select value={correspondent} onChange={(event) => { setCorrespondent(event.target.value); setPage(0); }}><option value="">All correspondents</option>{filters.correspondents.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    </section>

    <section className="workspace-card history-card">
      <div className="workspace-card-head">
        <div><p className="eyebrow">Documents</p><h2>{total} history records</h2></div>
        <span className="workspace-muted">Page {page + 1} of {pageCount}</span>
      </div>
      {loadState === 'error' ? <WorkspaceLoadError
        title="History is unavailable"
        message={loadError}
        onRetry={() => void load()}
      /> : loadState === 'loading' && !rows.length ? <div className="workspace-skeleton" aria-label="Loading history">
        {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
      </div> : rows.length ? <div className="workspace-table-wrap">
        <table className="workspace-table">
          <thead><tr><th className="check-column"><span className="sr-only">Select</span></th><th>Document</th><th>Tags</th><th>Correspondent</th><th>Actions</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={`${row.history_id}-${row.document_id}`}>
            <td><input aria-label={`Select document ${row.document_id}`} type="checkbox" checked={selected.has(row.document_id)} onChange={(event) => setSelected((current) => {
              const next = new Set(current);
              if (event.target.checked) next.add(row.document_id); else next.delete(row.document_id);
              return next;
            })} /></td>
            <td><strong>{row.title}</strong><small>#{row.document_id} · {new Date(row.created_at).toLocaleString()}</small></td>
            <td><div className="tag-list">{row.tags.map((item) => <span key={item.id}>{item.name}</span>)}</div></td>
            <td>{row.correspondent}</td>
            <td><div className="table-actions">
              <button className="button history-details-button" type="button" onClick={() => void openDetails(row)}><Info /> Details</button>
              <a className="icon-button" href={row.link} target="_blank" rel="noreferrer" aria-label={`Open document ${row.document_id}`}><ExternalLink /></a>
              <button className="icon-button" type="button" aria-label={`Rescan document ${row.document_id}`} onClick={() => void mutate(`/api/history/${row.document_id}/rescan`, { method: 'POST' }, `Document ${row.document_id} was queued for a filter-bypassing rescan.`)}><RefreshCcw /></button>
              <button className="icon-button is-danger" type="button" aria-label={`Restore document ${row.document_id}`} onClick={() => setConfirm({ kind: 'restore', id: row.document_id })}><Undo2 /></button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div> : loadState === 'ready' ? <div className="empty"><h2>No matching records</h2><p>Try another filter or run document automation first.</p></div> : null}
      {loadState === 'ready' ? <footer className="workspace-pagination">
        <button className="button" type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft /> Previous</button>
        <span>{page * pageSize + (rows.length ? 1 : 0)}–{Math.min(total, (page + 1) * pageSize)} of {total}</span>
        <button className="button" type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>Next <ChevronRight /></button>
      </footer> : null}
    </section>

    {details ? <HistoryDetailsDialog
      state={details}
      onClose={() => setDetails(null)}
      onRetry={() => {
        const row = rows.find((item) => item.document_id === details.documentId);
        if (row) void openDetails(row);
      }}
      onRescan={() => void mutate(`/api/history/${details.documentId}/rescan`, { method: 'POST' }, `Document ${details.documentId} was queued for a filter-bypassing rescan.`).then(() => setDetails(null))}
      onRestore={() => setConfirm({ kind: 'restore', id: details.documentId })}
    /> : null}

    {confirm ? <div className="workspace-dialog-overlay" role="presentation">
      <section className="workspace-dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <header>
          <div><p className="eyebrow">Confirm change</p><h2 id="confirm-title">{confirmationTitle(confirm)}</h2></div>
          <button className="icon-button" type="button" aria-label="Cancel" onClick={() => setConfirm(null)}><X /></button>
        </header>
        <p>{confirmationCopy(confirm)}</p>
        <div className="workspace-actions"><button className="button" type="button" onClick={() => setConfirm(null)}>Cancel</button><button className="button danger" type="button" onClick={() => void confirmMutation()}>Confirm</button></div>
      </section>
    </div> : null}
  </div>;
}

function HistoryDetailsDialog({ state, onClose, onRetry, onRescan, onRestore }: {
  state: DetailsState;
  onClose: () => void;
  onRetry: () => void;
  onRescan: () => void;
  onRestore: () => void;
}) {
  const details = state.data;
  const diff = details?.latest.diff || [];
  return <div className="workspace-dialog-overlay" role="presentation" onMouseDown={(event) => {
    if (event.currentTarget === event.target) onClose();
  }}>
    <section className="workspace-dialog history-details-dialog" role="dialog" aria-modal="true" aria-labelledby="history-details-title">
      <header>
        <div><p className="eyebrow">Document #{state.documentId}</p><h2 id="history-details-title">{state.title}</h2></div>
        <button className="icon-button" type="button" aria-label="Close details" onClick={onClose}><X /></button>
      </header>
      {state.loading ? <div className="workspace-skeleton" aria-label="Loading document history">{Array.from({ length: 3 }, (_, index) => <span key={index} />)}</div>
        : state.error ? <WorkspaceLoadError title="Details are unavailable" message={state.error} onRetry={onRetry} />
          : details ? <>
            <section className="history-detail-section">
              <div className="workspace-card-head"><div><p className="eyebrow">Latest result</p><h3>Assigned metadata</h3></div><span className="status-pill">{details.latest.event_type || 'processed'}</span></div>
              <MetadataGrid metadata={details.metadata} />
            </section>

            <section className="history-detail-section">
              <div className="workspace-card-head"><div><p className="eyebrow">Change set</p><h3>Before and after</h3></div><FileClock /></div>
              {diff.length ? <ul className="history-diff-list">{diff.map((entry, index) => <li key={`${entry.field}-${index}`}>
                <strong>{humanize(entry.field)}</strong>
                <div className="history-diff-before"><span>Before</span><code>{formatValue(entry.before)}</code></div>
                <div className="history-diff-after"><span>After</span><code>{formatValue(entry.after)}</code></div>
                {entry.error ? <small className="error">{entry.error}</small> : null}
              </li>)}</ul> : <p className="workspace-muted">No field-level changes were recorded for this event.</p>}
            </section>

            <section className="history-detail-grid">
              <article className="history-detail-section">
                <p className="eyebrow">Token usage</p>
                <h3>{numericMetric(details.metrics, 'totalTokens', 'total_tokens').toLocaleString()} total</h3>
                <dl className="workspace-definition">
                  <div><dt>Prompt</dt><dd>{numericMetric(details.metrics, 'promptTokens', 'prompt_tokens').toLocaleString()}</dd></div>
                  <div><dt>Completion</dt><dd>{numericMetric(details.metrics, 'completionTokens', 'completion_tokens').toLocaleString()}</dd></div>
                </dl>
              </article>
              <article className="history-detail-section">
                <p className="eyebrow">Original state</p>
                <h3>First saved snapshot</h3>
                <MetadataGrid metadata={details.original} compact />
              </article>
            </section>

            <section className="history-detail-section">
              <p className="eyebrow">Event history</p>
              <h3>{details.events.length} recorded event{details.events.length === 1 ? '' : 's'}</h3>
              <ol className="history-event-list">{details.events.map((event, index) => <li key={event.id || `${event.created_at}-${index}`}>
                <span className="status-pill">{event.event_type || 'processed'}</span>
                <strong>{event.source || 'automatic'}</strong>
                <time>{event.created_at ? new Date(event.created_at).toLocaleString() : 'Time unavailable'}</time>
              </li>)}</ol>
            </section>
          </> : null}
      <footer className="workspace-actions history-details-actions">
        <button className="button" type="button" onClick={onClose}>Close</button>
        <button className="button" type="button" onClick={onRescan}><RefreshCcw /> Rescan</button>
        <button className="button danger" type="button" onClick={onRestore}><Undo2 /> Restore original</button>
      </footer>
    </section>
  </div>;
}

function MetadataGrid({ metadata, compact = false }: { metadata: Record<string, unknown>; compact?: boolean }) {
  const fields = [
    ['title', metadata.title],
    ['tags', metadata.tags],
    ['document type', metadata.document_type ?? metadata.documentType],
    ['correspondent', metadata.correspondent],
    ['language', metadata.language],
    ['date', metadata.created ?? metadata.document_date],
    ['custom fields', metadata.custom_fields ?? metadata.customFields]
  ].filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (!fields.length) return <p className="workspace-muted">No metadata snapshot is available for this older event.</p>;
  return <dl className={`history-metadata-grid${compact ? ' is-compact' : ''}`}>{fields.map(([label, value]) => <div key={String(label)}><dt>{humanize(String(label))}</dt><dd>{formatValue(value)}</dd></div>)}</dl>;
}

function confirmationTitle(confirm: ConfirmState) {
  if (confirm.kind === 'rescanAll') return 'Rescan every history document?';
  if (confirm.kind === 'cleanup') return `Remove ${confirm.count} orphaned record${confirm.count === 1 ? '' : 's'}?`;
  return `Restore document ${confirm.id}?`;
}

function confirmationCopy(confirm: ConfirmState) {
  if (confirm.kind === 'rescanAll') return 'Every processed document will be queued once. Existing history and original snapshots remain intact.';
  if (confirm.kind === 'cleanup') return 'Only local records whose Paperless-ngx documents no longer exist will be removed. Existing Paperless documents are not changed.';
  return 'Tagvico will replace title, tags, correspondent, document type, date, language, custom fields and owner with the first saved snapshot.';
}

function numericMetric(metrics: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(metrics[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatValue(value: unknown) {
  if (value === undefined || value === null || value === '') return 'Not set';
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === 'object' && 'name' in item) return String((item as { name: unknown }).name);
      if (item && typeof item === 'object' && 'field' in item && 'value' in item) {
        const fieldValue = (item as { field: unknown; value: unknown }).field;
        const itemValue = (item as { field: unknown; value: unknown }).value;
        return `${String(fieldValue)}: ${typeof itemValue === 'object' ? JSON.stringify(itemValue) : String(itemValue)}`;
      }
      if (item && typeof item === 'object' && 'value' in item) return String((item as { value: unknown }).value);
      return typeof item === 'string' || typeof item === 'number' ? String(item) : JSON.stringify(item);
    }).join(', ') || 'None';
  }
  if (typeof value === 'object') {
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }
  return String(value);
}
