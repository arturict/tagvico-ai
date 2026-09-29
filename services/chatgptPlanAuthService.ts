// Sign in with ChatGPT for open-source apps: an eligible Plus or Pro user
// authorises this Tagvico installation to spend their ChatGPT plan on
// Responses API requests. Implemented from OpenAI's public contract at
// https://developers.openai.com/siwc/token-sharing-open-source (checked
// 2026-09-29); no DevKit code is used because its licence is noncommercial.
//
// Tagvico runs as a server, usually in a container on another machine, so the
// documented 127.0.0.1 callback cannot reach it. The browser still completes
// OAuth locally (OpenAI's self-hosted guidance); the user pastes the address of
// the loopback page it lands on, and only this server, which holds the PKCE
// verifier, can exchange that one-time code.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveDataDirectory } from './dataDirectory';

const ISSUER = 'https://auth.openai.com';
const AUTHORIZE_ENDPOINT = `${ISSUER}/api/accounts/authorize`;
const TOKEN_ENDPOINT = `${ISSUER}/api/accounts/oauth/token`;
const REVOCATION_ENDPOINT = `${ISSUER}/api/accounts/oauth/revoke`;
const JWKS_URI = `${ISSUER}/.well-known/jwks.json`;
export const RESOURCE = 'https://api.openai.com/v1';
export const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const SCOPES = `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`;
const REDIRECT_URI = 'http://127.0.0.1:1455/auth/callback';
const DYNAMIC_CLIENT = 'dynamic_agent_client';
const AGENT_NAME = 'Tagvico';
const LOGIN_TTL_MS = 10 * 60 * 1000;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const LOCK_STALE_MS = 30_000;
const CLOCK_TOLERANCE_S = 5;

export class ChatGPTPlanError extends Error {
  constructor(readonly code: string, message: string, readonly status?: number) {
    super(message);
    this.name = 'ChatGPTPlanError';
  }
}

type StoredConnection = {
  version: 1;
  clientId: string;
  subject: string;
  email: string | null;
  name: string | null;
  idToken: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number;
  scopes: string[];
  savedAt: string;
};

type PendingLogin = {
  loginId: string;
  state: string;
  nonce: string;
  verifier: string;
  clientId: string | null;
  expiresAt: number;
};

export type ChatGPTPlanStatus = {
  authenticated: boolean;
  planUsage: boolean;
  account: { email: string | null; name: string | null } | null;
  expiresAt: string | null;
};

const base64url = (value: Buffer) => value.toString('base64url');
const randomValue = () => base64url(crypto.randomBytes(32));

function storageDirectory() {
  return path.join(resolveDataDirectory(), 'chatgpt');
}

function writePrivateFile(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, content, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * One stable, opaque host ID per installation, created before the first
 * sign-in. It identifies where Tagvico runs; it is not a credential.
 */
export function hostId(): string {
  const file = path.join(storageDirectory(), 'host.json');
  const saved = readJson(file) as { hostId?: unknown } | null;
  if (typeof saved?.hostId === 'string' && /^urn:uuid:[0-9a-f-]{36}$/.test(saved.hostId)) return saved.hostId;
  const created = `urn:uuid:${crypto.randomUUID()}`;
  writePrivateFile(file, `${JSON.stringify({ hostId: created }, null, 2)}\n`);
  return created;
}

function connectionFile() {
  return path.join(storageDirectory(), 'auth.json');
}

function readConnection(): StoredConnection | null {
  const value = readJson(connectionFile()) as Partial<StoredConnection> | null;
  if (!value || value.version !== 1 || typeof value.clientId !== 'string' || typeof value.subject !== 'string') return null;
  return {
    version: 1,
    clientId: value.clientId,
    subject: value.subject,
    email: typeof value.email === 'string' ? value.email : null,
    name: typeof value.name === 'string' ? value.name : null,
    idToken: typeof value.idToken === 'string' ? value.idToken : null,
    accessToken: typeof value.accessToken === 'string' ? value.accessToken : null,
    refreshToken: typeof value.refreshToken === 'string' ? value.refreshToken : null,
    expiresAt: Number(value.expiresAt) || 0,
    scopes: Array.isArray(value.scopes) ? value.scopes.map(String) : [],
    savedAt: String(value.savedAt || '')
  };
}

function saveConnection(connection: StoredConnection) {
  writePrivateFile(connectionFile(), `${JSON.stringify(connection, null, 2)}\n`);
}

// The backend and the Next.js process both read this connection, and OpenAI
// rotates the refresh token on every refresh. A lock file keeps two processes
// from spending the same refresh token.
async function withRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  const lock = path.join(storageDirectory(), 'refresh.lock');
  fs.mkdirSync(storageDirectory(), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + LOCK_STALE_MS;
  for (;;) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
      break;
    } catch {
      const age = Date.now() - (fs.statSync(lock, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
      if (age > LOCK_STALE_MS) fs.rmSync(lock, { force: true });
      else if (Date.now() > deadline) throw new ChatGPTPlanError('refresh_busy', 'Another Tagvico process is renewing the ChatGPT connection. Try again.');
      else await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  try {
    return await work();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

type Jwk = crypto.JsonWebKey & { kid?: string };
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;

async function signingKey(kid: string): Promise<crypto.KeyObject> {
  const find = () => jwksCache?.keys.find((key) => key.kid === kid);
  if (!find() || Date.now() - (jwksCache?.fetchedAt || 0) > 60 * 60 * 1000) {
    const response = await fetch(JWKS_URI, { signal: AbortSignal.timeout(15_000), cache: 'no-store' }).catch(() => null);
    const body = response?.ok ? await response.json().catch(() => null) as { keys?: unknown } | null : null;
    if (!Array.isArray(body?.keys)) {
      throw new ChatGPTPlanError('identity_verification_unavailable', 'ChatGPT identity verification is temporarily unavailable. Try again shortly.');
    }
    jwksCache = { keys: body.keys as Jwk[], fetchedAt: Date.now() };
  }
  const jwk = find();
  if (!jwk) throw new ChatGPTPlanError('invalid_id_token', 'The ChatGPT identity could not be verified. Sign in again.');
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

/** Verifies an OpenAI ID token (RS256) and returns its identity claims. */
export async function verifyIdToken(
  idToken: string,
  clientId: string,
  nonce: string | undefined,
  resolveKey: (kid: string) => Promise<crypto.KeyObject> = signingKey
) {
  const invalid = () => new ChatGPTPlanError('invalid_id_token', 'The ChatGPT identity could not be verified. Sign in again.');
  const parts = idToken.split('.');
  if (parts.length !== 3) throw invalid();
  let header: { alg?: unknown; kid?: unknown };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw invalid();
  const key = await resolveKey(header.kid);
  const signed = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    key,
    Buffer.from(parts[2], 'base64url')
  );
  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    !signed
    || claims.iss !== ISSUER
    || !audience.includes(clientId)
    || (audience.length > 1 && claims.azp !== clientId)
    || (claims.azp !== undefined && claims.azp !== clientId)
    || typeof claims.exp !== 'number' || claims.exp + CLOCK_TOLERANCE_S < now
    || typeof claims.iat !== 'number'
    || typeof claims.sub !== 'string' || !claims.sub
    || (nonce !== undefined && claims.nonce !== nonce)
  ) throw invalid();
  return {
    subject: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    name: typeof claims.name === 'string' ? claims.name : null
  };
}

async function tokenRequest(body: URLSearchParams): Promise<Record<string, unknown>> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store'
  });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !data) {
    const code = typeof data?.error === 'string' ? data.error : `http_${response.status}`;
    throw new ChatGPTPlanError(code, `ChatGPT sign-in failed (${code}).`, response.status);
  }
  return data;
}

function tokenFields(data: Record<string, unknown>, fallbackScopes: string[] = []) {
  const scopes = typeof data.scope === 'string' ? data.scope.split(/\s+/).filter(Boolean) : fallbackScopes;
  if (
    typeof data.access_token !== 'string' || !data.access_token
    || typeof data.refresh_token !== 'string' || !data.refresh_token
    || String(data.token_type || '').toLowerCase() !== 'bearer'
    || typeof data.expires_in !== 'number' || data.expires_in <= 0
  ) throw new ChatGPTPlanError('invalid_token_response', 'ChatGPT returned incomplete credentials. Sign in again.');
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scopes
  };
}

/**
 * Reads code and client ID from the address the browser was sent to. Accepts
 * the full loopback URL or just its query string.
 */
export function parseCallback(input: string, expectedState: string, savedClientId: string | null) {
  const trimmed = String(input || '').trim();
  let params: URLSearchParams;
  try {
    params = trimmed.startsWith('http') ? new URL(trimmed).searchParams : new URLSearchParams(trimmed.replace(/^[?#]/, ''));
  } catch {
    throw new ChatGPTPlanError('invalid_callback', 'Paste the full address from the browser tab ChatGPT sent you to.');
  }
  const state = params.get('state') || '';
  const expected = Buffer.from(expectedState);
  if (params.getAll('state').length !== 1 || state.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(state), expected)) {
    throw new ChatGPTPlanError('state_mismatch', 'This address belongs to a different sign-in attempt. Start again and paste the address from that tab.');
  }
  const error = params.get('error');
  if (error === 'access_denied') {
    throw new ChatGPTPlanError('access_denied', 'ChatGPT plan usage was not allowed. Start again and allow Tagvico to use your plan, or choose another provider.');
  }
  if (error) throw new ChatGPTPlanError(error, `ChatGPT sign-in failed (${error}).`);
  const code = params.get('code');
  const returnedClientId = params.get('client_id');
  const clientId = returnedClientId || savedClientId;
  if (
    !code || params.getAll('code').length !== 1 || params.getAll('client_id').length > 1
    || !clientId || clientId === DYNAMIC_CLIENT || !/^[A-Za-z0-9_-]{1,200}$/.test(clientId)
    || (savedClientId && returnedClientId && savedClientId !== returnedClientId)
  ) throw new ChatGPTPlanError('registration_incomplete', 'ChatGPT did not finish registering Tagvico. Start the sign-in again.');
  return { code, clientId };
}

class ChatGPTPlanAuthService {
  private pending = new Map<string, PendingLogin>();

  private prune() {
    const now = Date.now();
    for (const [id, login] of this.pending) if (login.expiresAt < now) this.pending.delete(id);
  }

  /** Starts a sign-in and returns the ChatGPT authorisation URL to open. */
  startLogin() {
    this.prune();
    const saved = readConnection();
    const login: PendingLogin = {
      loginId: crypto.randomUUID(),
      state: randomValue(),
      nonce: randomValue(),
      verifier: randomValue(),
      clientId: saved?.clientId || null,
      expiresAt: Date.now() + LOGIN_TTL_MS
    };
    const params: Record<string, string> = {
      client_id: login.clientId || DYNAMIC_CLIENT,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      resource: RESOURCE,
      state: login.state,
      nonce: login.nonce,
      code_challenge_method: 'S256',
      code_challenge: base64url(crypto.createHash('sha256').update(login.verifier).digest()),
      ext_agent_host_id: hostId()
    };
    // The name hint belongs only to the first registration; a returning sign-in
    // reuses the issued client and may pre-select the account by email. The ID
    // token hint is left out so that no token ever appears in a browser URL.
    if (!login.clientId) params.agent_name_hint = AGENT_NAME;
    else if (saved?.email) params.login_hint = saved.email;
    // Percent-encode each value as OpenAI documents (spaces as %20, not '+').
    const query = Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
    this.pending.set(login.loginId, login);
    return { loginId: login.loginId, authorizeUrl: `${AUTHORIZE_ENDPOINT}?${query}`, redirectUri: REDIRECT_URI, expiresAt: new Date(login.expiresAt).toISOString() };
  }

  cancelLogin(loginId: string) {
    return { success: this.pending.delete(loginId) };
  }

  /** Finishes a sign-in with the address the browser landed on. */
  async completeLogin(loginId: string, callback: string): Promise<ChatGPTPlanStatus> {
    this.prune();
    const login = this.pending.get(loginId);
    if (!login) throw new ChatGPTPlanError('login_expired', 'This sign-in expired. Start a new one.');
    const { code, clientId } = parseCallback(callback, login.state, login.clientId);
    this.pending.delete(loginId);
    const previous = readConnection();
    // Keep an issued registration even if the code exchange fails, so a retry
    // does not register a second Tagvico client on the same account.
    if (!previous || previous.clientId !== clientId) {
      saveConnection({
        version: 1, clientId, subject: '', email: null, name: null, idToken: null,
        accessToken: null, refreshToken: null, expiresAt: 0, scopes: [], savedAt: new Date().toISOString()
      });
    }
    const data = await tokenRequest(new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      code_verifier: login.verifier,
      redirect_uri: REDIRECT_URI,
      resource: RESOURCE
    }));
    if (typeof data.id_token !== 'string') throw new ChatGPTPlanError('invalid_id_token', 'ChatGPT did not return a verifiable identity. Sign in again.');
    const identity = await verifyIdToken(data.id_token, clientId, login.nonce);
    const fields = tokenFields(data);
    saveConnection({
      version: 1,
      clientId,
      ...identity,
      idToken: data.id_token,
      ...fields,
      savedAt: new Date().toISOString()
    });
    return this.status();
  }

  status(): ChatGPTPlanStatus {
    const connection = readConnection();
    const authenticated = Boolean(connection?.refreshToken && connection.subject);
    return {
      authenticated,
      planUsage: authenticated && Boolean(connection?.scopes.includes(PLAN_SCOPE)),
      account: authenticated && connection ? { email: connection.email, name: connection.name } : null,
      expiresAt: authenticated && connection ? new Date(connection.expiresAt).toISOString() : null
    };
  }

  private async refresh(connection: StoredConnection): Promise<StoredConnection> {
    return withRefreshLock(async () => {
      // Another process may have refreshed while this one waited for the lock.
      const current = readConnection();
      if (!current?.refreshToken || current.clientId !== connection.clientId) {
        throw new ChatGPTPlanError('not_signed_in', 'Sign in with ChatGPT in Settings first.');
      }
      if (current.accessToken && current.expiresAt - REFRESH_MARGIN_MS > Date.now() && current.accessToken !== connection.accessToken) {
        return current;
      }
      let data: Record<string, unknown>;
      try {
        data = await tokenRequest(new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: current.clientId,
          refresh_token: current.refreshToken,
          resource: RESOURCE
        }));
      } catch (error) {
        if (error instanceof ChatGPTPlanError && /invalid_grant|refresh_token|token_expired/.test(error.code)) {
          saveConnection({ ...current, accessToken: null, refreshToken: null, expiresAt: 0 });
          throw new ChatGPTPlanError('reauthorize', 'The ChatGPT connection expired or was disconnected. Sign in with ChatGPT again in Settings.');
        }
        throw error;
      }
      // Persist the rotated refresh token before anything else can fail: the
      // old one is already spent.
      const next: StoredConnection = { ...current, ...tokenFields(data, current.scopes), savedAt: new Date().toISOString() };
      saveConnection(next);
      if (typeof data.id_token === 'string') {
        const identity = await verifyIdToken(data.id_token, current.clientId, undefined);
        if (identity.subject !== current.subject) {
          saveConnection({ ...next, accessToken: null, refreshToken: null, expiresAt: 0 });
          throw new ChatGPTPlanError('account_mismatch', 'The renewed ChatGPT identity does not match. Sign in again.');
        }
        next.idToken = data.id_token;
        saveConnection(next);
      }
      return next;
    });
  }

  /** A valid access token for plan-backed requests, refreshed when due. */
  async accessToken(options: { forceRefresh?: boolean } = {}): Promise<string> {
    let connection = readConnection();
    if (!connection?.refreshToken) throw new ChatGPTPlanError('not_signed_in', 'Sign in with ChatGPT in Settings first.');
    if (!connection.scopes.includes(PLAN_SCOPE)) {
      throw new ChatGPTPlanError('plan_usage_disabled', 'ChatGPT plan usage is not allowed for Tagvico. Sign in again and allow it, or choose another provider.');
    }
    if (options.forceRefresh || !connection.accessToken || connection.expiresAt - REFRESH_MARGIN_MS <= Date.now()) {
      connection = await this.refresh(connection);
    }
    if (!connection.accessToken) throw new ChatGPTPlanError('not_signed_in', 'Sign in with ChatGPT in Settings first.');
    return connection.accessToken;
  }

  /** Revokes the renewable session and clears local tokens. */
  async logout() {
    const connection = readConnection();
    if (!connection) return { success: true, revoked: true };
    let revoked = !connection.refreshToken;
    if (connection.refreshToken) {
      for (let attempt = 0; attempt < 2 && !revoked; attempt += 1) {
        const response = await fetch(REVOCATION_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: connection.refreshToken, token_type_hint: 'refresh_token', client_id: connection.clientId }),
          signal: AbortSignal.timeout(10_000)
        }).catch(() => null);
        await response?.body?.cancel().catch(() => {});
        revoked = response?.status === 200;
        if (response && response.status < 500) break;
      }
    }
    // Keep the issued client ID so a later sign-in reuses this registration.
    saveConnection({ ...connection, idToken: null, accessToken: null, refreshToken: null, expiresAt: 0, scopes: [] });
    return { success: true, revoked };
  }
}

const chatgptPlanAuthService = new ChatGPTPlanAuthService();
export default chatgptPlanAuthService;
