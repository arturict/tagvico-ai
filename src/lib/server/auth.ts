import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import jwt from '../../../services/jwtCompat';
import authSecret from '../../../services/authSecret';
import { getBackendConfigurationState } from './system';

export interface SessionUser { id: number; username: string }

function validUser(value: unknown): SessionUser | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { id?: unknown; username?: unknown };
  const id = Number(candidate.id);
  const username = String(candidate.username || '').trim();
  return Number.isSafeInteger(id) && id > 0 && username ? { id, username } : null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get('jwt')?.value;
  if (!token) return null;
  try { return validUser(jwt.verify(token, authSecret.getJwtSecret())); }
  catch { return null; }
}

export async function requireUser(): Promise<SessionUser> {
  if (await getBackendConfigurationState() === false) redirect('/setup');
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, 'Authentication required');
  return user;
}

export async function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const host = (await headers()).get('host');
  if (!host || new URL(origin).host !== host) throw new ApiError(403, 'Cross-origin request rejected');
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function assertCanMutateWorkspace(role: string) {
  if (role === 'viewer') throw new ApiError(403, 'This household role has read-only access');
}

export async function readJsonBody<T = Record<string, unknown>>(request: Request, maxBytes = 128 * 1024): Promise<T> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new ApiError(413, 'Request body is too large');
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new ApiError(413, 'Request body is too large');
  if (!text) throw new ApiError(400, 'A JSON request body is required');
  try { return JSON.parse(text) as T; }
  catch { throw new ApiError(400, 'Request body must contain valid JSON'); }
}

export function apiError(error: unknown) {
  const status = error instanceof ApiError ? error.status : 400;
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return Response.json({ error: message }, { status });
}
