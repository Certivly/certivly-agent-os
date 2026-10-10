import { describe, it, expect } from 'bun:test';
import { isBlockedIPv4, isBlockedIPv6, isBlockedHostname, isBlockedIp, assertUrlAllowed, SsrfError } from '../src/utils/ssrf';

describe('SSRF Protection Matrix', () => {
  describe('IPv4 Address Blocking', () => {
    it('blocks loopback addresses (127.0.0.0/8)', () => {
      expect(isBlockedIPv4('127.0.0.1')).toBe(true);
      expect(isBlockedIPv4('127.255.255.254')).toBe(true);
    });

    it('blocks RFC1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)', () => {
      expect(isBlockedIPv4('10.0.0.1')).toBe(true);
      expect(isBlockedIPv4('10.254.1.1')).toBe(true);
      expect(isBlockedIPv4('172.16.0.1')).toBe(true);
      expect(isBlockedIPv4('172.31.255.255')).toBe(true);
      expect(isBlockedIPv4('192.168.1.1')).toBe(true);
      expect(isBlockedIPv4('192.168.0.254')).toBe(true);
    });

    it('blocks link-local / cloud metadata (169.254.0.0/16, 169.254.169.254)', () => {
      expect(isBlockedIPv4('169.254.169.254')).toBe(true);
      expect(isBlockedIPv4('169.254.1.1')).toBe(true);
    });

    it('blocks carrier-grade NAT and documentation ranges', () => {
      expect(isBlockedIPv4('100.64.0.1')).toBe(true);
      expect(isBlockedIPv4('192.0.2.1')).toBe(true);
      expect(isBlockedIPv4('198.51.100.1')).toBe(true);
      expect(isBlockedIPv4('203.0.113.1')).toBe(true);
    });

    it('allows valid public routable IPv4 addresses', () => {
      expect(isBlockedIPv4('8.8.8.8')).toBe(false);
      expect(isBlockedIPv4('1.1.1.1')).toBe(false);
      expect(isBlockedIPv4('142.250.190.46')).toBe(false);
      expect(isBlockedIPv4('104.244.42.1')).toBe(false);
    });
  });

  describe('IPv6 Address Blocking', () => {
    it('blocks loopback and unspecified addresses', () => {
      expect(isBlockedIPv6('::1')).toBe(true);
      expect(isBlockedIPv6('::')).toBe(true);
    });

    it('blocks unique local (fc00::/7) and link-local (fe80::/10)', () => {
      expect(isBlockedIPv6('fe80::1')).toBe(true);
      expect(isBlockedIPv6('fc00::1')).toBe(true);
      expect(isBlockedIPv6('fd12:3456:789a::1')).toBe(true);
    });

    it('blocks IPv4-mapped IPv6 loopback and private addresses', () => {
      expect(isBlockedIPv6('::ffff:127.0.0.1')).toBe(true);
      expect(isBlockedIPv6('::ffff:10.0.0.1')).toBe(true);
      expect(isBlockedIPv6('::ffff:192.168.1.1')).toBe(true);
      expect(isBlockedIPv6('::ffff:169.254.169.254')).toBe(true);
    });

    it('allows public global unicast IPv6 addresses', () => {
      expect(isBlockedIPv6('2606:4700:4700::1111')).toBe(false);
      expect(isBlockedIPv6('2001:4860:4860::8888')).toBe(false);
    });
  });

  describe('Hostname Blocking', () => {
    it('blocks localhost and internal domains', () => {
      expect(isBlockedHostname('localhost')).toBe(true);
      expect(isBlockedHostname('app.localhost')).toBe(true);
      expect(isBlockedHostname('dev.local')).toBe(true);
      expect(isBlockedHostname('svc.internal')).toBe(true);
      expect(isBlockedHostname('metadata.google.internal')).toBe(true);
    });

    it('allows public hostnames', () => {
      expect(isBlockedHostname('bun.sh')).toBe(false);
      expect(isBlockedHostname('github.com')).toBe(false);
      expect(isBlockedHostname('react.dev')).toBe(false);
    });
  });

  describe('assertUrlAllowed', () => {
    it('rejects unsupported protocols', async () => {
      await expect(assertUrlAllowed('ftp://example.com/file')).rejects.toThrow(SsrfError);
      await expect(assertUrlAllowed('file:///etc/passwd')).rejects.toThrow(SsrfError);
      await expect(assertUrlAllowed('javascript:alert(1)')).rejects.toThrow(SsrfError);
    });

    it('rejects URLs resolving to private IPs', async () => {
      const mockLookup = async () => ['10.0.0.5'];
      await expect(assertUrlAllowed('http://private-svc.org', { lookupFn: mockLookup })).rejects.toThrow(SsrfError);
    });

    it('allows URLs resolving to public IPs', async () => {
      const mockLookup = async () => ['93.184.216.34'];
      const parsed = await assertUrlAllowed('https://example.com/api', { lookupFn: mockLookup });
      expect(parsed.hostname).toBe('example.com');
      expect(parsed.protocol).toBe('https:');
    });
  });
});
