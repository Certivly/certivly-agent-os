import { describe, it, expect, afterEach } from 'bun:test';
import { webSearchTool, setWebSearchOverride, readDocsTool } from '../src';

const mockContext = { workspaceRoot: process.cwd() };

describe('web_search & read_docs Tools (Multi-Source Research)', () => {
  afterEach(() => {
    setWebSearchOverride(undefined);
  });

  describe('web_search', () => {
    it('declares valid ToolSpec schema', () => {
      expect(webSearchTool.spec.name).toBe('web_search');
      expect(webSearchTool.spec.readOnly).toBe(true);
      expect(webSearchTool.spec.parameters.required).toContain('query');
    });

    it('rejects empty query parameter', async () => {
      const res = await webSearchTool.execute({}, mockContext);
      expect(res.isError).toBe(true);
      expect(res.content).toContain('parameter is required');
    });

    it('executes search using search override provider and returns structured markdown', async () => {
      setWebSearchOverride(async () => {
        return [
          {
            title: 'Bun 1.1 Release Notes',
            url: 'https://bun.sh/blog/bun-v1.1',
            snippet: 'Windows support is now generally available with native CLI parity.',
            source: 'Google (Serper)',
          },
          {
            title: 'Bun Shell Documentation',
            url: 'https://bun.sh/docs/runtime/shell',
            snippet: 'Cross-platform bash-like scripting in JavaScript & TypeScript.',
            source: 'Google (Serper)',
          },
        ];
      });

      const res = await webSearchTool.execute({ query: 'Bun 1.1 release', depth: 'standard' }, mockContext);
      expect(res.isError).toBe(false);
      expect(res.content).toContain('### Web Search Results for: "Bun 1.1 release"');
      expect(res.content).toContain('[1] Bun 1.1 Release Notes');
      expect(res.content).toContain('URL: https://bun.sh/blog/bun-v1.1');
      expect(res.content).toContain('[2] Bun Shell Documentation');
    });

    it('handles empty search results gracefully without crashing', async () => {
      setWebSearchOverride(async () => []);
      const res = await webSearchTool.execute({ query: 'unfindable query xyz987654' }, mockContext);
      expect(res.isError).toBe(false);
      expect(res.content).toContain('No web search results found');
    });
  });

  describe('read_docs', () => {
    it('declares read_docs tool specification', () => {
      expect(readDocsTool.spec.name).toBe('read_docs');
      expect(readDocsTool.spec.readOnly).toBe(true);
      expect(readDocsTool.spec.parameters.required).toContain('library');
    });

    it('queries documentation hub and provides research pointers', async () => {
      setWebSearchOverride(async () => {
        return [
          {
            title: 'React Server Components',
            url: 'https://react.dev/reference/rsc/server-components',
            snippet: 'Server Components are a new type of Component that renders ahead of time.',
          },
        ];
      });

      const res = await readDocsTool.execute({ library: 'react', topic: 'server components' }, mockContext);
      expect(res.isError).toBe(false);
      expect(res.content).toContain('Technical Documentation Research: React - server components');
      expect(res.content).toContain('https://react.dev/reference/rsc/server-components');
    });
  });
});
