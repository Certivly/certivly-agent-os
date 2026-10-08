# Implement dedupeByKey function

Implement and export `dedupeByKey<T>(items: T[], key: keyof T): T[]` in `src/dedupe.ts`.
It should return a new array where only the first occurrence of each distinct property value for `key` is retained, in original order.
The input array must not be mutated.
