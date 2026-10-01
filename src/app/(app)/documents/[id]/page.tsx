import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import axios from 'axios';
import { requireUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import { getPaperlessPublicUrl } from '@/lib/server/household-navigation';
import * as actionSync from '@root/services/actionSyncService';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Document' };

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Shows the calendar day of a Paperless timestamp (read in UTC so the server time zone cannot shift it), or the raw value if it is not ISO.
function day(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not set';
  const text = String(value);
  const iso = text.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? dayFormat.format(new Date(`${iso}T00:00:00Z`)) : text;
}

// Correspondent and document type arrive as Paperless ids; the names are not loaded on this page.
function reference(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not set';
  return `#${String(value)}`;
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
    return <div className="page-column doc-detail">
      <section className="empty-state" role="alert">
        <h1 className="pg-empty-title">The document could not be loaded</h1>
        <p>Paperless did not answer. Check the connection in Settings and try again.</p>
        <div className="pg-empty-actions">
          <Link className="btn btn-secondary btn-32" href="/documents">All documents</Link>
          <Link className="btn btn-ghost btn-32" href="/settings/paperless">Paperless settings</Link>
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

  return <div className="page-column doc-detail">
    <Link className="btn btn-ghost btn-28 pg-back" href="/documents"><ArrowLeft aria-hidden="true" /> Documents</Link>
    <header className="page-header pg-header">
      <div className="page-header-text">
        <h1 className="page-title">{title}</h1>
      </div>
      {paperlessUrl ? <div className="page-actions">
        <a className="btn btn-secondary btn-32" href={`${paperlessUrl}/documents/${rawId}/details`} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" /> Open in Paperless<span className="sr-only"> (new tab)</span></a>
      </div> : null}
    </header>

    <dl className="pg-rows doc-meta">
      <div className="pg-row"><dt>ID</dt><dd>{rawId}</dd></div>
      <div className="pg-row"><dt>Created</dt><dd>{day(document.created)}</dd></div>
      <div className="pg-row"><dt>Modified</dt><dd>{day(document.modified)}</dd></div>
      <div className="pg-row"><dt>Correspondent</dt><dd>{reference(document.correspondent)}</dd></div>
      <div className="pg-row"><dt>Document type</dt><dd>{reference(document.document_type)}</dd></div>
      <div className="pg-row"><dt>Tags</dt><dd>{tagIds.length ? tagIds.map((id) => tagNames.get(id) || `#${id}`).join(', ') : 'None'}</dd></div>
    </dl>

    <section className="section doc-text" aria-labelledby="doc-text-title">
      <h2 className="section-title" id="doc-text-title">Text</h2>
      {content
        ? <pre className="pg-ocr">{content}</pre>
        : <p className="pg-muted">No OCR text is available. If the file is image-only, check the original in Paperless.</p>}
    </section>

    <p className="meta doc-note">This view is read-only.</p>
  </div>;
}
