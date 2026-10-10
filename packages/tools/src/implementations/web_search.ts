import type { WorkspaceTool, ToolContext, ToolResult } from '../types';

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

export type WebSearchProviderFn = (
  query: string,
  depth: 'standard' | 'deep',
  maxResults: number
) => Promise<WebSearchResultItem[]>;

let activeSearchOverride: WebSearchProviderFn | undefined = undefined;

export function setWebSearchOverride(fn?: WebSearchProviderFn): void {
  activeSearchOverride = fn;
}

async function searchWithSerper(
  query: string,
  depth: 'standard' | 'deep',
  maxResults: number,
  apiKey: string
): Promise<WebSearchResultItem[]> {
  const url = process.env.SERPER_URL || 'https://google.serper.dev/search';
  const num = depth === 'deep' ? Math.max(maxResults, 12) : maxResults;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({ q: query, num }),
  });

  if (!res.ok) {
    throw new Error(`Serper API error: HTTP ${res.status} (${res.statusText})`);
  }

  const data = (await res.json()) as any;
  const items: WebSearchResultItem[] = [];

  if (data.answerBox?.snippet) {
    items.push({
      title: data.answerBox.title || 'Direct Answer',
      url: data.answerBox.link || '',
      snippet: data.answerBox.snippet,
      source: 'Answer Box',
    });
  }

  if (Array.isArray(data.organic)) {
    for (const org of data.organic.slice(0, maxResults)) {
      items.push({
        title: org.title || 'Untitled',
        url: org.link || '',
        snippet: org.snippet || '',
        source: 'Google (Serper)',
      });
    }
  }

  return items;
}

async function searchWithDuckDuckGo(
  query: string,
  maxResults: number
): Promise<WebSearchResultItem[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo error: HTTP ${res.status}`);
  }

  const html = await res.text();
  const items: WebSearchResultItem[] = [];

  // Parse result blocks from DuckDuckGo HTML
  const regex = /<a class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null && items.length < maxResults) {
    let rawUrl = match[1];
    // DDG redirect URLs
    const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
    if (uddgMatch) {
      try {
        rawUrl = decodeURIComponent(uddgMatch[1]);
      } catch {
        // keep raw
      }
    }

    const title = match[2].replace(/<[^>]*>/g, '').trim();
    const snippet = match[3].replace(/<[^>]*>/g, '').trim();

    if (rawUrl && (title || snippet)) {
      items.push({
        title: title || rawUrl,
        url: rawUrl,
        snippet: snippet || '',
        source: 'DuckDuckGo',
      });
    }
  }

  return items;
}

export const webSearchTool: WorkspaceTool = {
  spec: {
    name: 'web_search',
    description: 'Searches the web for up-to-date documentation, release notes, APIs, tutorials, and technical solutions. Returns structured titles, URLs, snippets, and answer summaries.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to look up on the web (e.g. "Bun 1.1 shell cross-platform support")',
        },
        depth: {
          type: 'string',
          enum: ['standard', 'deep'],
          description: 'Search depth. "standard" fetches quick top results; "deep" retrieves more sources and broader coverage (default: "standard")',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 8)',
        },
      },
      required: ['query'],
    },
    readOnly: true,
  },
  requiresApproval: () => false,
  execute: async (args: Record<string, unknown>, _context?: ToolContext): Promise<ToolResult & { output: string }> => {
    const query = String(args.query || '').trim();
    const depth = (args.depth === 'deep' ? 'deep' : 'standard') as 'standard' | 'deep';
    const maxResults = typeof args.maxResults === 'number' && args.maxResults > 0 ? args.maxResults : 8;

    if (!query) {
      const msg = 'Error: "query" parameter is required and cannot be empty.';
      return { content: msg, output: msg, isError: true };
    }

    try {
      let results: WebSearchResultItem[] = [];

      if (activeSearchOverride) {
        results = await activeSearchOverride(query, depth, maxResults);
      } else if (process.env.SERPER_API_KEY) {
        results = await searchWithSerper(query, depth, maxResults, process.env.SERPER_API_KEY);
      } else {
        // Fallback to DuckDuckGo HTML search
        try {
          results = await searchWithDuckDuckGo(query, maxResults);
        } catch (ddgErr: any) {
          // If network is offline or blocked, return graceful message with guidance
          const fallbackMsg = `Web search encountered an error: ${ddgErr.message}. To configure direct Google SERP access, set SERPER_API_KEY in your environment.`;
          return { content: fallbackMsg, output: fallbackMsg, isError: false };
        }
      }

      if (results.length === 0) {
        const msg = `No web search results found for query: "${query}". Try refining search terms or verifying internet connectivity.`;
        return { content: msg, output: msg, isError: false };
      }

      const formattedList = results.map((item, idx) => {
        const parts = [
          `[${idx + 1}] ${item.title}`,
          `URL: ${item.url}`,
        ];
        if (item.snippet) {
          parts.push(`Snippet: ${item.snippet}`);
        }
        if (item.source) {
          parts.push(`Source: ${item.source}`);
        }
        return parts.join('\n');
      }).join('\n\n');

      const output = `### Web Search Results for: "${query}" (depth: ${depth})\n\n${formattedList}`;

      return {
        content: output,
        output,
        isError: false,
      };
    } catch (err: any) {
      const errorMsg = `Web search failed: ${err.message}`;
      return {
        content: errorMsg,
        output: errorMsg,
        isError: true,
      };
    }
  },
};
