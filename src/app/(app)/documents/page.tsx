import Link from 'next/link';
import { ExternalLink, Search } from 'lucide-react';
import { requireUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import { getPaperlessPublicUrl } from '@/lib/server/household-navigation';
import * as actionSync from '@root/services/actionSyncService';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Documents' };

type PaperlessDocument = { id: number; title: string; created: string };

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const integer = new Intl.NumberFormat('en-US');

// Paperless sends ISO timestamps; only the calendar day is shown, read in UTC so the server time zone cannot shift it.
function createdDay(value: string) {
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { iso: '', label: 'No date' };
  return { iso: day, label: dayFormat.format(new Date(`${day}T00:00:00Z`)) };
}

async function loadDocuments(householdId: string, memberId: string, query: string) {
  try {
    const rows = query
      ? await actionSync.searchPaperlessDocuments(householdId, memberId, query)
      : await actionSync.listRecentPaperlessDocuments(householdId, memberId, 20);
    const documents: PaperlessDocument[] = (rows as Array<Record<string, unknown>>)
      .map((row) => ({ id: Number(row.id), title: String(row.title || ''), created: String(row.created || '') }))
      .filter((row) => Number.isSafeInteger(row.id) && row.id > 0);
    const total = query ? documents.length : (await actionSync.countPaperlessDocuments(householdId, memberId).catch(() => ({ count: documents.length }))).count;
    return { documents, total, error: '' };
  } catch {
    return { documents: [] as PaperlessDocument[], total: 0, error: 'Paperless did not answer. Check the connection in Settings and try again.' };
  }
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const user = await requireUser();
  const workspace = workspaceFor(user);
  const rawQuery = (await searchParams).q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery || '').trim().slice(0, 200);
  const [{ documents, total, error }, paperlessUrl] = await Promise.all([
    loadDocuments(workspace.householdId, workspace.memberId, query),
    getPaperlessPublicUrl()
  ]);
  const summary = query
    ? `${documents.length} result${documents.length === 1 ? '' : 's'}`
    : total > documents.length ? `${documents.length} most recent of ${integer.format(total)}` : '';

  return <div className="page-column doc-page">
    <header className="page-header">
      <div className="page-header-text">
        <h1 className="page-title">Documents</h1>
      </div>
    </header>

    <form className="doc-search" role="search" aria-label="Search documents" action="/documents" method="get">
      <label className="doc-search-field">
        <span className="sr-only">Search documents</span>
        <Search aria-hidden="true" />
        <input className="input doc-search-input" type="search" name="q" defaultValue={query} maxLength={200} placeholder="Search titles and content" />
      </label>
      <button className="btn btn-secondary" type="submit">Search</button>
      {query ? <Link className="btn btn-ghost" href="/documents">Clear</Link> : null}
    </form>

    <section className="doc-results" aria-label="Documents">
      {error ? <div className="empty-state" role="alert">
        <h2 className="pg-empty-title">Documents are unavailable</h2>
        <p>{error}</p>
        <Link className="btn btn-secondary btn-32" href="/settings/paperless">Paperless settings</Link>
      </div> : documents.length ? <>
        {summary ? <p className="meta doc-summary">{summary}</p> : null}
        <ul className="list doc-list">
          {documents.map((document) => {
            const day = createdDay(document.created);
            return <li className="list-row is-interactive doc-row" key={document.id}>
              <div className="list-row-main">
                {/* The title link stretches over the whole row, so any click on the row opens the document. */}
                <Link className="list-row-title doc-row-link" href={`/documents/${document.id}`}>{document.title || `Document #${document.id}`}</Link>
                <span className="list-row-meta">#{document.id}</span>
              </div>
              <span className="list-row-trailing">{day.iso ? <time dateTime={day.iso}>{day.label}</time> : day.label}</span>
              {paperlessUrl ? <div className="list-row-actions doc-row-actions">
                <a className="btn btn-ghost btn-28 btn-icon" href={`${paperlessUrl}/documents/${document.id}/details`} target="_blank" rel="noopener noreferrer" aria-label={`Open document ${document.id} in Paperless (new tab)`} title="Open in Paperless"><ExternalLink aria-hidden="true" /></a>
              </div> : null}
            </li>;
          })}
        </ul>
      </> : <div className="empty-state">
        <p>{query ? `No documents match “${query}”.` : 'Documents appear here once Paperless has consumed them.'}</p>
      </div>}
    </section>
  </div>;
}
