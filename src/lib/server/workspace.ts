import 'server-only';
import type { SessionUser } from './auth';

const actionCenter = require('../../../models/actionCenter') as typeof import('../../../models/actionCenter');

export function workspaceFor(user: SessionUser) {
  const workspace = actionCenter.getWorkspaceForUser(user.id) || actionCenter.ensureWorkspaceForUser(user.id, user.username);
  return {
    householdId: String(workspace.id),
    memberId: String(workspace.member_id),
    name: String(workspace.name),
    kind: String(workspace.kind),
    role: String(workspace.member_role)
  };
}

export { actionCenter };
