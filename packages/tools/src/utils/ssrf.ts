import * as net from 'node:net';
import * as dns from 'node:dns';

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

/**
 * Checks whether an IPv4 address string falls within private, loopback, or non-routable CIDR blocks.
 */
export function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // malformed treated as blocked
  }

  const [b0, b1, b2, b3] = parts;

  // 0.0.0.0/8
  if (b0 === 0) return true;
  // 10.0.0.0/8 (RFC1918)
  if (b0 === 10) return true;
  // 100.64.0.0/10 (Carrier Grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;
  // 169.254.0.0/16 (Link-local, including 169.254.169.254 metadata)
  if (b0 === 169 && b1 === 254) return true;
  // 172.16.0.0/12 (RFC1918)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
  // 192.0.0.0/24 & 192.0.2.0/24
  if (b0 === 192 && b1 === 0 && (b2 === 0 || b2 === 2)) return true;
  // 192.168.0.0/16 (RFC1918)
  if (b0 === 192 && b1 === 168) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;
  // 198.51.100.0/24 (Documentation)
  if (b0 === 198 && b1 === 51 && b2 === 100) return true;
  // 203.0.113.0/24 (Documentation)
  if (b0 === 203 && b1 === 0 && b2 === 113) return true;
  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (b0 >= 224) return true;

  return false;
}

/**
 * Checks whether an IPv6 address string falls within private, loopback, or non-routable ranges.
 */
export function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // ::1 (loopback) or :: (unspecified)
  if (normalized === '::1' || normalized === '::') return true;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (normalized.startsWith('::ffff:')) {
    const embeddedIpv4 = normalized.slice('::ffff:'.length);
    if (net.isIPv4(embeddedIpv4)) {
      return isBlockedIPv4(embeddedIpv4);
    }
    return true;
  }

  // fe80::/10 (Link-local unicast)
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }

  // fc00::/7 (Unique local address - fc00:: to fdff::)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }

  // ff00::/8 (Multicast)
  if (normalized.startsWith('ff')) {
    return true;
  }

  // 2001:db8::/32 (Documentation)
  if (normalized.startsWith('2001:db8:') || normalized.startsWith('2001:0db8:')) {
    return true;
  }

  return false;
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return isBlockedIPv4(ip);
  }
  if (net.isIPv6(ip)) {
    return isBlockedIPv6(ip);
  }
  return true;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'instance-data',
  'metadata',
]);

export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (lower.endsWith('.localhost') || lower.endsWith('.local') || lower.endsWith('.internal')) {
    return true;
  }
  return false;
}

/**
 * Validates a URL and ensures it does not point to internal, private, loopback, or metadata services.
 */
export async function assertUrlAllowed(
  rawUrl: string,
  options?: {
    lookupFn?: (host: string) => Promise<string[]>;
  }
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (_e) {
    throw new SsrfError(`Invalid URL format: "${rawUrl}"`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfError(`Forbidden protocol: "${parsed.protocol}". Only http: and https: are supported.`);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  if (isBlockedHostname(hostname)) {
    throw new SsrfError(`SSRF blocked: Hostname "${hostname}" is restricted.`);
  }

  // If host is already an IP literal
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new SsrfError(`SSRF blocked: IP address "${hostname}" is a private or non-routable address.`);
    }
    return parsed;
  }

  // Resolve hostname via DNS
  const lookup = options?.lookupFn ?? (async (h: string) => {
    const results = await dns.promises.lookup(h, { all: true });
    return results.map(r => r.address);
  });

  let addresses: string[] = [];
  try {
    addresses = await lookup(hostname);
  } catch (err: any) {
    throw new SsrfError(`DNS lookup failed for "${hostname}": ${err.message}`);
  }

  if (addresses.length === 0) {
    throw new SsrfError(`DNS lookup returned no IP addresses for "${hostname}".`);
  }

  for (const address of addresses) {
    if (isBlockedIp(address)) {
      throw new SsrfError(`SSRF blocked: Hostname "${hostname}" resolved to blocked IP "${address}".`);
    }
  }

  return parsed;
}
