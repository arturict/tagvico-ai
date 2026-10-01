'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

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
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
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

  const toggleDetails = (id: number) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <div className="page-column is-wide review-queue-page">
    <header className="page-header">
      <h1 className="page-title">Review queue</h1>
      <div className="page-actions">
        <Link className="btn btn-ghost btn-32" href="/automation/manual">Manual processing</Link>
        <button className="btn btn-secondary btn-32" type="button" disabled={batchBusy || Boolean(busy.size)} onClick={() => void load()}>Refresh</button>
        <button className="btn btn-primary btn-32" type="button" disabled={!canMutate || !selectedSuggestions.length || batchBusy || Boolean(busy.size)} onClick={() => void applySelected()}>Apply selected</button>
      </div>
    </header>

    <p className="meta" role="status">
      {status || (!canMutate
        ? 'Only owners and adults can apply or reject suggestions. You can still inspect them.'
        : reviewMode
          ? 'Review-first is active. Automatic writes wait here for approval.'
          : 'Automatic writes are active. Suggestions already in this queue still require a decision.')}
    </p>

    {suggestions.length ? <section aria-label="Awaiting review">
      <h2 className="list-group-heading">Awaiting review<span className="group-count">{suggestions.length}</span></h2>
      <ul className="list">
        {suggestions.map((suggestion) => {
          const proposal = suggestion.proposed_metadata || {};
          const tags = Array.isArray(proposal.tags) ? proposal.tags.map(String) : [];
          const other = Object.entries(proposal).filter(([key]) => !['title', 'tags'].includes(key));
          const proposedTitle = proposal.title ?? suggestion.title;
          const isBusy = busy.has(suggestion.id);
          const isOpen = expanded.has(suggestion.id);
          const detailsId = `review-details-${suggestion.id}`;
          return <li key={suggestion.id} className="review-item">
            <div className="list-row review-row">
              <input aria-label={`Select suggestion ${suggestion.id}`} type="checkbox" checked={selected.has(suggestion.id)} disabled={isBusy} onChange={(event) => setSelected((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(suggestion.id); else next.delete(suggestion.id);
                return next;
              })} />
              <div className="list-row-main">
                <p className="list-row-title">{proposedTitle ? formatValue(proposedTitle) : `Document #${suggestion.document_id}`}</p>
                <p className="list-row-meta meta-parts">
                  <span>Document #{suggestion.document_id}</span>
                  {tags.length ? <span>Tags {tags.join(', ')}</span> : null}
                  {other.length ? <span>{other.length} other {other.length === 1 ? 'change' : 'changes'}</span> : null}
                </p>
              </div>
              <div className="work-actions review-actions">
                <button type="button" className="btn btn-ghost btn-32" aria-expanded={isOpen} aria-controls={detailsId} onClick={() => toggleDetails(suggestion.id)}>
                  {isOpen ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}Details
                </button>
                <button className="btn btn-secondary btn-32" type="button" disabled={!canMutate || batchBusy || isBusy} aria-label={`Apply suggestion ${suggestion.id}`} onClick={() => void decide(suggestion, 'apply')}>Apply</button>
                <button className="btn btn-ghost btn-32" type="button" disabled={!canMutate || batchBusy || isBusy} aria-label={`Reject suggestion ${suggestion.id}`} onClick={() => void decide(suggestion, 'reject')}>Reject</button>
              </div>
            </div>
            {isOpen ? <dl id={detailsId} className="review-fields">
              <div><dt>Title</dt><dd>{formatValue(proposal.title ?? suggestion.title)}</dd></div>
              <div><dt>Tags</dt><dd>{tags.length ? tags.join(', ') : 'Unchanged'}</dd></div>
              {other.map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{formatValue(value)}</dd></div>)}
            </dl> : null}
          </li>;
        })}
      </ul>
    </section> : status ? null : <div className="empty-state"><p>Nothing to review right now.</p></div>}
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
