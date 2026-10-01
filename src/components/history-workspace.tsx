'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCcw,
  Search,
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

export function HistoryWorkspace({ view = 'activity' }: { view?: 'activity' | 'documents' }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [filters, setFilters] = useState<FilterPayload>({ tags: [], correspondents: [] });
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [correspondent, setCorrespondent] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [archiveTotal, setArchiveTotal] = useState(0);
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
      setArchiveTotal(payload.recordsTotal || 0);
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
  const filtered = Boolean(search || tag || correspondent);

  return <div className="page-column act-page">
    <header className="page-header pg-header">
      <div className="page-header-text">
        <h1 className="page-title">{view === 'documents' ? 'Documents' : 'Activity'}</h1>
      </div>
      <div className="page-actions pg-actions">
        <button className="btn btn-ghost btn-32" type="button" onClick={() => void validateHistory()}>Validate history</button>
        {orphanCount ? <button className="btn btn-danger btn-32" type="button" onClick={() => setConfirm({ kind: 'cleanup', count: orphanCount })}>Clean up {orphanCount}</button> : null}
        {archiveTotal > 0 ? <button className="btn btn-secondary btn-32" type="button" onClick={() => setConfirm({ kind: 'rescanAll' })}>Rescan all</button> : null}
      </div>
    </header>

    {status ? <p className="pg-status" role="status">{status}</p> : null}

    <section className="act-filters" aria-label="History filters">
      <label className="act-search">
        <span className="sr-only">Search activity</span>
        <Search aria-hidden="true" />
        <input className="input input-32" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search titles, correspondents or tags" />
      </label>
      <label className="act-filter">
        <span className="sr-only">Tag</span>
        <select className="select select-32" value={tag} onChange={(event) => { setTag(event.target.value); setPage(0); }}><option value="">All tags</option>{filters.tags.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </label>
      <label className="act-filter">
        <span className="sr-only">Correspondent</span>
        <select className="select select-32" value={correspondent} onChange={(event) => { setCorrespondent(event.target.value); setPage(0); }}><option value="">All correspondents</option>{filters.correspondents.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      </label>
    </section>

    {selected.size ? <div className="act-selection" role="toolbar" aria-label="Selected documents">
      <span className="meta">{selected.size} selected</span>
      <button className="btn btn-secondary btn-28" type="button" onClick={() => void rescanSelected()}><RefreshCcw aria-hidden="true" /> Rescan selected</button>
      <button className="btn btn-ghost btn-28" type="button" onClick={() => setSelected(new Set())}>Clear selection</button>
    </div> : null}

    <section className="act-results" aria-label="History records">
      {loadState === 'error' ? <WorkspaceLoadError
        title="History is unavailable"
        message={loadError}
        mascot
        onRetry={() => void load()}
      /> : loadState === 'loading' && !rows.length ? <div className="pg-skeleton-rows" aria-label="Loading history">
        {Array.from({ length: 7 }, (_, index) => <div className="pg-skeleton-row" key={index}>
          <span className="pg-skeleton-stack"><span className="pg-skeleton-bar is-title" /><span className="pg-skeleton-bar is-meta" /></span>
          <span className="pg-skeleton-bar is-value" />
        </div>)}
      </div> : rows.length ? <ul className="list act-list">
        {rows.map((row) => <li className={`list-row is-interactive act-row${selected.has(row.document_id) ? ' is-selected' : ''}`} key={`${row.history_id}-${row.document_id}`}>
          <input className="act-check" aria-label={`Select document ${row.document_id}`} type="checkbox" checked={selected.has(row.document_id)} onChange={(event) => setSelected((current) => {
            const next = new Set(current);
            if (event.target.checked) next.add(row.document_id); else next.delete(row.document_id);
            return next;
          })} />
          <div className="list-row-main">
            <button className="list-row-title act-row-title" type="button" onClick={() => void openDetails(row)}>{row.title || `Document #${row.document_id}`}</button>
            <span className="list-row-meta">{[`#${row.document_id}`, row.correspondent, row.tags.map((item) => item.name).join(', ')].filter(Boolean).join(' · ')}</span>
          </div>
          <span className="list-row-trailing"><time dateTime={row.created_at}>{shortDateTime(row.created_at)}</time></span>
          <div className="list-row-actions act-row-actions">
            <a className="btn btn-ghost btn-28 btn-icon" href={row.link} target="_blank" rel="noreferrer" aria-label={`Open document ${row.document_id}`} title="Open in Paperless"><ExternalLink aria-hidden="true" /></a>
            <button className="btn btn-ghost btn-28 btn-icon" type="button" aria-label={`Rescan document ${row.document_id}`} title="Rescan" onClick={() => void mutate(`/api/history/${row.document_id}/rescan`, { method: 'POST' }, `Document ${row.document_id} was queued for a filter-bypassing rescan.`)}><RefreshCcw aria-hidden="true" /></button>
            <button className="btn btn-ghost btn-28 btn-icon" type="button" aria-label={`Restore document ${row.document_id}`} title="Restore original" onClick={() => setConfirm({ kind: 'restore', id: row.document_id })}><Undo2 aria-hidden="true" /></button>
          </div>
        </li>)}
      </ul> : loadState === 'ready' ? <div className="empty-state act-empty">
        <p>{filtered
          ? 'No records match these filters.'
          : view === 'documents'
            ? 'Documents appear here after their first review-first or manual analysis.'
            : 'No activity yet. Paperless stays unchanged until an analysis runs.'}</p>
        {!filtered ? <Link className="btn btn-secondary btn-32" href="/automation/manual">Analyze one document</Link> : null}
      </div> : null}
      {loadState === 'ready' && total > 0 ? <footer className="act-pagination">
        <span className="meta">{page * pageSize + (rows.length ? 1 : 0)}–{Math.min(total, (page + 1) * pageSize)} of {total}</span>
        <div className="act-pagination-buttons">
          <button className="btn btn-ghost btn-32 btn-icon" type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft aria-hidden="true" /></button>
          <button className="btn btn-ghost btn-32 btn-icon" type="button" aria-label="Next page" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}><ChevronRight aria-hidden="true" /></button>
        </div>
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

    {confirm ? <>
      <div className="dialog-backdrop" role="presentation" />
      <section className="dialog pg-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-copy">
        <h2 className="pg-dialog-title" id="confirm-title">{confirmationTitle(confirm)}</h2>
        <p className="pg-dialog-copy" id="confirm-copy">{confirmationCopy(confirm)}</p>
        <div className="pg-dialog-actions">
          <button className="btn btn-secondary btn-32" type="button" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="btn btn-danger btn-32" type="button" onClick={() => void confirmMutation()}>Confirm</button>
        </div>
      </section>
    </> : null}
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
  return <>
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose} />
    <section className="dialog is-wide pg-dialog act-details" role="dialog" aria-modal="true" aria-labelledby="history-details-title">
      <header className="pg-dialog-head">
        <div className="pg-dialog-head-text">
          <h2 className="pg-dialog-title" id="history-details-title">{state.title || `Document #${state.documentId}`}</h2>
          <p className="meta">#{state.documentId}{details ? ` · ${details.latest.event_type || 'processed'}` : ''}</p>
        </div>
        <button className="btn btn-ghost btn-32 btn-icon" type="button" aria-label="Close details" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      {state.loading ? <div className="pg-skeleton-rows" aria-label="Loading document history">{Array.from({ length: 3 }, (_, index) => <div className="pg-skeleton-row is-pair" key={index}>
        <span className="pg-skeleton-bar is-label" /><span className="pg-skeleton-bar is-value" />
      </div>)}</div>
        : state.error ? <WorkspaceLoadError title="Details are unavailable" message={state.error} onRetry={onRetry} />
          : details ? <div className="act-details-body">
            <section className="act-details-section">
              <h3 className="act-details-title">Assigned metadata</h3>
              <MetadataGrid metadata={details.metadata} />
            </section>

            <section className="act-details-section">
              <h3 className="act-details-title">Before and after</h3>
              {diff.length ? <ul className="list act-diff">{diff.map((entry, index) => <li className="act-diff-row" key={`${entry.field}-${index}`}>
                <span className="act-diff-field">{humanize(entry.field)}</span>
                <span className="act-diff-values">
                  <span><span className="act-diff-label">Before</span> <code>{formatValue(entry.before)}</code></span>
                  <span><span className="act-diff-label">After</span> <code>{formatValue(entry.after)}</code></span>
                  {entry.error ? <span className="is-danger-text">{entry.error}</span> : null}
                </span>
              </li>)}</ul> : <p className="pg-muted">No field-level changes were recorded for this event.</p>}
            </section>

            <section className="act-details-section">
              <h3 className="act-details-title">Token usage</h3>
              <dl className="pg-rows">
                <div className="pg-row"><dt>Total</dt><dd>{numericMetric(details.metrics, 'totalTokens', 'total_tokens').toLocaleString()}</dd></div>
                <div className="pg-row"><dt>Prompt</dt><dd>{numericMetric(details.metrics, 'promptTokens', 'prompt_tokens').toLocaleString()}</dd></div>
                <div className="pg-row"><dt>Completion</dt><dd>{numericMetric(details.metrics, 'completionTokens', 'completion_tokens').toLocaleString()}</dd></div>
              </dl>
            </section>

            <section className="act-details-section">
              <h3 className="act-details-title">Original state</h3>
              <MetadataGrid metadata={details.original} />
            </section>

            <section className="act-details-section">
              <h3 className="act-details-title">Events</h3>
              {details.events.length ? <ol className="list act-events">{details.events.map((event, index) => <li className="act-event" key={event.id || `${event.created_at}-${index}`}>
                <span>{humanize(event.event_type || 'processed')} · {event.source || 'automatic'}</span>
                <time className="meta" dateTime={event.created_at}>{event.created_at ? new Date(event.created_at).toLocaleString() : 'Time unavailable'}</time>
              </li>)}</ol> : <p className="pg-muted">No events were recorded.</p>}
            </section>
          </div> : null}
      <footer className="pg-dialog-actions">
        <button className="btn btn-ghost btn-32" type="button" onClick={onClose}>Close</button>
        <button className="btn btn-secondary btn-32" type="button" onClick={onRescan}>Rescan</button>
        <button className="btn btn-danger btn-32" type="button" onClick={onRestore}>Restore original</button>
      </footer>
    </section>
  </>;
}

function MetadataGrid({ metadata }: { metadata: Record<string, unknown> }) {
  const fields = [
    ['title', metadata.title],
    ['tags', metadata.tags],
    ['document type', metadata.document_type ?? metadata.documentType],
    ['correspondent', metadata.correspondent],
    ['language', metadata.language],
    ['date', metadata.created ?? metadata.document_date],
    ['custom fields', metadata.custom_fields ?? metadata.customFields]
  ].filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (!fields.length) return <p className="pg-muted">No metadata snapshot is available for this older event.</p>;
  return <dl className="pg-rows">{fields.map(([label, value]) => <div className="pg-row" key={String(label)}><dt>{humanize(String(label))}</dt><dd>{formatValue(value)}</dd></div>)}</dl>;
}

function shortDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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
