'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { fetchJson } from '@/lib/client/fetch-json';
import { WorkspaceLoadError } from '@/components/workspace-load-error';
import { WorkspacePageSkeleton } from '@/components/workspace-page-skeleton';

type DashboardSummary = {
  counts: {
    documents: number;
    processed: number;
    remaining: number;
    processedPct: number;
    tags: number;
    correspondents: number;
  };
  tokens: {
    avgPrompt: number;
    avgCompletion: number;
    avgTotal: number;
    overall: number;
    promptPct: number;
    completionPct: number;
  };
  cost: {
    available?: boolean;
    total?: number;
    perDocument?: number;
    model?: string;
  };
  today: { total: number; byHour: Array<{ hour: string; count: number }> };
  topDocumentTypes: Array<{ type: string; count: number }>;
  tokenDistribution: Array<{ range: string; count: number }>;
};

type ProcessingStatus = {
  currentlyProcessing?: { title?: string; documentId?: number } | null;
  lastProcessed?: { title?: string } | null;
  processedToday?: number;
};

type DashboardPayload = {
  summary: DashboardSummary;
  processing: ProcessingStatus;
  version: string;
};

type CollectionItem = { name?: string; document_count?: number; count?: number };
type ScanResult = {
  visible: number;
  eligible: number;
  processed: number;
  stagedForReview: number;
  skipped: number;
  failed: number;
  stopped: boolean;
};

const integer = new Intl.NumberFormat('en-US');
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function AutomationDashboard() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [processing, setProcessing] = useState<ProcessingStatus>({});
  const [status, setStatus] = useState('Loading live document metrics…');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [collection, setCollection] = useState<{ title: string; items: CollectionItem[] } | null>(null);
  const processingPollInFlight = useRef(false);

  const load = useCallback(async (options: { preserveStatus?: boolean } = {}) => {
    setLoading(true);
    setLoadError('');
    try {
      const next = await fetchJson<DashboardPayload>('/api/dashboard');
      setPayload(next);
      setProcessing(next.processing || {});
      if (!options.preserveStatus) setStatus('');
    } catch (error) {
      setProcessing({});
      setLoadError(error instanceof Error ? error.message : 'Dashboard data is unavailable.');
      if (!options.preserveStatus) setStatus('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load();
    const timer = window.setInterval(() => {
      if (processingPollInFlight.current) return;
      processingPollInFlight.current = true;
      void fetchJson<ProcessingStatus>('/api/processing-status', { signal: controller.signal })
        .then((next) => {
          if (!controller.signal.aborted) setProcessing(next);
        })
        .catch(() => undefined)
        .finally(() => { processingPollInFlight.current = false; });
    }, 4000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
      processingPollInFlight.current = false;
    };
  }, [load]);

  const scan = async () => {
    setBusy(true);
    setStatus('Starting a document scan…');
    try {
      const result = await fetchJson<ScanResult>('/api/scan/now', { method: 'POST' });
      const completed = result.processed + result.stagedForReview;
      setStatus(result.eligible === 0
        ? `Scan complete: 0 eligible documents. No new document is waiting; trigger tags are optional. ${result.skipped} skipped.`
        : `Scan complete: ${completed} of ${result.eligible} eligible documents handled (${result.processed} applied, ${result.stagedForReview} staged); ${result.skipped} skipped; ${result.failed} failed${result.stopped ? ' · stopped early' : ''}.`);
      await load({ preserveStatus: true });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The scan could not be started.');
    } finally {
      setBusy(false);
    }
  };

  const showCollection = async (url: string, title: string) => {
    setStatus(`Loading ${title.toLowerCase()}…`);
    try {
      const items = await fetchJson<CollectionItem[]>(url);
      setCollection({ title, items });
      setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Details are unavailable.');
    }
  };

  const summary = payload?.summary;

  return <div className="page-column ov-page">
    <header className="page-header pg-header">
      <div className="page-header-text">
        <h1 className="page-title">Overview</h1>
      </div>
      <div className="page-actions pg-actions">
        <Link className="btn btn-ghost btn-32" href="/automation/manual">Manual</Link>
        <Link className="btn btn-ghost btn-32" href="/automation/recovery">Recovery</Link>
        <button className="btn btn-primary btn-32" type="button" onClick={scan} disabled={busy}>
          {busy ? 'Starting…' : 'Scan now'}
        </button>
      </div>
    </header>

    {status ? <p className="pg-status" role="status">{status}</p> : null}
    {loadError && summary ? <div className="pg-inline-error" role="alert">
      <span>{loadError}</span>
      <button className="btn btn-secondary btn-28" type="button" disabled={loading} onClick={() => void load()}>
        {loading ? 'Retrying…' : 'Try again'}
      </button>
    </div> : null}

    {!summary && loadError ? <WorkspaceLoadError
      title="Document metrics are unavailable"
      message={loadError}
      mascot
      retrying={loading}
      onRetry={() => void load()}
    /> : !summary ? <WorkspacePageSkeleton kind="dashboard" embedded /> : <div className="ov-sections">
      <section className="section" aria-labelledby="ov-documents">
        <h2 className="section-title" id="ov-documents">Documents</h2>
        <dl className="pg-rows">
          <div className="pg-row"><dt>Processed</dt><dd>{integer.format(summary.counts.processed)} of {integer.format(summary.counts.documents)} <span className="pg-secondary">({summary.counts.processedPct}%)</span></dd></div>
          <div className="pg-row"><dt>Tags</dt><dd>{integer.format(summary.counts.tags)}</dd>
            <button className="btn btn-ghost btn-28 pg-row-action" type="button" aria-label="Inspect Paperless tags" onClick={() => void showCollection('/api/tagsCount', 'Tags')}>View</button>
          </div>
          <div className="pg-row"><dt>Correspondents</dt><dd>{integer.format(summary.counts.correspondents)}</dd>
            <button className="btn btn-ghost btn-28 pg-row-action" type="button" aria-label="Inspect correspondents" onClick={() => void showCollection('/api/correspondentsCount', 'Correspondents')}>View</button>
          </div>
        </dl>
      </section>

      <section className="section" aria-labelledby="ov-today">
        <h2 className="section-title" id="ov-today">Today</h2>
        <dl className="pg-rows">
          <div className="pg-row"><dt>Status</dt><dd>{processing.currentlyProcessing ? 'Processing' : 'Idle'}</dd></div>
          <div className="pg-row"><dt>Processed today</dt><dd>{integer.format(processing.processedToday ?? summary.today.total)}</dd></div>
          <div className="pg-row"><dt>Current document</dt><dd>{processing.currentlyProcessing?.title || 'None'}</dd></div>
          <div className="pg-row"><dt>Last processed</dt><dd>{processing.lastProcessed?.title || 'None yet'}</dd></div>
        </dl>
      </section>

      <section className="section" aria-labelledby="ov-tokens">
        <h2 className="section-title" id="ov-tokens">Tokens</h2>
        {summary.tokens.overall > 0 ? <dl className="pg-rows">
          <div className="pg-row"><dt>Total</dt><dd>{integer.format(summary.tokens.overall)}</dd></div>
          <div className="pg-row"><dt>Average per document</dt><dd>{integer.format(Math.round(summary.tokens.avgTotal))}</dd></div>
          <div className="pg-row"><dt>Prompt and completion</dt><dd>{summary.tokens.promptPct}% and {summary.tokens.completionPct}%</dd></div>
        </dl> : <p className="pg-muted">Token counts appear after the first analysed document.</p>}
      </section>

      <section className="section" aria-labelledby="ov-cost">
        <h2 className="section-title" id="ov-cost">Cost</h2>
        {summary.cost.available ? <dl className="pg-rows">
          <div className="pg-row"><dt>Estimated total</dt><dd>{usd.format(summary.cost.total || 0)}</dd></div>
          <div className="pg-row"><dt>Per document</dt><dd>{usd.format(summary.cost.perDocument || 0)}</dd></div>
          {summary.cost.model ? <div className="pg-row"><dt>Model</dt><dd>{summary.cost.model}</dd></div> : null}
        </dl> : <p className="pg-muted">No billable model usage has been tracked.</p>}
      </section>

      {summary.topDocumentTypes.length ? <section className="section" aria-labelledby="ov-types">
        <h2 className="section-title" id="ov-types">Document types</h2>
        <dl className="pg-rows">
          {summary.topDocumentTypes.map((entry) => <div className="pg-row" key={entry.type}><dt>{entry.type}</dt><dd>{integer.format(entry.count)}</dd></div>)}
        </dl>
      </section> : null}
    </div>}

    {collection ? <>
      <div className="dialog-backdrop" role="presentation" onMouseDown={() => setCollection(null)} />
      <section className="dialog pg-dialog" role="dialog" aria-modal="true" aria-labelledby="collection-title">
        <header className="pg-dialog-head">
          <h2 className="pg-dialog-title" id="collection-title">{collection.title}</h2>
          <button className="btn btn-ghost btn-32 btn-icon" type="button" aria-label="Close details" onClick={() => setCollection(null)}><X aria-hidden="true" /></button>
        </header>
        {collection.items.length ? <dl className="pg-rows">
          {collection.items.map((item, index) => <div className="pg-row" key={`${item.name}-${index}`}><dt>{item.name || 'Unnamed'}</dt><dd>{integer.format(item.document_count || item.count || 0)}</dd></div>)}
        </dl> : <p className="pg-muted">Nothing recorded yet.</p>}
      </section>
    </> : null}
  </div>;
}
