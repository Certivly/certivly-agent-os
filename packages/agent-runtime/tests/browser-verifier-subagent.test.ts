import { describe, it, expect } from 'bun:test';
import { BrowserVerifierSubagent } from '../src/verification/BrowserVerifierSubagent';
import type { Model } from '@agent-os/providers';

describe('BrowserVerifierSubagent (Freebuff Browser Verification Pattern)', () => {
  const mockModel: Model = {
    id: 'mock-model',
    generate: async () => ({ text: 'The web application rendered with no console errors.' }),
    stream: async function* () {
      yield { type: 'text_delta', text: '' };
    },
  };

  it('1. validates safe URLs and rejects malicious schemes', () => {
    const verifier = new BrowserVerifierSubagent(mockModel);

    expect(verifier.validateUrl('http://localhost:3000')).toBe(true);
    expect(verifier.validateUrl('https://example.com/app')).toBe(true);
    expect(verifier.validateUrl('http://127.0.0.1:8080/dashboard')).toBe(true);

    // Rejections
    expect(verifier.validateUrl('javascript:alert(1)')).toBe(false);
    expect(verifier.validateUrl('file:///etc/hosts')).toBe(false);
    expect(verifier.validateUrl('ftp://example.com')).toBe(false);
  });

  it('2. rejects invalid URLs early with failed verification status', async () => {
    const verifier = new BrowserVerifierSubagent(mockModel);

    const result = await verifier.verify({
      targetUrl: 'javascript:void(0)',
      instructions: 'Check button click',
    });

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('Invalid target URL');
    expect(result.consoleErrors.length).toBeGreaterThan(0);
  });

  it('3. verifies web endpoint and produces step-by-step audit', async () => {
    // Start temporary local http server with Bun
    const server = Bun.serve({
      port: 0, // random available port
      fetch() {
        return new Response('<html><body><h1>AgentOS Dashboard</h1></body></html>', {
          headers: { 'Content-Type': 'text/html' },
        });
      },
    });

    const verifier = new BrowserVerifierSubagent(mockModel);

    try {
      const result = await verifier.verify({
        targetUrl: `http://localhost:${server.port}`,
        instructions: 'Verify dashboard heading renders',
      });

      expect(result.status).toBe('passed');
      expect(result.stepResults.length).toBeGreaterThanOrEqual(2);
      expect(result.stepResults[0].passed).toBe(true);
      expect(result.consoleErrors.length).toBe(0);
      expect(result.summary).toContain('web application rendered');
    } finally {
      server.stop();
    }
  });
});
