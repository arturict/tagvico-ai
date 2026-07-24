'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, FilePenLine, FileStack, Gauge, RefreshCw, ScanLine, ShieldAlert, Stamp, Tags, UsersRound, X } from 'lucide-react';
import { fetchJson } from '@/lib/client/fetch-json';
import { WorkspaceLoadError } from '@/components/workspace-load-error';

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
  const maxDistribution = useMemo(
    () => Math.max(1, ...(summary?.tokenDistribution || []).map((entry) => entry.count)),
    [summary]
  );

  return <div className="page operations-page">
    <header className="page-head operations-page-head">
      <div>
        <p className="eyebrow">Document processing</p>
        <h1>Automation</h1>
        <p className="lede">Processing health, Paperless coverage and model efficiency in one live workspace.</p>
      </div>
      <div className="workspace-actions">
        <Link className="button" href="/review"><Stamp aria-hidden="true" /> Review queue</Link>
        <Link className="button" href="/automation/manual"><FilePenLine aria-hidden="true" /> Manual</Link>
        <Link className="button" href="/automation/recovery"><ShieldAlert aria-hidden="true" /> Recovery</Link>
        <button className="button primary" type="button" onClick={scan} disabled={busy}>
          <ScanLine aria-hidden="true" /> {busy ? 'Starting…' : 'Scan now'}
        </button>
      </div>
    </header>

    {status ? <div className="workspace-notice" role="status">{status}</div> : null}
    {loadError && summary ? <div className="workspace-notice" role="alert">
      <span>{loadError}</span>
      <button className="button" type="button" disabled={loading} onClick={() => void load()}>
        {loading ? 'Retrying…' : 'Try again'}
      </button>
    </div> : null}

    {!summary && loadError ? <WorkspaceLoadError
      title="Document metrics are unavailable"
      message={loadError}
      retrying={loading}
      onRetry={() => void load()}
    /> : !summary ? <section className="workspace-skeleton" aria-label="Loading dashboard">
      {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
    </section> : <>
      <section className="metric-grid" aria-label="Document automation metrics">
        <Metric icon={<FileStack />} label="Processed" value={integer.format(summary.counts.processed)} detail={`${summary.counts.processedPct}% of ${integer.format(summary.counts.documents)} visible`} />
        <Metric icon={<Activity />} label="Processed today" value={integer.format(processing.processedToday ?? summary.today.total)} detail="Scheduled and manual scans" />
        <Metric icon={<Tags />} label="Paperless tags" value={integer.format(summary.counts.tags)} detail="Available for controlled filing" action={() => showCollection('/api/tagsCount', 'Tag activity')} />
        <Metric icon={<UsersRound />} label="Correspondents" value={integer.format(summary.counts.correspondents)} detail="Known filing destinations" action={() => showCollection('/api/correspondentsCount', 'Correspondent activity')} />
      </section>

      <section className="workspace-grid">
        <article className="workspace-card workspace-span-7">
          <div className="workspace-card-head">
            <div><p className="eyebrow">Coverage</p><h2>Processing progress</h2></div>
            <span className="workspace-value">{summary.counts.processedPct}%</span>
          </div>
          <div className="progress-track" aria-label={`${summary.counts.processedPct}% processed`}>
            <span style={{ width: `${Math.min(100, summary.counts.processedPct)}%` }} />
          </div>
          <div className="workspace-legend">
            <span><i className="is-accent" />{integer.format(summary.counts.processed)} processed</span>
            <span><i />{integer.format(summary.counts.remaining)} remaining</span>
          </div>
        </article>

        <article className="workspace-card workspace-span-5">
          <div className="workspace-card-head">
            <div><p className="eyebrow">Runner</p><h2>Live state</h2></div>
            <span className={`status-pill${processing.currentlyProcessing ? ' is-running' : ''}`}>
              {processing.currentlyProcessing ? 'Processing' : 'Idle'}
            </span>
          </div>
          <dl className="workspace-definition">
            <div><dt>Current document</dt><dd>{processing.currentlyProcessing?.title || 'No active document'}</dd></div>
            <div><dt>Last processed</dt><dd>{processing.lastProcessed?.title || 'No processed document yet'}</dd></div>
          </dl>
        </article>

        <article className="workspace-card workspace-span-4">
          <div className="workspace-card-head"><div><p className="eyebrow">Tokens</p><h2>Usage mix</h2></div></div>
          {summary.tokens.overall > 0 ? <>
            <div className="token-bar">
              <span style={{ width: `${summary.tokens.promptPct}%` }} />
              <span style={{ width: `${summary.tokens.completionPct}%` }} />
            </div>
            <div className="workspace-legend">
              <span><i className="is-muted" />Prompt {summary.tokens.promptPct}%</span>
              <span><i className="is-accent" />Completion {summary.tokens.completionPct}%</span>
            </div>
            <p className="workspace-muted">Average {integer.format(Math.round(summary.tokens.avgTotal))} tokens per document.</p>
          </> : <EmptyCompact text="Token metrics appear after the first analysed document." />}
        </article>

        <article className="workspace-card workspace-span-4">
          <div className="workspace-card-head"><div><p className="eyebrow">Distribution</p><h2>Tokens per analysis</h2></div></div>
          {summary.tokenDistribution.length ? <div className="bar-list">
            {summary.tokenDistribution.map((entry) => <div key={entry.range}>
              <span>{entry.range}</span><b><i style={{ width: `${(entry.count / maxDistribution) * 100}%` }} /></b><strong>{entry.count}</strong>
            </div>)}
          </div> : <EmptyCompact text="No distribution data yet." />}
        </article>

        <article className="workspace-card workspace-span-4">
          <div className="workspace-card-head"><div><p className="eyebrow">Filing</p><h2>Document types</h2></div></div>
          {summary.topDocumentTypes.length ? <div className="rank-list">
            {summary.topDocumentTypes.map((entry) => <div key={entry.type}><span>{entry.type}</span><strong>{entry.count}</strong></div>)}
          </div> : <EmptyCompact text="No document types recorded yet." />}
        </article>

        <article className="workspace-card workspace-span-8">
          <div className="workspace-card-head"><div><p className="eyebrow">Today</p><h2>Hourly throughput</h2></div><span className="workspace-value">{summary.today.total}</span></div>
          <div className="throughput-strip" aria-label={`${summary.today.total} documents processed today`}>
            {Array.from({ length: 24 }, (_, hour) => {
              const count = summary.today.byHour.find((entry) => Number(entry.hour) === hour)?.count || 0;
              const max = Math.max(1, ...summary.today.byHour.map((entry) => entry.count));
              return <span key={hour} title={`${String(hour).padStart(2, '0')}:00 · ${count}`}><i style={{ height: `${Math.max(5, (count / max) * 100)}%` }} /></span>;
            })}
          </div>
        </article>

        <article className="workspace-card workspace-span-4">
          <div className="workspace-card-head"><div><p className="eyebrow">Efficiency</p><h2>Cost proxy</h2></div><Gauge aria-hidden="true" /></div>
          {summary.cost.available ? <>
            <strong className="workspace-big-number">{usd.format(summary.cost.total || 0)}</strong>
            <p className="workspace-muted">{usd.format(summary.cost.perDocument || 0)} per document · {summary.cost.model}</p>
          </> : <EmptyCompact text="No billable model usage has been tracked." />}
        </article>
      </section>
    </>}

    {collection ? <div className="workspace-dialog-overlay" role="presentation" onMouseDown={() => setCollection(null)}>
      <section className="workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="collection-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p className="eyebrow">Paperless activity</p><h2 id="collection-title">{collection.title}</h2></div><button className="icon-button" type="button" aria-label="Close details" onClick={() => setCollection(null)}><X /></button></header>
        <div className="rank-list is-scrollable">
          {collection.items.length ? collection.items.map((item, index) => <div key={`${item.name}-${index}`}><span>{item.name || 'Unnamed'}</span><strong>{item.document_count || item.count || 0}</strong></div>) : <EmptyCompact text="Nothing recorded yet." />}
        </div>
      </section>
    </div> : null}
  </div>;
}

function Metric({ icon, label, value, detail, action }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  action?: () => void;
}) {
  return <article className="metric-card">
    <div className="metric-icon">{icon}</div>
    <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    {action ? <button type="button" onClick={action} aria-label={`Inspect ${label}`}><RefreshCw /></button> : null}
  </article>;
}

function EmptyCompact({ text }: { text: string }) {
  return <div className="empty-compact">{text}</div>;
}
