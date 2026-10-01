import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, FileText, MessageCircle } from 'lucide-react';
import axios from 'axios';
import { requireUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import { getPaperlessPublicUrl } from '@/lib/server/household-navigation';
import * as actionSync from '@root/services/actionSyncService';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Document source' };

function plain(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not set';
  return String(value);
}

export default async function DocumentSourcePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const workspace = workspaceFor(user);
  const rawId = Number((await params).id);
  if (!Number.isSafeInteger(rawId) || rawId <= 0) notFound();

  let document: Record<string, unknown>;
  try {
    document = await actionSync.getPaperlessDocument(workspace.householdId, workspace.memberId, rawId);
  } catch (error) {
    // Paperless answers 404 for a missing document and 403 when the member's own account may not see it.
    if (axios.isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 403)) notFound();
    return <div className="page document-source-page">
      <section className="empty" role="alert">
        <h2>The document could not be loaded</h2>
        <p>Paperless did not answer. Check the connection in Settings and try again.</p>
        <div className="workspace-actions">
          <Link className="button" href="/documents"><ArrowLeft aria-hidden="true" /> All documents</Link>
          <Link className="button" href="/settings/paperless">Paperless settings</Link>
        </div>
      </section>
    </div>;
  }

  const title = String(document.title || `Document #${rawId}`);
  const content = String(document.content || '').trim();
  const tagIds = Array.isArray(document.tags) ? document.tags.map(Number).filter(Number.isSafeInteger) : [];
  // Names come from the tag list; if it cannot be read the ids are shown instead.
  const tagNames = new Map<number, string>();
  if (tagIds.length) {
    try {
      for (const tag of await actionSync.listPaperlessTags(workspace.householdId, workspace.memberId, '', 200)) tagNames.set(tag.id, tag.name);
    } catch {
      // Falls back to ids.
    }
  }
  const paperlessUrl = await getPaperlessPublicUrl();

  return <div className="page document-source-page">
    <header className="page-head">
      <div>
        <p className="eyebrow">Paperless source · Document #{rawId}</p>
        <h1>{title}</h1>
        <p className="lede">Read-only OCR and metadata from the Paperless account linked to this workspace.</p>
      </div>
      <div className="workspace-actions">
        <Link className="button" href="/documents"><ArrowLeft aria-hidden="true" /> Documents</Link>
        {paperlessUrl ? <a className="button" href={`${paperlessUrl}/documents/${rawId}/details`} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" /> Open in Paperless<span className="sr-only"> (new tab)</span></a> : null}
        <Link className="button primary" href="/companion?new=1"><MessageCircle aria-hidden="true" /> Chat</Link>
      </div>
    </header>

    <section className="document-source-layout">
      <article className="workspace-card document-source-content">
        <div className="workspace-card-head">
          <div><p className="eyebrow">Source text</p><h2>OCR preview</h2></div>
          <FileText aria-hidden="true" />
        </div>
        {content
          ? <pre>{content}</pre>
          : <div className="empty"><h2>No OCR text is available</h2><p>Verify the original in Paperless if this source is image-only.</p></div>}
      </article>

      <aside className="workspace-card document-source-metadata">
        <div className="workspace-card-head"><div><p className="eyebrow">Paperless metadata</p><h2>Source details</h2></div></div>
        <dl>
          <div><dt>Document ID</dt><dd>#{rawId}</dd></div>
          <div><dt>Created</dt><dd>{plain(document.created)}</dd></div>
          <div><dt>Modified</dt><dd>{plain(document.modified)}</dd></div>
          <div><dt>Correspondent ID</dt><dd>{plain(document.correspondent)}</dd></div>
          <div><dt>Document type ID</dt><dd>{plain(document.document_type)}</dd></div>
          <div><dt>Tags</dt><dd>{tagIds.length ? tagIds.map((id) => tagNames.get(id) || `#${id}`).join(', ') : 'None'}</dd></div>
        </dl>
        <p className="workspace-muted">This view is read-only. It does not expose credentials or provider payloads.</p>
      </aside>
    </section>
  </div>;
}
