'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCcw, RotateCcw, Search, Undo2, X } from 'lucide-react';
import { fetchJson, HttpRequestError } from '@/lib/client/fetch-json';
import { WorkspaceLoadError } from '@/components/workspace-load-error';

type Tag = { id: number; name: string; color?: string };
type HistoryRow = {
  document_id: number;
  title: string;
  created_at: string;
  tags: Tag[];
  correspondent: string;
  link: string;
};
type HistoryPayload = { recordsTotal: number; recordsFiltered: number; data: HistoryRow[] };
type FilterPayload = { tags: Tag[]; correspondents: string[] };
type DiffEntry = { field: string; before: unknown; after: unknown; error?: string };
type DiffState =
  | { state: 'loading' }
  | { state: 'ready'; entries: DiffEntry[] }
  | { state: 'error'; message: string };

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
  const [diffs, setDiffs] = useState<Record<number, DiffState>>({});
  const [confirm, setConfirm] = useState<{ kind: 'restore' | 'resetAll'; id?: number } | null>(null);
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

  const resetSelected = async () => {
    if (!selected.size) {
      setStatus('Select at least one document first.');
      return;
    }
    await mutate('/api/reset-documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selected] })
    }, `${selected.size} document${selected.size === 1 ? '' : 's'} queued for reprocessing.`);
  };

  const confirmMutation = async () => {
    if (!confirm) return;
    const current = confirm;
    setConfirm(null);
    if (current.kind === 'resetAll') {
      await mutate('/api/reset-all-documents', { method: 'POST' }, 'All history records were queued for reprocessing.');
      return;
    }
    await mutate(`/api/history/${current.id}/restore`, { method: 'POST' }, `Document ${current.id} was restored to its saved metadata.`);
  };

  const loadDiff = async (documentId: number, retry = false) => {
    if (!retry && documentId in diffs) return;
    setDiffs((current) => ({ ...current, [documentId]: { state: 'loading' } }));
    try {
      const payload = await fetchJson<{ diff?: DiffEntry[] }>(`/api/history/${documentId}/diff`);
      setDiffs((current) => ({
        ...current,
        [documentId]: { state: 'ready', entries: Array.isArray(payload.diff) ? payload.diff : [] }
      }));
    } catch (error) {
      if (error instanceof HttpRequestError && error.status === 404) {
        setDiffs((current) => ({ ...current, [documentId]: { state: 'ready', entries: [] } }));
        return;
      }
      setDiffs((current) => ({
        ...current,
        [documentId]: {
          state: 'error',
          message: error instanceof Error ? error.message : 'Diff unavailable.'
        }
      }));
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return <div className="page operations-page">
    <header className="page-head operations-page-head">
      <div><p className="eyebrow">Audit trail</p><h1>Activity</h1><p className="lede">See what Tagvico changed, restore saved metadata or queue documents for a cleaner run.</p></div>
      <div className="workspace-actions">
        <button className="button" type="button" onClick={resetSelected}><RefreshCcw /> Reset selected</button>
        <button className="button danger" type="button" onClick={() => setConfirm({ kind: 'resetAll' })}><RotateCcw /> Reset all</button>
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
          <thead><tr><th className="check-column"><span className="sr-only">Select</span></th><th>Document</th><th>Tags</th><th>Correspondent</th><th>Changes</th><th>Actions</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.document_id}>
            <td><input aria-label={`Select document ${row.document_id}`} type="checkbox" checked={selected.has(row.document_id)} onChange={(event) => setSelected((current) => {
              const next = new Set(current);
              if (event.target.checked) next.add(row.document_id); else next.delete(row.document_id);
              return next;
            })} /></td>
            <td><strong>{row.title}</strong><small>#{row.document_id} · {new Date(row.created_at).toLocaleString()}</small></td>
            <td><div className="tag-list">{row.tags.map((item) => <span key={item.id}>{item.name}</span>)}</div></td>
            <td>{row.correspondent}</td>
            <td><details onToggle={(event) => {
              const details = event.currentTarget;
              if (details.open) void loadDiff(row.document_id);
            }}><summary>View changes</summary><DiffList
              value={diffs[row.document_id]}
              onRetry={() => void loadDiff(row.document_id, true)}
            /></details></td>
            <td><div className="table-actions">
              <a className="icon-button" href={row.link} target="_blank" rel="noreferrer" aria-label={`Open document ${row.document_id}`}><ExternalLink /></a>
              <button className="icon-button" type="button" aria-label={`Rescan document ${row.document_id}`} onClick={() => void mutate(`/api/history/${row.document_id}/rescan`, { method: 'POST' }, `Document ${row.document_id} was queued for rescan.`)}><RefreshCcw /></button>
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

    {confirm ? <div className="workspace-dialog-overlay" role="presentation">
      <section className="workspace-dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <header><div><p className="eyebrow">Confirm change</p><h2 id="confirm-title">{confirm.kind === 'resetAll' ? 'Reset all history?' : `Restore document ${confirm.id}?`}</h2></div><button className="icon-button" type="button" aria-label="Cancel" onClick={() => setConfirm(null)}><X /></button></header>
        <p>{confirm.kind === 'resetAll' ? 'Every processed document will become eligible for another scan.' : 'Tagvico will replace current metadata with the first saved snapshot.'}</p>
        <div className="workspace-actions"><button className="button" type="button" onClick={() => setConfirm(null)}>Cancel</button><button className="button danger" type="button" onClick={() => void confirmMutation()}>Confirm</button></div>
      </section>
    </div> : null}
  </div>;
}

function DiffList({ value, onRetry }: { value: DiffState | undefined; onRetry: () => void }) {
  if (!value || value.state === 'loading') return <p className="workspace-muted">Loading…</p>;
  if (value.state === 'error') return <div role="alert">
    <p className="error">{value.message}</p>
    <button className="button" type="button" onClick={onRetry}>Try again</button>
  </div>;
  if (!value.entries.length) return <p className="workspace-muted">No recorded changes.</p>;
  return <ul className="diff-list">{value.entries.map((entry, index) => <li key={`${entry.field}-${index}`}><code>{entry.field}</code><span>{formatValue(entry.before)}</span><b>→</b><span>{formatValue(entry.after)}</span></li>)}</ul>;
}

function formatValue(value: unknown) {
  if (value === undefined) return '(unset)';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}
