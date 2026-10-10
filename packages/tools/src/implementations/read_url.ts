import type { WorkspaceTool, ToolContext, ToolResult } from '../types';
import { assertUrlAllowed, SsrfError } from '../utils/ssrf';
import { extractPageContent } from '../utils/html_extractor';

const DEFAULT_MAX_CHARS = 20_000;
const MAX_RESPONSE_BYTES = 2_000_000; // 2 MB
const FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; AgentOSResearchBot/1.0; +https://github.com/agent-os)';

export type FetchFn = (input: any, init?: any) => Promise<Response>;

export interface ReadUrlOptions {
  customFetch?: FetchFn;
}

let activeFetchOverride: FetchFn | undefined = undefined;

export function setReadUrlFetchOverride(fetchFn?: FetchFn): void {
  activeFetchOverride = fetchFn;
}

export const readUrlTool: WorkspaceTool = {
  spec: {
    name: 'read_url',
    description: 'Fetches and extracts readable text from an external web URL or documentation page with SSRF protection, redirect verification, and clean content extraction.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The HTTP or HTTPS URL to fetch (e.g. "https://docs.bun.sh")',
        },
        maxChars: {
          type: 'number',
          description: 'Maximum number of text characters to return (default: 20000)',
        },
      },
      required: ['url'],
    },
    readOnly: true,
  },
  requiresApproval: () => false,
  execute: async (args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult & { output: string }> => {
    const rawUrl = String(args.url || '').trim();
    const maxChars = typeof args.maxChars === 'number' && args.maxChars > 0 ? args.maxChars : DEFAULT_MAX_CHARS;

    if (!rawUrl) {
      const msg = 'Error: "url" parameter is required and cannot be empty.';
      return { content: msg, output: msg, isError: true };
    }

    const fetchImpl = activeFetchOverride ?? globalThis.fetch;
    let currentUrl = rawUrl;
    let redirectCount = 0;

    while (redirectCount <= MAX_REDIRECTS) {
      let validatedUrl: URL;
      try {
        validatedUrl = await assertUrlAllowed(currentUrl);
      } catch (err: any) {
        const msg = `URL access rejected: ${err.message}`;
        return { content: msg, output: msg, isError: true };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetchImpl(validatedUrl.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/json,text/plain,text/markdown;q=0.9,*/*;q=0.8',
          },
        });
      } catch (err: any) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
          const msg = `Fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s for URL: "${currentUrl}"`;
          return { content: msg, output: msg, isError: true };
        }
        const msg = `Failed to fetch URL "${currentUrl}": ${err.message}`;
        return { content: msg, output: msg, isError: true };
      } finally {
        clearTimeout(timer);
      }

      // Check redirect
      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          const msg = `Received HTTP ${response.status} redirect without Location header from "${currentUrl}"`;
          return { content: msg, output: msg, isError: true };
        }

        const nextUrl = new URL(location, validatedUrl).toString();
        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) {
          const msg = `Exceeded maximum redirect limit (${MAX_REDIRECTS}) following URL to "${nextUrl}"`;
          return { content: msg, output: msg, isError: true };
        }
        currentUrl = nextUrl;
        continue;
      }

      if (!response.ok) {
        const msg = `HTTP request failed with status ${response.status} (${response.statusText}) for URL: "${currentUrl}"`;
        return { content: msg, output: msg, isError: true };
      }

      // Validate size
      const contentLengthHeader = response.headers.get('content-length');
      if (contentLengthHeader && parseInt(contentLengthHeader, 10) > MAX_RESPONSE_BYTES) {
        const msg = `Response body too large (${contentLengthHeader} bytes exceeds ${MAX_RESPONSE_BYTES} limit)`;
        return { content: msg, output: msg, isError: true };
      }

      const contentType = response.headers.get('content-type') || 'text/html';
      let rawBody = '';

      try {
        if (!response.body) {
          const buffer = await response.arrayBuffer();
          if (buffer.byteLength > MAX_RESPONSE_BYTES) {
            const msg = `Response body exceeded ${MAX_RESPONSE_BYTES} bytes limit.`;
            return { content: msg, output: msg, isError: true };
          }
          rawBody = new TextDecoder('utf-8').decode(buffer);
        } else {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let totalBytes = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              totalBytes += value.byteLength;
              if (totalBytes > MAX_RESPONSE_BYTES) {
                await reader.cancel();
                const msg = `Response body exceeded ${MAX_RESPONSE_BYTES} bytes limit mid-transfer.`;
                return { content: msg, output: msg, isError: true };
              }
              chunks.push(value);
            }
          }

          const fullBuffer = new Uint8Array(totalBytes);
          let offset = 0;
          for (const chunk of chunks) {
            fullBuffer.set(chunk, offset);
            offset += chunk.byteLength;
          }
          rawBody = new TextDecoder('utf-8').decode(fullBuffer);
        }
      } catch (err: any) {
        const msg = `Failed to read response stream from "${currentUrl}": ${err.message}`;
        return { content: msg, output: msg, isError: true };
      }

      const extracted = extractPageContent(rawBody, contentType, maxChars);

      const headerInfo = [
        `[URL]: ${currentUrl}`,
        extracted.title ? `[Title]: ${extracted.title}` : undefined,
        extracted.description ? `[Description]: ${extracted.description}` : undefined,
        `[Extracted Text]: ${extracted.text.length} characters (${extracted.byteLength} bytes)${extracted.truncated ? ' [TRUNCATED]' : ''}`,
      ].filter(Boolean).join('\n');

      const formatted = `${headerInfo}\n\n--- Content ---\n${extracted.text}`;

      return {
        content: formatted,
        output: formatted,
        isError: false,
      };
    }

    const msg = `Exceeded maximum redirect limit for "${rawUrl}"`;
    return { content: msg, output: msg, isError: true };
  },
};
