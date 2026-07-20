import * as actionCenter from '../models/actionCenter';
import * as sync from './actionSyncService';

export async function executeApproval(householdId: string, approvalId: string, memberId: string) {
  const approval = actionCenter.getApproval(householdId, approvalId);
  if (!approval || approval.status !== 'approved') throw new Error('Approval must be approved before execution');
  try {
    let result: unknown;
    switch (approval.action_type) {
      case 'action.create': {
        const created = actionCenter.createCase(householdId, memberId, { ...(approval.payload as actionCenter.ActionCaseInput), source: 'ai', status: 'open' });
        let synced: unknown;
        try { synced = await sync.pushCase(householdId, String(created?.id), memberId); }
        catch (error) { synced = { ok: false, error: error instanceof Error ? error.message : String(error) }; }
        result = { case: created, sync: synced };
        break;
      }
      case 'action.update': {
        const payload = approval.payload as { caseId: string; patch: Partial<actionCenter.ActionCaseInput> };
        const updated = actionCenter.updateCase(householdId, payload.caseId, memberId, payload.patch);
        let synced: unknown;
        try { synced = await sync.pushCase(householdId, payload.caseId, memberId); }
        catch (error) { synced = { ok: false, error: error instanceof Error ? error.message : String(error) }; }
        result = { case: updated, sync: synced };
        break;
      }
      case 'paperless.patch': {
        const payload = approval.payload as { documentId: number; patch: Record<string, unknown> };
        result = await sync.patchPaperlessDocument(householdId, memberId, payload.documentId, payload.patch);
        break;
      }
      default:
        throw new Error(`Unsupported approval action: ${approval.action_type}`);
    }
    return actionCenter.completeApproval(householdId, approvalId, 'executed', result);
  } catch (error) {
    actionCenter.completeApproval(householdId, approvalId, 'failed', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
