import { describe, it, expect } from 'bun:test';
import { extractPageContent, decodeHtmlEntities } from '../src/utils/html_extractor';

describe('HTML and Content Extractor', () => {
  it('decodes named and numeric HTML entities', () => {
    expect(decodeHtmlEntities('&amp; &lt; &gt; &quot; &#39;')).toBe("& < > \" '");
    expect(decodeHtmlEntities('&#x3C;div&#x3E;')).toBe('<div>');
    expect(decodeHtmlEntities('Hello&nbsp;World')).toBe('Hello World');
    expect(decodeHtmlEntities('&copy; 2026 &mdash; AgentOS')).toBe('© 2026 — AgentOS');
  });

  it('extracts title and description metadata', () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>Bun Documentation</title>
          <meta name="description" content="Fast all-in-one JavaScript runtime">
        </head>
        <body>
          <p>Bun is fast.</p>
        </body>
      </html>
    `;
    const res = extractPageContent(html, 'text/html');
    expect(res.title).toBe('Bun Documentation');
    expect(res.description).toBe('Fast all-in-one JavaScript runtime');
    expect(res.text).toContain('Bun is fast.');
  });

  it('prioritizes <article> or <main> sections over header, nav, and footer', () => {
    const html = `
      <html>
        <nav>Navigation Links Home About</nav>
        <header>Site Header Banner</header>
        <main>
          <article>
            <h1>Deep Research Architecture</h1>
            <p>Real-world agent harnesses employ iterative multi-round research protocols.</p>
          </article>
        </main>
        <footer>Copyright 2026 Footer Links</footer>
      </html>
    `;
    const res = extractPageContent(html, 'text/html');
    expect(res.text).toContain('Deep Research Architecture');
    expect(res.text).toContain('Real-world agent harnesses employ iterative multi-round research protocols.');
    expect(res.text).not.toContain('Navigation Links Home About');
    expect(res.text).not.toContain('Copyright 2026 Footer Links');
  });

  it('strips <script>, <style>, <svg>, <form>, and buttons', () => {
    const html = `
      <div>
        <style>.btn { color: red; }</style>
        <script>console.log("secret tracker");</script>
        <form><input type="text"><button>Submit</button></form>
        <p>Valuable content to retain.</p>
      </div>
    `;
    const res = extractPageContent(html, 'text/html');
    expect(res.text).toBe('Valuable content to retain.');
    expect(res.text).not.toContain('console.log');
    expect(res.text).not.toContain('.btn');
  });

  it('formats JSON and Markdown content types', () => {
    const jsonStr = JSON.stringify({ library: 'agent-os', features: ['sandboxing', 'research'] });
    const jsonRes = extractPageContent(jsonStr, 'application/json');
    expect(jsonRes.text).toContain('"library": "agent-os"');

    const mdStr = '# Overview\n\n- Point 1\n- Point 2';
    const mdRes = extractPageContent(mdStr, 'text/markdown');
    expect(mdRes.text).toContain('# Overview');
    expect(mdRes.text).toContain('- Point 1');
  });

  it('truncates content exceeding maxChars with explicit marker', () => {
    const longHtml = `<p>${'A'.repeat(500)}</p>`;
    const res = extractPageContent(longHtml, 'text/html', 100);
    expect(res.truncated).toBe(true);
    expect(res.text).toContain('[Content truncated - 100 character limit reached]');
    expect(res.text.startsWith('A'.repeat(100))).toBe(true);
  });
});
