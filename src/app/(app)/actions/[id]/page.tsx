import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import { ActionDetail } from '@/components/action-detail';

export const dynamic = 'force-dynamic';
export default async function ActionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); const workspace = workspaceFor(user); const { id } = await params;
  const item = actionCenter.getCase(workspace.householdId, id) as Record<string, unknown> | null;
  if (!item) notFound();
  return <div className="page"><p className="eyebrow">Paperless #{String(item.paperlessDocumentId)}</p><h1>{String(item.title)}</h1><p className="lede">{String(item.summary || 'No summary yet.')}</p><ActionDetail item={JSON.parse(JSON.stringify(item))} readOnly={workspace.role === 'viewer'} /></div>;
}
