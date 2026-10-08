import {
  ProviderError,
  AuthError,
  RateLimitError,
  ContextLengthError,
} from '../interface';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  signal?: AbortSignal;
  providerName?: string;
}

export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const num = Number(header);
  if (!Number.isNaN(num)) {
    return Math.max(0, Math.round(num * 1000));
  }
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return undefined;
}

export function computeBackoff(attempt: number, options: RetryOptions = {}): number {
  const initial = options.initialDelayMs ?? 200;
  const max = options.maxDelayMs ?? 10000;
  const delay = Math.min(max, initial * Math.pow(2, attempt - 1));
  if (options.jitter !== false) {
    const jitterFactor = 0.75 + Math.random() * 0.5;
    return Math.round(delay * jitterFactor);
  }
  return Math.round(delay);
}

export function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    const abortErr = new Error('Request was aborted');
    abortErr.name = 'AbortError';
    return Promise.reject((signal.reason as Error) || abortErr);
  }

  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onAbort = () => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      const abortErr = new Error('Request was aborted');
      abortErr.name = 'AbortError';
      reject((signal?.reason as Error) || abortErr);
    };

    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort);
  });
}

export function classifyError(err: unknown, providerName = 'Provider'): Error {
  if (
    err instanceof AuthError ||
    err instanceof RateLimitError ||
    err instanceof ContextLengthError
  ) {
    return err;
  }

  if (err instanceof Error && (err.name === 'AbortError' || err.message.toLowerCase().includes('abort'))) {
    return err;
  }

  const status = (err as any)?.status ?? (err as any)?.statusCode;
  const rawMsg = (err as any)?.message ? String((err as any).message) : String(err);
  const msgLower = rawMsg.toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    msgLower.includes('unauthorized') ||
    msgLower.includes('invalid_api_key') ||
    msgLower.includes('incorrect api key') ||
    msgLower.includes('invalid api key')
  ) {
    return new AuthError(`${providerName} authentication failed: ${rawMsg}`, err);
  }

  if (status === 429 || msgLower.includes('rate limit') || msgLower.includes('too many requests')) {
    let retryAfterMs: number | undefined;
    const headers = (err as any)?.headers;
    if (headers) {
      const headerVal = typeof headers.get === 'function' ? headers.get('retry-after') : headers['retry-after'];
      retryAfterMs = parseRetryAfter(headerVal);
    }
    return new RateLimitError(`${providerName} rate limit exceeded: ${rawMsg}`, retryAfterMs, err);
  }

  if (
    status === 400 &&
    (msgLower.includes('context_length') ||
      msgLower.includes('maximum context length') ||
      msgLower.includes('too many tokens') ||
      msgLower.includes('prompt exceeded') ||
      msgLower.includes('prompt is too long') ||
      msgLower.includes('string_too_long'))
  ) {
    return new ContextLengthError(`${providerName} context length exceeded: ${rawMsg}`, err);
  }

  if (err instanceof ProviderError) {
    return err;
  }

  return new ProviderError(`${providerName} error: ${rawMsg}`, err);
}

export async function fetchWithRetry(
  url: RequestInfo | URL,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? 3;
  const providerName = options.providerName || 'Provider';
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;

    if (options.signal?.aborted) {
      const abortErr = new Error('Request was aborted');
      abortErr.name = 'AbortError';
      throw (options.signal.reason as Error) || abortErr;
    }

    try {
      const response = await fetch(url, {
        ...init,
        signal: options.signal,
      });

      if (response.ok) {
        return response;
      }

      // 401 / 403 -> Do not retry
      if (response.status === 401 || response.status === 403) {
        const text = await response.text().catch(() => '');
        throw new AuthError(`${providerName} authentication failed (${response.status}): ${text}`);
      }

      // 400 -> Check context length, otherwise return response for caller error parsing
      if (response.status === 400) {
        const cloned = response.clone();
        const text = await cloned.text().catch(() => '');
        const textLower = text.toLowerCase();
        if (
          textLower.includes('context_length') ||
          textLower.includes('maximum context length') ||
          textLower.includes('too many tokens') ||
          textLower.includes('prompt exceeded') ||
          textLower.includes('prompt is too long')
        ) {
          throw new ContextLengthError(`${providerName} context length exceeded: ${text}`);
        }
        return response;
      }

      const isRetryable = response.status === 429 || (response.status >= 500 && response.status < 600);

      if (!isRetryable || attempt >= maxAttempts) {
        const text = await response.text().catch(() => '');
        if (response.status === 429) {
          const retryHeader = response.headers.get('retry-after');
          const retryAfterMs = parseRetryAfter(retryHeader);
          throw new RateLimitError(
            `${providerName} rate limit exceeded (HTTP 429): ${text}`,
            retryAfterMs
          );
        }
        throw new ProviderError(`${providerName} request failed (HTTP ${response.status}): ${text}`);
      }

      // Retryable 429 or 5xx: compute delay and sleep
      const retryHeader = response.headers.get('retry-after');
      const retryAfterMs = parseRetryAfter(retryHeader);
      const delayMs = retryAfterMs !== undefined ? retryAfterMs : computeBackoff(attempt, options);
      await sleepWithAbort(delayMs, options.signal);
    } catch (err: any) {
      if (
        err instanceof AuthError ||
        err instanceof ContextLengthError ||
        err instanceof RateLimitError
      ) {
        throw err;
      }

      if (options.signal?.aborted || err?.name === 'AbortError') {
        throw err;
      }

      if (attempt >= maxAttempts) {
        throw classifyError(err, providerName);
      }

      // Network / connection error -> retry
      const delayMs = computeBackoff(attempt, options);
      await sleepWithAbort(delayMs, options.signal);
    }
  }

  throw new ProviderError(`${providerName} request exhausted retries (${maxAttempts})`);
}
