import { LruCache } from './src/lru';

const cache = new LruCache<string, number>(2);

cache.set('a', 1);
cache.set('b', 2);
if (cache.size !== 2 || cache.get('a') !== 1) {
  console.error('Basic get/set failed');
  process.exit(1);
}

// Accessing 'a' makes 'b' the least recently used
cache.set('c', 3); // should evict 'b'

if (cache.get('b') !== undefined) {
  console.error('Eviction failed: "b" should have been evicted');
  process.exit(1);
}

if (cache.get('a') !== 1 || cache.get('c') !== 3) {
  console.error('Expected keys "a" and "c" to remain');
  process.exit(1);
}

console.log('Verification passed: LruCache works correctly.');
process.exit(0);
