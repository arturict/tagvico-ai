import axios from 'axios';
import { PAPERLESS_ACCEPT } from './paperlessApi';

/**
 * Small Paperless lookups used by Settings: does a token work, who does it
 * belong to, and which Paperless users exist. Addresses are the API address
 * Tagvico stores (ending in /api); tokens are never logged or returned.
 */

export interface PaperlessUser {
  id: number;
  username: string;
}

export type TokenCheck =
  | { ok: true; user: PaperlessUser | null }
  | { ok: false; reason: 'rejected' | 'unreachable'; message: string };

function apiBase(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  return /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`;
}

function headers(token: string) {
  return { Accept: PAPERLESS_ACCEPT, Authorization: `Token ${token}` };
}

export async function checkPaperlessToken(url: string, token: string): Promise<TokenCheck> {
  if (!url.trim()) {
    return { ok: false, reason: 'unreachable', message: 'Set the Paperless address under Settings, Paperless first.' };
  }
  try {
    const response = await axios.get(`${apiBase(url)}/documents/`, {
      params: { page_size: 1 },
      timeout: 8_000,
      headers: headers(token),
      validateStatus: () => true,
      maxRedirects: 0
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: 'rejected', message: 'Paperless did not accept this token. Copy it again from your Paperless profile.' };
    }
    if (response.status !== 200) {
      return { ok: false, reason: 'unreachable', message: `Paperless answered with status ${response.status}. Check the Paperless address.` };
    }
  } catch {
    return { ok: false, reason: 'unreachable', message: 'Could not reach Paperless to check this token. Check the Paperless address.' };
  }
  try {
    const settings = await axios.get<{ user?: { id?: number; username?: string } }>(`${apiBase(url)}/ui_settings/`, {
      timeout: 8_000,
      headers: headers(token)
    });
    const user = settings.data?.user;
    return {
      ok: true,
      user: typeof user?.id === 'number' ? { id: user.id, username: String(user.username || '') } : null
    };
  } catch {
    return { ok: true, user: null };
  }
}

/** Null when the list is not available to this token (not an error for the caller). */
export async function listPaperlessUsers(url: string, token: string): Promise<PaperlessUser[] | null> {
  if (!url.trim() || !token) return null;
  try {
    const response = await axios.get<{ results?: Array<{ id?: number; username?: string }> }>(`${apiBase(url)}/users/`, {
      params: { page_size: 200 },
      timeout: 8_000,
      headers: headers(token)
    });
    return (response.data?.results || [])
      .filter((user): user is { id: number; username: string } => typeof user.id === 'number' && typeof user.username === 'string')
      .map((user) => ({ id: user.id, username: user.username }));
  } catch {
    return null;
  }
}

const paperlessIdentityService = { checkPaperlessToken, listPaperlessUsers };
export default paperlessIdentityService;
module.exports = paperlessIdentityService;
