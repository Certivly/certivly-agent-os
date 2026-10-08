# Implement LruCache class

Implement and export `LruCache<K, V>` in `src/lru.ts`.
The class must support:
- `constructor(capacity: number)`
- `get(key: K): V | undefined` (accessing an item marks it as most recently used)
- `set(key: K, value: V): void` (inserting or updating marks it as most recently used; if over capacity, evict the least recently used key)
- `size: number` getter returning the current number of cached items
