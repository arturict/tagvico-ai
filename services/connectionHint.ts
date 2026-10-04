/**
 * Turns a low-level network error from a Paperless or model runtime request
 * into a sentence a person setting up Tagvico can act on. The raw code stays in
 * the message so the troubleshooting guide and a support report can still be
 * matched to it.
 *
 * Tagvico usually runs in a container, so the addresses that work in the
 * browser on the Docker host (localhost, 127.0.0.1) are the most common wrong
 * answer: inside the container they point at Tagvico itself.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isLoopback(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname) || hostname.startsWith('127.') || hostname.endsWith('.localhost');
}

/** Whether a configured URL points at the loopback interface, which inside a container is the container itself. */
export function isLoopbackUrl(url: string): boolean {
  return isLoopback(hostnameOf(url));
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'EPROTO'
]);

export function describePaperlessConnectionError(code: string, url: string): string {
  const hostname = hostnameOf(url);

  if (isLoopback(hostname)) {
    return `${hostname} points at the Tagvico container itself, not at the Docker host (${code}). ` +
      'Use the Paperless service name on a shared Docker network, or an address of the Docker host that containers can reach.';
  }

  switch (code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      if (hostname === 'host.docker.internal') {
        return `host.docker.internal is not defined in this container (${code}). ` +
          'On Linux add extra_hosts: ["host.docker.internal:host-gateway"] to the Tagvico service, or use a shared Docker network.';
      }
      return `The name ${hostname} does not resolve from the Tagvico container (${code}). ` +
        'A Compose service name only resolves when Tagvico is attached to the same Docker network as Paperless.';
    case 'ECONNREFUSED':
      return `Nothing accepted the connection at ${hostname} on that port (${code}). ` +
        'Check the port, and that Paperless is published on an address other than 127.0.0.1 if Tagvico reaches it through the host.';
    case 'ECONNABORTED':
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return `The connection to ${hostname} timed out or was unreachable (${code}). ` +
        'A firewall, a different network, or Paperless being published only on the host loopback address are the usual causes.';
    case 'ECONNRESET':
      return `The connection to ${hostname} was reset (${code}). Check whether the address needs https:// or goes through a proxy.`;
    default:
      if (TLS_CODES.has(code)) {
        return `The TLS certificate of ${hostname} was not accepted (${code}). ` +
          'Use a certificate trusted by the container, or the plain http:// address on a private Docker network.';
      }
      return code;
  }
}

const connectionHint = { describePaperlessConnectionError, isLoopbackUrl };
export default connectionHint;
module.exports = connectionHint;
