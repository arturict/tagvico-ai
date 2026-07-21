type HeaderSource = { headers: { get(name: string): string | null } };

/** Convert the validated web session cookie into an internal bearer hop. */
export function backendBearerHeaders(request: HeaderSource): Record<string, string> {
  const cookie = request.headers.get('cookie') || '';
  for (const segment of cookie.split(';')) {
    const separator = segment.indexOf('=');
    if (separator < 0 || segment.slice(0, separator).trim() !== 'jwt') continue;
    const encoded = segment.slice(separator + 1).trim();
    if (!encoded) break;
    try { return { Authorization: `Bearer ${decodeURIComponent(encoded)}` }; }
    catch { return { Authorization: `Bearer ${encoded}` }; }
  }
  return {};
}
