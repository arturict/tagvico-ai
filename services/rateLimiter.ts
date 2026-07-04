type Entry = { count: number; resetAt: number };

function createRateLimiter({ windowMs, max, keyPrefix = 'global' }: { windowMs: number; max: number; keyPrefix?: string }) {
  const entries = new Map<string, Entry>();
  return (req: any, res: any, next: () => void) => {
    const now = Date.now();
    const key = `${keyPrefix}:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
    const current = entries.get(key);
    const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    entry.count += 1;
    entries.set(key, entry);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    if (entries.size > 5000) {
      for (const [storedKey, stored] of entries) if (stored.resetAt <= now) entries.delete(storedKey);
    }
    if (entry.count > max) return res.status(429).json({ error: 'Too many requests' });
    next();
  };
}

export = { createRateLimiter };
