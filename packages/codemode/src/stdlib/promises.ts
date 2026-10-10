/**
 * Standard library promise and concurrency utilities for CodeMode scripts.
 */

export const PromiseUtils = {
  async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  },

  async timeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
    let timer: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(message || `Promise timed out after ${ms}ms`));
      }, ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  },

  async mapConcurrent<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    if (limit <= 0) limit = 1;
    const results: R[] = new Array(items.length);
    let currentIndex = 0;

    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (currentIndex < items.length) {
        const index = currentIndex++;
        results[index] = await fn(items[index], index);
      }
    });

    await Promise.all(workers);
    return results;
  },

  async retry<T>(
    fn: () => Promise<T>,
    options?: { retries?: number; delayMs?: number; backoff?: number }
  ): Promise<T> {
    const retries = options?.retries ?? 3;
    let delay = options?.delayMs ?? 100;
    const backoff = options?.backoff ?? 2;

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastError = err;
        if (attempt < retries) {
          await this.delay(delay);
          delay *= backoff;
        }
      }
    }
    throw lastError;
  },

  async allSettledValues<T>(promises: Promise<T>[]): Promise<{ fulfilled: T[]; rejected: unknown[] }> {
    const results = await Promise.allSettled(promises);
    const fulfilled: T[] = [];
    const rejected: unknown[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        fulfilled.push(r.value);
      } else {
        rejected.push(r.reason);
      }
    }
    return { fulfilled, rejected };
  },
};
