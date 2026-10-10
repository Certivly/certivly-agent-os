export interface ExtractedPageContent {
  title?: string;
  description?: string;
  text: string;
  truncated: boolean;
  byteLength: number;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  copy: '©',
  gt: '>',
  lt: '<',
  quot: '"',
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  middot: '·',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = parseInt(entity.slice(2), 16);
      return !isNaN(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = parseInt(entity.slice(1), 10);
      return !isNaN(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
}

function removeTagWithContent(html: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'gi');
  return html.replace(regex, '\n');
}

function extractCandidates(html: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    if (match[1]?.trim()) {
      results.push(match[1]);
    }
  }
  return results;
}

function selectReadableSection(html: string): string {
  const articleCandidates = extractCandidates(html, 'article');
  if (articleCandidates.length > 0) {
    return articleCandidates.reduce((best, curr) =>
      stripTags(curr).length > stripTags(best).length ? curr : best
    );
  }

  const mainCandidates = extractCandidates(html, 'main');
  if (mainCandidates.length > 0) {
    return mainCandidates.reduce((best, curr) =>
      stripTags(curr).length > stripTags(best).length ? curr : best
    );
  }

  return html;
}

function extractMeta(html: string, nameOrProperty: string): string | undefined {
  const pattern = new RegExp(
    `<meta\\b[^>]*(?:name|property)=["']${nameOrProperty}["'][^>]*content=["']([^"']*)["']`,
    'i'
  );
  const match = html.match(pattern);
  if (match?.[1]) {
    return decodeHtmlEntities(match[1].trim());
  }
  // Try alternative attribute ordering (content before name)
  const altPattern = new RegExp(
    `<meta\\b[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["']${nameOrProperty}["']`,
    'i'
  );
  const altMatch = html.match(altPattern);
  if (altMatch?.[1]) {
    return decodeHtmlEntities(altMatch[1].trim());
  }
  return undefined;
}

function normalizeSpacing(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

/**
 * Extracts readable plaintext / markdown representation from HTML or raw text bodies.
 */
export function extractPageContent(
  rawBody: string,
  contentType: string = 'text/html',
  maxChars: number = 20_000
): ExtractedPageContent {
  const byteLength = Buffer.byteLength(rawBody, 'utf-8');
  const lowerType = contentType.toLowerCase();

  // If JSON
  if (lowerType.includes('application/json') || lowerType.includes('+json')) {
    try {
      const parsed = JSON.parse(rawBody);
      const text = JSON.stringify(parsed, null, 2);
      const truncated = text.length > maxChars;
      return {
        text: truncated ? `${text.slice(0, maxChars)}\n\n[Content truncated]` : text,
        truncated,
        byteLength,
      };
    } catch (_err) {
      // Fall through to plain text
    }
  }

  // If Markdown or plain text
  if (lowerType.includes('text/markdown') || lowerType.startsWith('text/plain')) {
    const text = normalizeSpacing(rawBody);
    const truncated = text.length > maxChars;
    return {
      text: truncated ? `${text.slice(0, maxChars)}\n\n[Content truncated]` : text,
      truncated,
      byteLength,
    };
  }

  // Extract metadata
  const titleMatch = rawBody.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1].trim()) : extractMeta(rawBody, 'og:title');
  const description = extractMeta(rawBody, 'description') || extractMeta(rawBody, 'og:description');

  let sanitized = rawBody
    .replace(/<!--[\s\S]*?-->/g, '\n')
    .replace(/<!doctype[^>]*>/gi, '\n');

  // Strip non-content blocks
  const tagsToStrip = [
    'script',
    'style',
    'svg',
    'canvas',
    'iframe',
    'noscript',
    'nav',
    'header',
    'footer',
    'form',
    'button',
    'select',
  ];

  for (const tag of tagsToStrip) {
    sanitized = removeTagWithContent(sanitized, tag);
  }

  // Focus on primary article or main region if available
  sanitized = selectReadableSection(sanitized);

  // Convert layout tags to newlines
  sanitized = sanitized
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|main|aside|li|tr|h[1-6]|blockquote|pre)>/gi, '\n')
    .replace(/<(li|tr|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '');

  let text = normalizeSpacing(decodeHtmlEntities(sanitized));

  let truncated = false;
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars).trimEnd()}\n\n[Content truncated - ${maxChars} character limit reached]`;
    truncated = true;
  }

  return {
    title,
    description,
    text,
    truncated,
    byteLength,
  };
}
