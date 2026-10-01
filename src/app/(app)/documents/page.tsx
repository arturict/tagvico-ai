import Link from 'next/link';
import { ExternalLink, History, MessageCircle, Search } from 'lucide-react';
import { requireUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import { getPaperlessPublicUrl } from '@/lib/server/household-navigation';
import * as actionSync from '@root/services/actionSyncService';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Documents' };

type PaperlessDocument = { id: number; title: string; created: string; modified: string };

function shortDay(value: string) {
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : 'Not set';
}

async function loadDocuments(householdId: string, memberId: string, query: string) {
  try {
    const rows = query
      ? await actionSync.searchPaperlessDocuments(householdId, memberId, query)
      : await actionSync.listRecentPaperlessDocuments(householdId, memberId, 20);
    const documents: PaperlessDocument[] = (rows as Array<Record<string, unknown>>)
      .map((row) => ({ id: Number(row.id), title: String(row.title || ''), created: String(row.created || ''), modified: String(row.modified || '') }))
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

  return <div className="page documents-page">
    <header className="page-head">
      <div>
        <p className="eyebrow">Paperless archive</p>
        <h1>Documents</h1>
        <p className="lede">{query
          ? `Best matches for “${query}” in your Paperless archive.`
          : `The most recent documents in your Paperless archive${total ? `, ${total} in total` : ''}.`}</p>
      </div>
      <div className="workspace-actions">
        <Link className="button" href="/activity"><History aria-hidden="true" /> Processing history</Link>
        <Link className="button primary" href="/companion?new=1"><MessageCircle aria-hidden="true" /> Chat</Link>
      </div>
    </header>

    <form className="workspace-card history-filters documents-search" role="search" action="/documents" method="get">
      <label className="workspace-search">
        <span className="sr-only">Search documents</span>
        <Search aria-hidden="true" />
        <input type="search" name="q" defaultValue={query} maxLength={200} placeholder="Search titles and content…" />
      </label>
      <button className="button" type="submit">Search</button>
      {query ? <Link className="button" href="/documents">Clear</Link> : null}
    </form>

    <section className="workspace-card history-card" aria-label="Documents">
      {error ? <div className="empty" role="alert">
        <h2>Documents are unavailable</h2>
        <p>{error}</p>
        <div className="workspace-actions"><Link className="button" href="/settings/paperless">Paperless settings</Link></div>
      </div> : documents.length ? <div className="workspace-table-wrap">
        <table className="workspace-table documents-table">
          <thead><tr><th>Document</th><th className="documents-col-date">Created</th><th className="documents-col-modified">Modified</th><th className="documents-col-actions"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{documents.map((document) => <tr key={document.id}>
            <td><strong><Link href={`/documents/${document.id}`}>{document.title || `Document #${document.id}`}</Link></strong><small>#{document.id}</small></td>
            <td className="documents-col-date">{shortDay(document.created)}</td>
            <td className="documents-col-modified">{shortDay(document.modified)}</td>
            <td className="documents-col-actions"><div className="table-actions">
              <Link className="button" href={`/documents/${document.id}`}>Open</Link>
              {paperlessUrl ? <a className="icon-button" href={`${paperlessUrl}/documents/${document.id}/details`} target="_blank" rel="noopener noreferrer" aria-label={`Open document ${document.id} in Paperless (new tab)`}><ExternalLink aria-hidden="true" /></a> : null}
            </div></td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="empty">
        <h2>{query ? 'No matching documents' : 'No documents yet'}</h2>
        <p>{query ? 'Try other words, or ask Chat to search across the archive.' : 'Documents appear here once Paperless has consumed them.'}</p>
      </div>}
    </section>
  </div>;
}
