import 'server-only';
import documentModel from '@root/models/document';
import { actionCenter } from '../workspace';
import { toCompanionApprovalView, type CompanionApprovalView } from '../../../../contracts/companion';

/**
 * Every proposal a conversation produced, open or decided, oldest first. The
 * chat shows decided ones with their outcome, so a reload still tells what
 * happened after the member pressed Approve.
 */
export function listSessionApprovals(householdId: string, sessionId: string): CompanionApprovalView[] {
  const rows = documentModel.getDatabase().prepare(
    'SELECT id FROM agent_approvals WHERE household_id = ? AND session_id = ? ORDER BY created_at, rowid'
  ).all(householdId, sessionId) as Array<{ id: string }>;
  return rows.flatMap(({ id }) => {
    const approval = actionCenter.getApproval(householdId, id);
    return approval ? [toCompanionApprovalView({
      id: String(approval.id),
      action_type: String(approval.action_type),
      status: String(approval.status),
      session_id: approval.session_id ?? null,
      payload: approval.payload,
      result: approval.result,
      created_at: String(approval.created_at || '')
    })] : [];
  });
}
