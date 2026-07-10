import axios, { type AxiosRequestConfig } from 'axios';
const config = require('../config/config');
const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const DEFAULT_TIMEOUT_MS = 5000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_REQUEST_BODY_BYTES = 256 * 1024;
const DNS_LOOKUP_TIMEOUT_MS = 3000;
const MAX_SELECTOR_LENGTH = 512;
const MAX_SELECTOR_SEGMENTS = 64;
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT']);
const FORBIDDEN_SELECTOR_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

interface DnsRecord {
  address: string;
  family: 4 | 6;
}
interface ExternalApiConfig {
  enabled?: string;
  url?: string;
  method?: string;
  selector?: string;
  transformationTemplate?: string;
  transform?: string;
  timeout?: string | number;
  headers?: unknown;
  body?: unknown;
}
interface LookupOptions { family?: number; all?: boolean }
type LookupCallback = (error: Error | null, address?: string | DnsRecord[], family?: number) => void;
type RequestFunction = (options: AxiosRequestConfig) => Promise<{ status?: number; data?: unknown }>;
type ResolveHostname = (hostname: string) => Promise<unknown>;
interface ExternalApiServiceOptions {
  request?: RequestFunction;
  resolveHostname?: ResolveHostname;
  dnsLookupTimeoutMs?: number;
}

function normalizeHostname(hostname: unknown): string {
  const normalized = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return normalized.endsWith('.') ? normalized.slice(0, -1) : normalized;
}

function isBlockedHostname(hostname: unknown): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === 'localhost.localdomain' ||
    normalized.endsWith('.localhost.localdomain');
}

function isBlockedIpv4(address: unknown): boolean {
  const octets = String(address).split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [first, second, third] = octets;
  return first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224;
}

function parseIpv6Groups(address: unknown): number[] | null {
  const normalized = normalizeHostname(address).split('%')[0];
  if (net.isIP(normalized) !== 6) return null;

  const parts = normalized.split('::');
  if (parts.length > 2) return null;

  let embeddedIpv4Seen = false;
  const parseSegments = (part: string): number[] | null => {
    if (!part) return [];
    const segments = part.split(':');
    const ipv4Index = segments.findIndex((segment) => segment.includes('.'));
    if (ipv4Index === -1) return segments.map((segment) => Number.parseInt(segment, 16));
    if (embeddedIpv4Seen || ipv4Index !== segments.length - 1 || net.isIP(segments[ipv4Index]) !== 4) return null;

    embeddedIpv4Seen = true;
    const octets = segments[ipv4Index].split('.').map((part) => Number(part));
    return [
      ...segments.slice(0, -1).map((segment) => Number.parseInt(segment, 16)),
      (octets[0] << 8) | octets[1],
      (octets[2] << 8) | octets[3]
    ];
  };

  const left = parseSegments(parts[0]);
  const right = parseSegments(parts[1]);
  if (!left || !right || [...left, ...right].some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)) {
    return null;
  }

  const compressed = parts.length === 2;
  const missing = 8 - left.length - right.length;
  if ((!compressed && missing !== 0) || (compressed && missing < 1)) return null;

  return compressed
    ? [...left, ...Array(missing).fill(0), ...right]
    : [...left, ...right];
}

function isBlockedIpv6(address: unknown): boolean {
  const groups = parseIpv6Groups(address);
  if (!groups) return true;

  const first = groups[0];
  const isIpv4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const isIpv4Translatable = groups.slice(0, 4).every((group) => group === 0) &&
    groups[4] === 0xffff && groups[5] === 0;
  const isIpv4Compatible = groups.slice(0, 6).every((group) => group === 0);
  if (isIpv4Mapped) {
    return isBlockedIpv4([
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff
    ].join('.'));
  }

  // IPv4-compatible IPv6 addresses are deprecated and can be interpreted
  // differently across network stacks. Reject the entire range rather than
  // relying on a translation layer to preserve the IPv4 checks above.
  if (isIpv4Compatible) return true;
  if (isIpv4Translatable) return true;

  const isUnspecified = groups.every((group) => group === 0);
  const isLoopback = groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
  const isNat64 = first === 0x0064 && groups[1] === 0xff9b;
  const isDiscardOnly = first === 0x0100 && groups.slice(1, 4).every((group) => group === 0);
  const isTeredo = first === 0x2001 && groups[1] === 0;
  const isBenchmarking = first === 0x2001 && groups[1] === 0x0002 && groups[2] === 0;
  const isOrchid = first === 0x2001 &&
    ((groups[1] & 0xfff0) === 0x0010 || (groups[1] & 0xfff0) === 0x0020);
  const isDocumentation = (first === 0x2001 && groups[1] === 0x0db8) ||
    (first & 0xfff0) === 0x3ff0;
  const isSixToFour = first === 0x2002;
  return isUnspecified ||
    isLoopback ||
    isNat64 ||
    isDiscardOnly ||
    isTeredo ||
    isBenchmarking ||
    isOrchid ||
    isDocumentation ||
    isSixToFour ||
    (first & 0xfe00) === 0xfc00 || // RFC 4193 unique-local addresses
    (first & 0xffc0) === 0xfe80 || // link-local addresses
    (first & 0xffc0) === 0xfec0 || // deprecated site-local addresses
    (first & 0xff00) === 0xff00; // multicast addresses
}

/**
 * Return true for any address that must never be contacted by enrichment.
 * Unknown/non-IP values are rejected too, so DNS records cannot bypass this
 * guard through malformed data.
 */
function isBlockedIpAddress(address: unknown): boolean {
  const normalized = normalizeHostname(address);
  const family = net.isIP(normalized);
  if (family === 4) return isBlockedIpv4(normalized);
  if (family === 6) return isBlockedIpv6(normalized);
  return true;
}

function normalizeTimeout(timeout: unknown): number {
  const parsed = Number.parseInt(String(timeout), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, parsed));
}

function normalizeMethod(method: unknown): string {
  const normalized = String(method || 'GET').trim().toUpperCase();
  if (!ALLOWED_METHODS.has(normalized)) {
    throw new Error('External API method must be GET, POST, or PUT');
  }
  return normalized;
}

function parseJsonSetting(value: unknown, label: string): unknown {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`External API ${label} must be valid JSON`);
  }
}

function sanitizeHeaders(headers: unknown): Record<string, string> {
  const parsed = parseJsonSetting(headers, 'headers');
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('External API headers must be a JSON object');
  }

  return Object.fromEntries(Object.entries(parsed).filter(([name, value]) => {
    const lowerName = name.toLowerCase();
    return (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') &&
      /^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name) &&
      !['host', 'content-length', 'transfer-encoding', 'connection'].includes(lowerName) &&
      !lowerName.startsWith('proxy-');
  }).map(([name, value]) => [name, String(value)]));
}

function isForbiddenSelectorSegment(segment: string): boolean {
  return FORBIDDEN_SELECTOR_SEGMENTS.has(String(segment).toLowerCase());
}

/**
 * Parse either a simple dotted field path (`invoice.vendor.name`) or an RFC
 * 6901 JSON pointer (`/invoice/vendor/name`). No expressions are accepted.
 */
function parseSelector(selector: unknown): string[] | null {
  if (typeof selector !== 'string' || !selector.trim()) return [];
  const trimmed = selector.trim();
  if (trimmed.length > MAX_SELECTOR_LENGTH) return null;

  if (trimmed.startsWith('/')) {
    const segments = trimmed.slice(1).split('/');
    if (segments.length > MAX_SELECTOR_SEGMENTS) return null;
    const decoded = [];
    for (const segment of segments) {
      if (/~(?:[^01]|$)/.test(segment)) return null;
      const value = segment.replace(/~1/g, '/').replace(/~0/g, '~');
      if (!value || isForbiddenSelectorSegment(value)) return null;
      decoded.push(value);
    }
    return decoded;
  }

  if (!/^[A-Za-z_][A-Za-z0-9_-]*(?:(?:\.[A-Za-z_][A-Za-z0-9_-]*)|(?:\[\d+\]))*$/.test(trimmed)) {
    return null;
  }

  const segments: string[] = [];
  let invalidIndex = false;
  trimmed.replace(/([A-Za-z_][A-Za-z0-9_-]*)|\[(\d+)\]/g, (_match: string, property: string | undefined, index: string | undefined) => {
    if (property) {
      segments.push(property);
    } else {
      const numericIndex = Number(index || '');
      if (!Number.isSafeInteger(numericIndex)) {
        invalidIndex = true;
      } else {
        segments.push(String(numericIndex));
      }
    }
    return '';
  });

  return invalidIndex || segments.length > MAX_SELECTOR_SEGMENTS || segments.some(isForbiddenSelectorSegment)
    ? null
    : segments;
}

function selectData(data: unknown, selector: unknown): { valid: boolean; value: unknown } {
  const segments = parseSelector(selector);
  if (segments === null) return { valid: false, value: data };

  let value = data;
  for (const segment of segments) {
    if (value === null || (typeof value !== 'object') || !Object.prototype.hasOwnProperty.call(value, segment)) {
      return { valid: true, value: undefined };
    }
    value = (value as Record<string, unknown>)[segment];
  }
  return { valid: true, value };
}

function normalizeDnsRecords(records: unknown): DnsRecord[] {
  const entries = Array.isArray(records) ? records : [records];
  return entries
    .map((entry) => {
      const record = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : null;
      const address = typeof entry === 'string' ? entry : record?.address;
      const family = typeof entry === 'string' ? net.isIP(entry) : (record?.family || net.isIP(String(address || '')));
      return { address: normalizeHostname(address), family };
    })
    .filter((entry): entry is DnsRecord => Boolean(entry.address) && (entry.family === 4 || entry.family === 6));
}

const defaultResolveHostname: ResolveHostname = (hostname: string) => dns.promises.lookup(hostname, { all: true, verbatim: true });

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Service for fetching data from an explicitly configured external API to
 * enrich AI prompts. The endpoint is still admin-configured, but it is treated
 * as untrusted input because it can otherwise become an SSRF primitive.
 */
class ExternalApiService {
  request: RequestFunction;
  resolveHostname: ResolveHostname;
  dnsLookupTimeoutMs: number;
  httpAgent: unknown;
  httpsAgent: unknown;

  constructor({
    request = axios,
    resolveHostname = defaultResolveHostname,
    dnsLookupTimeoutMs = DNS_LOOKUP_TIMEOUT_MS
  }: ExternalApiServiceOptions = {}) {
    this.request = request;
    this.resolveHostname = resolveHostname;
    this.dnsLookupTimeoutMs = Math.max(1, Number(dnsLookupTimeoutMs) || DNS_LOOKUP_TIMEOUT_MS);
    const lookup = this.safeLookup.bind(this);
    // Disable keep-alive so every connection resolves through safeLookup.
    this.httpAgent = new http.Agent({ keepAlive: false, lookup });
    this.httpsAgent = new https.Agent({ keepAlive: false, lookup });
  }

  async ensureSafeHostname(hostname: string): Promise<DnsRecord[]> {
    const normalized = normalizeHostname(hostname);
    if (!normalized || isBlockedHostname(normalized)) {
      throw new Error('External API URL targets a blocked hostname');
    }

    const family = net.isIP(normalized);
    if (family) {
      if (isBlockedIpAddress(normalized)) {
        throw new Error('External API URL targets a blocked IP address');
      }
      return [{ address: normalized, family }];
    }

    let records;
    try {
      records = normalizeDnsRecords(await withTimeout(
        Promise.resolve().then(() => this.resolveHostname(normalized)),
        this.dnsLookupTimeoutMs,
        'External API hostname lookup timed out'
      ));
    } catch {
      throw new Error('External API hostname could not be resolved');
    }

    if (!records.length || records.some((record) => isBlockedIpAddress(record.address))) {
      throw new Error('External API hostname resolves to a blocked IP address');
    }
    return records;
  }

  async validateUrl(rawUrl: unknown): Promise<URL> {
    let parsed;
    try {
      parsed = new URL(String(rawUrl || '').trim());
    } catch {
      throw new Error('External API URL is invalid');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('External API URL must use HTTP or HTTPS');
    }
    if (parsed.username || parsed.password) {
      throw new Error('External API URL must not include credentials');
    }

    await this.ensureSafeHostname(parsed.hostname);
    return parsed;
  }

  /**
   * Node invokes this resolver immediately before opening a socket. Rechecking
   * here pins each connection to a freshly validated address and prevents a
   * public-to-private DNS rebinding between URL validation and connection.
   */
  safeLookup(hostname: string, options: LookupOptions | number | LookupCallback, callback?: LookupCallback): void {
    const lookupOptions: LookupOptions = typeof options === 'object'
      ? options
      : { family: typeof options === 'number' ? options : 0 };
    const done = typeof options === 'function' ? options : callback;
    if (typeof done !== 'function') return;

    this.ensureSafeHostname(hostname)
      .then((records) => {
        const requestedFamily = lookupOptions.family || 0;
        const matches = requestedFamily ? records.filter((record) => record.family === requestedFamily) : records;
        if (!matches.length) throw new Error('External API hostname has no permitted address for this connection');
        if (lookupOptions.all) return done(null, matches);
        return done(null, matches[0].address, matches[0].family);
      })
      .catch((error: unknown) => done(error instanceof Error ? error : new Error(String(error))));
  }

  /**
   * Fetch data from the configured external API.
   * @returns {Promise<Object|string|null>} The data from the API or null when disabled/error
   */
  async fetchData(externalApiConfig: ExternalApiConfig = config.externalApiConfig) {
    try {
      if (!externalApiConfig || externalApiConfig.enabled !== 'yes') {
        console.log('[DEBUG] External API integration is disabled');
        return null;
      }

      const url = externalApiConfig.url;
      if (!url) {
        console.error('[ERROR] External API URL not configured');
        return null;
      }

      const parsedUrl = await this.validateUrl(url);
      const method = normalizeMethod(externalApiConfig.method);
      const selector = externalApiConfig.selector ??
        externalApiConfig.transformationTemplate ??
        externalApiConfig.transform ??
        '';
      const timeout = normalizeTimeout(externalApiConfig.timeout);
      const options: AxiosRequestConfig = {
        method,
        url: parsedUrl.toString(),
        headers: sanitizeHeaders(externalApiConfig.headers),
        timeout,
        // Axios' timeout is based on socket inactivity. This signal is a total
        // wall-clock deadline, so a slow-drip response cannot hold a scan open.
        signal: AbortSignal.timeout(timeout),
        maxRedirects: 0,
        maxContentLength: MAX_RESPONSE_BYTES,
        maxBodyLength: MAX_REQUEST_BODY_BYTES,
        httpAgent: this.httpAgent,
        httpsAgent: this.httpsAgent,
        proxy: false,
        validateStatus: (status) => status >= 200 && status < 300
      };

      if (method === 'POST' || method === 'PUT') {
        options.data = parseJsonSetting(externalApiConfig.body, 'body');
      }

      console.log(`[DEBUG] Fetching external API enrichment from ${parsedUrl.origin}`);
      const response = await this.request(options);
      if (typeof response?.status === 'number' && (response.status < 200 || response.status >= 300)) {
        console.warn(`[WARN] External API returned non-success status ${response.status}`);
        return null;
      }

      let data = response?.data;
      if (typeof selector === 'string' && selector.trim()) {
        const selected = selectData(data, selector);
        if (!selected.valid) {
          console.warn('[WARN] Rejecting external API data because its response selector is invalid');
          return null;
        }
        if (selected.value === undefined) {
          console.warn('[WARN] External API response selector did not match any data');
          return null;
        }
        data = selected.value;
        console.log('[DEBUG] Applied external API response selector');
      }

      return data;
    } catch (error) {
      console.error('[ERROR] Failed to fetch data from external API:', error instanceof Error ? error.message : String(error));
      if (axios.isAxiosError(error) && error.response) {
        console.error('[ERROR] API Response status:', error.response.status);
      }
      return null;
    }
  }
}

const externalApiService = new ExternalApiService();
module.exports = externalApiService;
module.exports.ExternalApiService = ExternalApiService;
module.exports.isBlockedIpAddress = isBlockedIpAddress;
module.exports.isBlockedHostname = isBlockedHostname;
module.exports.parseSelector = parseSelector;
module.exports.selectData = selectData;
module.exports.normalizeTimeout = normalizeTimeout;
module.exports.constants = {
  DEFAULT_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  MAX_REQUEST_BODY_BYTES,
  DNS_LOOKUP_TIMEOUT_MS,
  MAX_SELECTOR_LENGTH,
  MAX_SELECTOR_SEGMENTS
};
