type ProxyAddressInput = { remoteAddress?: string; forwardedFor?: string };

export function isLoopbackAddress(address = '') {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/** Public Next-proxied setup is always remote and requires explicit opt-in. */
export function isLocalProxyRequest({ remoteAddress = '', forwardedFor }: ProxyAddressInput) {
  return isLoopbackAddress(remoteAddress) && forwardedFor === undefined;
}
