import type { WorkspaceTool, ToolContext, ToolResult } from '../types';
import { readUrlTool } from './read_url';
import { webSearchTool } from './web_search';

const DOCUMENTATION_HUBS: Record<string, { name: string; baseUrl: string; searchTemplate: string }> = {
  bun: {
    name: 'Bun',
    baseUrl: 'https://bun.sh/docs',
    searchTemplate: 'site:bun.sh/docs {topic}',
  },
  react: {
    name: 'React',
    baseUrl: 'https://react.dev',
    searchTemplate: 'site:react.dev {topic}',
  },
  nextjs: {
    name: 'Next.js',
    baseUrl: 'https://nextjs.org/docs',
    searchTemplate: 'site:nextjs.org/docs {topic}',
  },
  typescript: {
    name: 'TypeScript',
    baseUrl: 'https://www.typescriptlang.org/docs',
    searchTemplate: 'site:typescriptlang.org/docs {topic}',
  },
  nodejs: {
    name: 'Node.js',
    baseUrl: 'https://nodejs.org/api',
    searchTemplate: 'site:nodejs.org/api {topic}',
  },
  node: {
    name: 'Node.js',
    baseUrl: 'https://nodejs.org/api',
    searchTemplate: 'site:nodejs.org/api {topic}',
  },
  tailwindcss: {
    name: 'Tailwind CSS',
    baseUrl: 'https://tailwindcss.com/docs',
    searchTemplate: 'site:tailwindcss.com/docs {topic}',
  },
  tailwind: {
    name: 'Tailwind CSS',
    baseUrl: 'https://tailwindcss.com/docs',
    searchTemplate: 'site:tailwindcss.com/docs {topic}',
  },
  python: {
    name: 'Python',
    baseUrl: 'https://docs.python.org/3/',
    searchTemplate: 'site:docs.python.org/3/ {topic}',
  },
  rust: {
    name: 'Rust',
    baseUrl: 'https://doc.rust-lang.org/book/',
    searchTemplate: 'site:doc.rust-lang.org {topic}',
  },
};

export const readDocsTool: WorkspaceTool = {
  spec: {
    name: 'read_docs',
    description: 'Look up official technical documentation, guides, and API references for common libraries, frameworks, and programming runtimes (e.g. React, Next.js, Bun, Node, TypeScript, Tailwind, Python, Rust).',
    parameters: {
      type: 'object',
      properties: {
        library: {
          type: 'string',
          description: 'The name of the library or framework (e.g. "bun", "react", "nextjs", "typescript", "node", "tailwind")',
        },
        topic: {
          type: 'string',
          description: 'Specific topic, method, or API to find in documentation (e.g. "spawn", "useDeferredValue", "server actions", "generics")',
        },
      },
      required: ['library'],
    },
    readOnly: true,
  },
  requiresApproval: () => false,
  execute: async (args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult & { output: string }> => {
    const libKey = String(args.library || '').toLowerCase().trim();
    const topic = String(args.topic || '').trim();

    if (!libKey) {
      const msg = 'Error: "library" parameter is required.';
      return { content: msg, output: msg, isError: true };
    }

    const hub = DOCUMENTATION_HUBS[libKey];
    if (hub && !topic) {
      // Return hub information and fetch main docs index
      const pageResult = await readUrlTool.execute({ url: hub.baseUrl, maxChars: 8000 }, context as any);
      const output = `### ${hub.name} Official Documentation Index (${hub.baseUrl})\n\n${pageResult.content}`;
      return { content: output, output, isError: pageResult.isError };
    }

    // Search docs with query
    const searchQuery = hub
      ? hub.searchTemplate.replace('{topic}', topic)
      : `${libKey} documentation ${topic}`;

    const searchRes = await webSearchTool.execute({ query: searchQuery, depth: 'standard', maxResults: 5 }, context as any);
    if (searchRes.isError) {
      return {
        content: searchRes.content,
        output: (searchRes as any).output || searchRes.content,
        isError: true,
      };
    }

    const output = `### Technical Documentation Research: ${hub?.name || libKey} - ${topic || 'General'}\n\n${searchRes.content}\n\n*Tip: Use read_url with any of the above documentation links to inspect full API specifications.*`;
    return {
      content: output,
      output,
      isError: false,
    };
  },
};
