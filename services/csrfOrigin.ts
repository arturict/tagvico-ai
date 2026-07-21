type OriginCheck = {
  source?: string;
  host?: string;
  forwardedHost?: string;
  remoteAddress?: string;
};
import { isLoopbackAddress } from './proxyAddress';

function firstForwardedHost(value = '') {
  return value.split(',')[0]?.trim() || '';
}

export function allowsMutationOrigin({ source, host, forwardedHost, remoteAddress }: OriginCheck) {
  if (!source || !host) return false;
  try {
    const sourceHost = new URL(source).host;
    if (sourceHost === host) return true;
    return isLoopbackAddress(remoteAddress) && sourceHost === firstForwardedHost(forwardedHost);
  } catch {
    return false;
  }
}
