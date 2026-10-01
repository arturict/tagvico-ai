import { revalidatePath } from 'next/cache';
import { assertSameOrigin, apiError, ApiError, readJsonBody, requireApiUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';

const { executeApproval } = require('../../../../../services/approvalExecutor') as typeof import('../../../../../services/approvalExecutor');

/**
 * Decides one pending approval. Only owners and adults may; the model repeats the role check.
 * 200 returns the approval row (rejected, or executed with its stored result).
 * An approved change that could not be applied answers 502 with `{ error, approval }`, where
 * `approval.status` is `failed` and `error` is the real reason; the chat card reads `error` only.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin(request);
    const user = await requireApiUser();
    const workspace = workspaceFor(user);
    if (!['owner', 'adult'].includes(workspace.role)) throw new ApiError(403, 'This household role cannot approve changes');
    const { id } = await params;
    const { decision } = await readJsonBody<Record<string, unknown>>(request);
    if (decision !== 'approved' && decision !== 'rejected') throw new ApiError(400, 'Decision must be approved or rejected');
    const approval = actionCenter.decideApproval(workspace.householdId, id, workspace.memberId, decision);
    let result: unknown = approval;
    if (decision === 'approved') {
      try {
        result = await executeApproval(workspace.householdId, id, workspace.memberId);
      } catch (error) {
        revalidatePath('/inbox');
        revalidatePath('/companion');
        return Response.json({
          error: error instanceof Error ? error.message : 'The change could not be applied',
          approval: actionCenter.getApproval(workspace.householdId, id)
        }, { status: 502 });
      }
    }
    revalidatePath('/actions');
    revalidatePath('/inbox');
    revalidatePath('/companion');
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
