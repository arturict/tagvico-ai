import 'server-only';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const MAX_KEYS = 10_000;
const failures = new Map<string, { count: number; startedAt: number }>();

function keyFor(username: unknown) {
  return String(username || '').trim().toLocaleLowerCase('en-US').slice(0, 100);
}

function prune(now: number) {
  if (failures.size < MAX_KEYS) return;
  for (const [key, state] of failures) if (now - state.startedAt >= WINDOW_MS) failures.delete(key);
  while (failures.size >= MAX_KEYS) failures.delete(failures.keys().next().value as string);
}

export function loginAllowed(username: unknown, now = Date.now()) {
  const state = failures.get(keyFor(username));
  if (!state || now - state.startedAt >= WINDOW_MS) return { allowed: true, retryAfterSeconds: 0 };
  return { allowed: state.count < MAX_FAILURES, retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - state.startedAt)) / 1000)) };
}

export function recordLoginFailure(username: unknown, now = Date.now()) {
  const key = keyFor(username);
  const current = failures.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    prune(now);
    failures.set(key, { count: 1, startedAt: now });
  } else current.count += 1;
}

export function clearLoginFailures(username: unknown) {
  failures.delete(keyFor(username));
}
