import documentModel from '../models/document';

const actionCenter = require('../models/actionCenter');

/**
 * Household profile management for the owner: add, rename, change role and
 * remove. Profiles are not web sign-ins; a profile that belongs to a web
 * account is kept in place so nobody is locked out of their own workspace.
 *
 * Removal deactivates the profile (history and approvals keep pointing at it),
 * drops its Paperless token, unassigns its open actions and removes it from the
 * Telegram and Discord allowlists.
 */

export type ManagedRole = 'adult' | 'member' | 'viewer';
const MANAGED_ROLES: readonly string[] = ['adult', 'member', 'viewer'];

export class HouseholdMemberError extends Error {
  constructor(message: string, readonly status = 400, readonly field?: string) {
    super(message);
  }
}

interface MemberRow {
  id: string;
  household_id: string;
  user_id: number | null;
  display_name: string;
  role: string;
  active: number;
}

function db() {
  return documentModel.getDatabase();
}

function cleanName(value: unknown): string {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!name) throw new HouseholdMemberError('Enter a name.', 400, 'displayName');
  if (name.length > 100) throw new HouseholdMemberError('Use at most 100 characters.', 400, 'displayName');
  return name;
}

function assertRole(value: unknown): ManagedRole {
  const role = String(value ?? '');
  if (!MANAGED_ROLES.includes(role)) {
    throw new HouseholdMemberError('Choose adult, member or viewer. There is one owner per household.', 400, 'role');
  }
  return role as ManagedRole;
}

function assertOwner(householdId: string, actorMemberId: string): void {
  const actor = db().prepare(
    'SELECT role FROM household_members WHERE id = ? AND household_id = ? AND active = 1'
  ).get(actorMemberId, householdId) as { role: string } | undefined;
  if (actor?.role !== 'owner') {
    throw new HouseholdMemberError('Only the household owner can manage profiles.', 403);
  }
}

function targetMember(householdId: string, memberId: string): MemberRow {
  const member = db().prepare(
    'SELECT id, household_id, user_id, display_name, role, active FROM household_members WHERE id = ? AND household_id = ? AND active = 1'
  ).get(memberId, householdId) as MemberRow | undefined;
  if (!member) throw new HouseholdMemberError('This profile no longer exists.', 404);
  return member;
}

function assertNameFree(householdId: string, name: string, exceptMemberId?: string): void {
  const taken = (db().prepare(
    'SELECT id FROM household_members WHERE household_id = ? AND active = 1 AND lower(display_name) = lower(?)'
  ).all(householdId, name) as Array<{ id: string }>).some((row) => row.id !== exceptMemberId);
  if (taken) throw new HouseholdMemberError('Someone in this household already has this name.', 409, 'displayName');
}

export interface ManagedMember {
  id: string;
  display_name: string;
  role: string;
  paperless_user_id: number | null;
  paperless_configured: boolean;
  /** True when the profile belongs to a Tagvico web account. */
  has_login: boolean;
}

export function listMembers(householdId: string): ManagedMember[] {
  const logins = new Set((db().prepare(
    'SELECT id FROM household_members WHERE household_id = ? AND active = 1 AND user_id IS NOT NULL'
  ).all(householdId) as Array<{ id: string }>).map((row) => row.id));
  return (actionCenter.listMembers(householdId) as Array<Record<string, unknown>>).map((member) => ({
    id: String(member.id),
    display_name: String(member.display_name),
    role: String(member.role),
    paperless_user_id: typeof member.paperless_user_id === 'number' ? member.paperless_user_id : null,
    paperless_configured: Boolean(member.paperless_configured),
    has_login: logins.has(String(member.id))
  }));
}

function publicMember(householdId: string, memberId: string) {
  return listMembers(householdId).find((member) => member.id === memberId);
}

export function addMember(householdId: string, actorMemberId: string, input: { displayName: unknown; role: unknown }) {
  assertOwner(householdId, actorMemberId);
  const name = cleanName(input.displayName);
  const role = assertRole(input.role ?? 'member');
  assertNameFree(householdId, name);
  const created = actionCenter.addHouseholdMember(householdId, name, role) as { id: string };
  return publicMember(householdId, created.id);
}

export function updateMember(
  householdId: string,
  actorMemberId: string,
  memberId: string,
  input: { displayName?: unknown; role?: unknown }
) {
  assertOwner(householdId, actorMemberId);
  const member = targetMember(householdId, memberId);
  const name = input.displayName === undefined ? member.display_name : cleanName(input.displayName);
  if (name.toLowerCase() !== member.display_name.toLowerCase()) assertNameFree(householdId, name, memberId);
  let role = member.role;
  if (input.role !== undefined && input.role !== member.role) {
    if (member.role === 'owner') {
      throw new HouseholdMemberError('The owner role cannot be changed.', 400, 'role');
    }
    role = assertRole(input.role);
  }
  db().prepare(
    'UPDATE household_members SET display_name = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND household_id = ?'
  ).run(name, role, memberId, householdId);
  return publicMember(householdId, memberId);
}

function assertRemovable(householdId: string, actorMemberId: string, memberId: string): MemberRow {
  assertOwner(householdId, actorMemberId);
  const member = targetMember(householdId, memberId);
  if (member.role === 'owner' || member.id === actorMemberId) {
    throw new HouseholdMemberError('The owner profile cannot be removed.', 400);
  }
  if (member.user_id !== null) {
    throw new HouseholdMemberError('This person has a Tagvico sign-in, so their profile stays. Remove their account first.', 400);
  }
  return member;
}

/** Returns the removed profile's name so callers can confirm it to the user. */
export function removeMember(householdId: string, actorMemberId: string, memberId: string): { id: string; displayName: string } {
  const member = assertRemovable(householdId, actorMemberId, memberId);
  const database = db();
  database.transaction(() => {
    database.prepare(
      'UPDATE household_members SET active = 0, paperless_token_encrypted = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND household_id = ?'
    ).run(memberId, householdId);
    database.prepare(
      `UPDATE action_cases SET assignee_member_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE household_id = ? AND assignee_member_id = ?`
    ).run(householdId, memberId);
  })();
  return { id: memberId, displayName: member.display_name };
}

/**
 * Removes a profile only after it is off the channel allowlists. The allowlist
 * is outside the database and can fail (for example when the environment locks
 * the users setting), so it goes first: a failure refuses the removal and
 * leaves the household untouched, instead of leaving a removed person who can
 * still message the bot. If the database step fails afterwards, the profile is
 * merely off the allowlists and the owner can retry.
 */
export async function removeMemberAndChannelAccess(
  householdId: string,
  actorMemberId: string,
  memberId: string,
  removeFromChannels: (memberId: string) => Promise<void>
): Promise<{ id: string; displayName: string }> {
  assertRemovable(householdId, actorMemberId, memberId);
  try {
    await removeFromChannels(memberId);
  } catch (error) {
    const reason = error instanceof Error && error.message ? ` (${error.message})` : '';
    throw new HouseholdMemberError(
      `The profile was not removed because its Telegram or Discord access could not be revoked${reason}. Fix the channel settings and try again.`,
      409
    );
  }
  return removeMember(householdId, actorMemberId, memberId);
}

const householdMembersService = {
  HouseholdMemberError,
  listMembers,
  addMember,
  updateMember,
  removeMember,
  removeMemberAndChannelAccess
};

export default householdMembersService;
module.exports = householdMembersService;
