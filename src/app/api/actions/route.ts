import { revalidatePath } from 'next/cache';
import { assertCanMutateWorkspace, assertSameOrigin, apiError, readJsonBody, requireApiUser } from '@/lib/server/auth';
import { actionCenter, workspaceFor } from '@/lib/server/workspace';
import type { ActionCaseInput } from '../../../../models/actionCenter';
const sync = require('../../../../services/actionSyncService') as typeof import('../../../../services/actionSyncService');

export async function GET() { try { const user = await requireApiUser(); const workspace = workspaceFor(user); return Response.json({ cases: actionCenter.listCases(workspace.householdId), stats: actionCenter.dashboard(workspace.householdId) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { await assertSameOrigin(request); const user = await requireApiUser(); const workspace = workspaceFor(user); assertCanMutateWorkspace(workspace.role); const item = actionCenter.createCase(workspace.householdId, workspace.memberId, { ...(await readJsonBody<Record<string, unknown>>(request)), source: 'manual' } as ActionCaseInput); try { await sync.pushCase(workspace.householdId, String(item?.id), workspace.memberId); } catch { /* The durable case remains visible with its persisted sync error. */ } revalidatePath('/actions'); return Response.json(actionCenter.getCase(workspace.householdId, String(item?.id)), { status: 201 }); } catch (error) { return apiError(error); } }
