# Implement retryWithBackoff function

Implement and export `retryWithBackoff<T>(fn: () => Promise<T>, maxRetries: number): Promise<T>` in `src/retry.ts`.
It should execute `fn()`. If `fn()` succeeds, return its result.
If `fn()` throws, retry up to `maxRetries` times.
If all attempts fail, rethrow the last error encountered.
