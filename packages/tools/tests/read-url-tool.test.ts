import { describe, it, expect, afterEach } from 'bun:test';
import { readUrlTool, setReadUrlFetchOverride } from '../src/implementations/read_url';

const mockContext = { workspaceRoot: process.cwd() };

describe('read_url Tool (SSRF-Safe Web Reader)', () => {
  afterEach(() => {
    setReadUrlFetchOverride(undefined);
  });

  it('declares read_url tool specification', () => {
    expect(readUrlTool.spec.name).toBe('read_url');
    expect(readUrlTool.spec.readOnly).toBe(true);
    expect(readUrlTool.spec.parameters.required).toContain('url');
  });

  it('rejects empty or missing url argument', async () => {
    const res = await readUrlTool.execute({}, mockContext);
    expect(res.isError).toBe(true);
    expect(res.content).toContain('parameter is required');
  });

  it('blocks SSRF targets (localhost, 127.0.0.1, 169.254.169.254)', async () => {
    const localRes = await readUrlTool.execute({ url: 'http://localhost:8080/admin' }, mockContext);
    expect(localRes.isError).toBe(true);
    expect(localRes.content).toContain('rejected');

    const metaRes = await readUrlTool.execute({ url: 'http://169.254.169.254/latest/meta-data/' }, mockContext);
    expect(metaRes.isError).toBe(true);
    expect(metaRes.content).toContain('rejected');
  });

  it('successfully fetches and extracts readable page content via fetch override', async () => {
    const mockHtml = `
      <!doctype html>
      <html>
        <head>
          <title>Example Domain</title>
          <meta name="description" content="Official example domain for documentation">
        </head>
        <body>
          <main>
            <h1>Example Domain</h1>
            <p>This domain is established to be used for illustrative examples in documents.</p>
          </main>
        </body>
      </html>
    `;

    setReadUrlFetchOverride(async () => {
      return new Response(mockHtml, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=UTF-8',
          'Content-Length': String(Buffer.byteLength(mockHtml)),
        },
      });
    });

    const res = await readUrlTool.execute({ url: 'https://example.com' }, mockContext);
    expect(res.isError).toBe(false);
    expect(res.content).toContain('[Title]: Example Domain');
    expect(res.content).toContain('[Description]: Official example domain for documentation');
    expect(res.content).toContain('This domain is established to be used for illustrative examples');
  });

  it('follows safe redirects and rejects redirect hops to internal IPs', async () => {
    let hop = 0;
    setReadUrlFetchOverride(async () => {
      hop++;
      if (hop === 1) {
        return new Response(null, {
          status: 301,
          headers: {
            'Location': 'http://127.0.0.1/internal-secret',
          },
        });
      }
      return new Response('internal', { status: 200 });
    });

    const res = await readUrlTool.execute({ url: 'https://example.com/redirect-to-internal' }, mockContext);
    expect(res.isError).toBe(true);
    expect(res.content).toContain('rejected');
  });
});
