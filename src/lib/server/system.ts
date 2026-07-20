import 'server-only';

interface BackendHealth {
  status?: unknown;
  configured?: unknown;
}

export async function getBackendConfigurationState(): Promise<boolean | null> {
  const backendUrl = process.env.TAGVICO_BACKEND_URL || 'http://127.0.0.1:3001';
  try {
    const response = await fetch(`${backendUrl}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2500)
    });
    if (!response.ok) return null;
    const health = await response.json() as BackendHealth;
    return health.status === 'healthy' && health.configured === true;
  } catch {
    return null;
  }
}
