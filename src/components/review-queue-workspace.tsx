'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, FilePenLine, RefreshCcw, X } from 'lucide-react';

type Suggestion = {
  id: number;
  document_id: number;
  title?: string;
  proposed_metadata?: Record<string, unknown>;
  diff?: unknown[];
};
type QueuePayload = { suggestions: Suggestion[]; reviewMode: boolean; canMutate: boolean };

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.reason || payload.error || 'The request failed.');
    return payload as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export function ReviewQueueWorkspace() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [reviewMode, setReviewMode] = useState(true);
  const [canMutate, setCanMutate] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [status, setStatus] = useState('Loading AI suggestions…');

  const load = useCallback(async () => {
    setStatus('Loading AI suggestions…');
    try {
      const payload = await json<QueuePayload>('/api/review-queue');
      setSuggestions(payload.suggestions || []);
      setReviewMode(Boolean(payload.reviewMode));
      setCanMutate(Boolean(payload.canMutate));
      setSelected(new Set());
      setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The review queue is unavailable.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decide = async (suggestion: Suggestion, action: 'apply' | 'reject') => {
    if (!canMutate) return;
    setBusy((current) => new Set(current).add(suggestion.id));
    setStatus(action === 'apply' ? `Applying suggestion for document ${suggestion.document_id}…` : `Rejecting suggestion for document ${suggestion.document_id}…`);
    try {
      await json(`/api/review-queue/${suggestion.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
      setSelected((current) => {
        const next = new Set(current);
        next.delete(suggestion.id);
        return next;
      });
      setStatus(action === 'apply' ? `Document ${suggestion.document_id} was updated.` : `Suggestion ${suggestion.id} was rejected.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The decision failed.');
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(suggestion.id);
        return next;
      });
    }
  };

  const selectedSuggestions = useMemo(
    () => suggestions.filter((suggestion) => selected.has(suggestion.id)),
    [selected, suggestions]
  );

  const applySelected = async () => {
    if (!canMutate || batchBusy) return;
    setBatchBusy(true);
    try {
      for (const suggestion of selectedSuggestions) await decide(suggestion, 'apply');
    } finally {
      setBatchBusy(false);
    }
  };

  return <div className="page operations-page review-queue-page">
    <header className="page-head operations-page-head">
      <div>
        <p className="eyebrow">Human approval</p>
        <h1>Review queue</h1>
        <p className="lede">Inspect stored AI suggestions before any reviewed metadata reaches Paperless.</p>
      </div>
      <div className="workspace-actions">
        <Link className="button" href="/automation/manual"><FilePenLine aria-hidden="true" /> Manual processing</Link>
        <button className="button" type="button" disabled={batchBusy || Boolean(busy.size)} onClick={() => void load()}><RefreshCcw aria-hidden="true" /> Refresh</button>
        <button className="button primary" type="button" disabled={!canMutate || !selectedSuggestions.length || batchBusy || Boolean(busy.size)} onClick={() => void applySelected()}><Check aria-hidden="true" /> Apply selected</button>
      </div>
    </header>

    <div className="workspace-notice" role="status">
      {status || (!canMutate
        ? 'Your workspace role is read-only. You can inspect suggestions, but cannot apply or reject them.'
        : reviewMode
          ? 'Review-first is active. Automatic writes wait here for approval.'
          : 'Automatic writes are active. Suggestions already in this queue still require a decision.')}
    </div>

    <section className="workspace-card review-queue-card">
      <div className="workspace-card-head"><div><p className="eyebrow">Pending suggestions</p><h2>{suggestions.length} awaiting review</h2></div></div>
      {suggestions.length ? <div className="workspace-table-wrap"><table className="workspace-table">
        <thead><tr><th className="check-column"><span className="sr-only">Select</span></th><th>Document</th><th>Title</th><th>Tags</th><th>Other changes</th><th>Decision</th></tr></thead>
        <tbody>{suggestions.map((suggestion) => {
          const proposal = suggestion.proposed_metadata || {};
          const tags = Array.isArray(proposal.tags) ? proposal.tags.map(String) : [];
          const other = Object.entries(proposal).filter(([key]) => !['title', 'tags'].includes(key));
          const isBusy = busy.has(suggestion.id);
          return <tr key={suggestion.id}>
            <td><input aria-label={`Select suggestion ${suggestion.id}`} type="checkbox" checked={selected.has(suggestion.id)} disabled={isBusy} onChange={(event) => setSelected((current) => {
              const next = new Set(current);
              if (event.target.checked) next.add(suggestion.id); else next.delete(suggestion.id);
              return next;
            })} /></td>
            <td><strong>#{suggestion.document_id}</strong><small>Suggestion #{suggestion.id}</small></td>
            <td>{formatValue(proposal.title ?? suggestion.title)}</td>
            <td><div className="tag-list">{tags.length ? tags.map((tag) => <span key={tag}>{tag}</span>) : <span>Unchanged</span>}</div></td>
            <td><details><summary>{other.length} fields</summary><dl className="review-fields">{other.map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{formatValue(value)}</dd></div>)}</dl></details></td>
            <td><div className="table-actions">
              <button className="icon-button is-success" type="button" disabled={!canMutate || batchBusy || isBusy} aria-label={`Apply suggestion ${suggestion.id}`} onClick={() => void decide(suggestion, 'apply')}><Check /></button>
              <button className="icon-button is-danger" type="button" disabled={!canMutate || batchBusy || isBusy} aria-label={`Reject suggestion ${suggestion.id}`} onClick={() => void decide(suggestion, 'reject')}><X /></button>
            </div></td>
          </tr>;
        })}</tbody>
      </table></div> : status ? null : <div className="empty"><h2>Nothing to review</h2><p>New suggestions appear here when review-first automation processes a document.</p></div>}
    </section>
  </div>;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Unchanged';
  if (Array.isArray(value)) return value.map(String).join(', ') || 'None';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}
