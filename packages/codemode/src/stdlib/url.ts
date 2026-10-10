/**
 * Standard library URL utilities for CodeMode scripts.
 */

export const UrlUtils = {
  parseUrl(rawUrl: string): {
    protocol: string;
    host: string;
    pathname: string;
    search: string;
    hash: string;
    origin: string;
    params: Record<string, string>;
  } {
    const parsed = new URL(rawUrl);
    const params: Record<string, string> = {};
    parsed.searchParams.forEach((val, key) => {
      params[key] = val;
    });
    return {
      protocol: parsed.protocol,
      host: parsed.host,
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
      origin: parsed.origin,
      params,
    };
  },

  buildUrl(baseUrl: string, queryParams?: Record<string, unknown>): string {
    const parsed = new URL(baseUrl);
    if (queryParams) {
      for (const [key, val] of Object.entries(queryParams)) {
        if (val !== undefined && val !== null) {
          parsed.searchParams.set(key, String(val));
        }
      }
    }
    return parsed.toString();
  },

  joinPath(...segments: string[]): string {
    return segments
      .map((s, idx) => {
        if (idx === 0) return s.replace(/\/+$/, '');
        return s.replace(/^\/+|\/+$/g, '');
      })
      .filter(Boolean)
      .join('/');
  },

  toQueryParams(params: Record<string, unknown>): string {
    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        searchParams.append(k, String(v));
      }
    }
    const res = searchParams.toString();
    return res ? `?${res}` : '';
  },
};
