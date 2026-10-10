import { describe, it, expect } from 'bun:test';
import {
  Collections,
  Strings,
  MathUtils,
  JsonUtils,
  PromiseUtils,
  DateUtils,
  UrlUtils,
  ValueUtils,
} from '../src/stdlib';

describe('CodeMode Standard Library (packages/codemode/src/stdlib)', () => {
  describe('Collections', () => {
    it('chunks arrays correctly', () => {
      const arr = [1, 2, 3, 4, 5];
      expect(Collections.chunk(arr, 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('groupBy and keyBy group elements by property', () => {
      const items = [
        { id: '1', role: 'admin' },
        { id: '2', role: 'user' },
        { id: '3', role: 'admin' },
      ];
      const grouped = Collections.groupBy(items, i => i.role);
      expect(grouped.admin.length).toBe(2);
      expect(grouped.user.length).toBe(1);

      const keyed = Collections.keyBy(items, i => i.id);
      expect(keyed['2'].role).toBe('user');
    });

    it('unique, uniqueBy, difference, and intersection work as expected', () => {
      expect(Collections.unique([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
      expect(Collections.difference([1, 2, 3], [2, 3, 4])).toEqual([1]);
      expect(Collections.intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
    });

    it('partition splits into pass and fail', () => {
      const [evens, odds] = Collections.partition([1, 2, 3, 4, 5, 6], n => n % 2 === 0);
      expect(evens).toEqual([2, 4, 6]);
      expect(odds).toEqual([1, 3, 5]);
    });
  });

  describe('Strings', () => {
    it('truncates strings cleanly with custom suffix', () => {
      expect(Strings.truncate('Hello, world!', 8)).toBe('Hello...');
      expect(Strings.truncate('Short', 10)).toBe('Short');
    });

    it('slugify, camelCase, kebabCase, and snakeCase transform formats', () => {
      expect(Strings.slugify('Hello World & Goodbye!')).toBe('hello-world-goodbye');
      expect(Strings.camelCase('hello-world_test')).toBe('helloWorldTest');
      expect(Strings.kebabCase('helloWorldTest')).toBe('hello-world-test');
      expect(Strings.snakeCase('helloWorldTest')).toBe('hello_world_test');
    });

    it('template interpolates variables', () => {
      expect(Strings.template('Hello {{ name }}, welcome to {{ place }}!', { name: 'Alice', place: 'Wonderland' }))
        .toBe('Hello Alice, welcome to Wonderland!');
    });
  });

  describe('MathUtils', () => {
    it('calculates sum, mean, median, min, max, clamp', () => {
      const numbers = [10, 20, 30, 40, 50];
      expect(MathUtils.sum(numbers)).toBe(150);
      expect(MathUtils.mean(numbers)).toBe(30);
      expect(MathUtils.median(numbers)).toBe(30);
      expect(MathUtils.min(numbers)).toBe(10);
      expect(MathUtils.max(numbers)).toBe(50);
      expect(MathUtils.clamp(25, 0, 20)).toBe(20);
      expect(MathUtils.clamp(-5, 0, 20)).toBe(0);
    });

    it('calculates variance, standard deviation, and percentiles', () => {
      const data = [2, 4, 4, 4, 5, 5, 7, 9];
      expect(MathUtils.round(MathUtils.variance(data), 2)).toBe(4);
      expect(MathUtils.round(MathUtils.stdDev(data), 2)).toBe(2);
      expect(MathUtils.percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    });
  });

  describe('JsonUtils', () => {
    it('safeParse handles valid and invalid json without throwing', () => {
      expect(JsonUtils.safeParse<any>('{"valid": true}')).toEqual({ valid: true });
      expect(JsonUtils.safeParse('invalid-json', { fallback: true })).toEqual({ fallback: true });
    });

    it('parseLines and toLines handle JSON lines stream', () => {
      const jsonl = '{"line": 1}\n{"line": 2}\n';
      const parsed = JsonUtils.parseLines(jsonl);
      expect(parsed).toEqual([{ line: 1 }, { line: 2 }]);
      expect(JsonUtils.toLines(parsed)).toBe('{"line":1}\n{"line":2}');
    });

    it('pruneEmpty strips null, undefined, empty strings and empty objects', () => {
      const input = { a: 1, b: null, c: '', d: { e: undefined, f: 2 }, g: {} };
      expect(JsonUtils.pruneEmpty(input)).toEqual({ a: 1, d: { f: 2 } });
    });
  });

  describe('PromiseUtils', () => {
    it('delay pauses for specified duration', async () => {
      const start = Date.now();
      await PromiseUtils.delay(50);
      expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    });

    it('timeout throws if promise takes too long', async () => {
      const slow = new Promise(resolve => setTimeout(resolve, 200));
      await expect(PromiseUtils.timeout(slow, 50)).rejects.toThrow('timed out');
    });

    it('mapConcurrent processes tasks respecting concurrency limit', async () => {
      let active = 0;
      let maxActive = 0;
      const items = [1, 2, 3, 4, 5, 6];
      const results = await PromiseUtils.mapConcurrent(items, 2, async (n) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await PromiseUtils.delay(20);
        active--;
        return n * 2;
      });
      expect(results).toEqual([2, 4, 6, 8, 10, 12]);
      expect(maxActive).toBeLessThanOrEqual(2);
    });
  });

  describe('DateUtils & UrlUtils & ValueUtils', () => {
    it('DateUtils formats and calculates differences', () => {
      const d1 = new Date('2026-01-01T00:00:00Z');
      const d2 = DateUtils.addDays(d1, 2);
      expect(DateUtils.diffMs(d1, d2)).toBe(2 * 24 * 3600 * 1000);
      expect(DateUtils.formatDuration(500)).toBe('500ms');
      expect(DateUtils.formatDuration(1500)).toBe('1.5s');
    });

    it('UrlUtils parses, builds, and joins URL paths', () => {
      const parsed = UrlUtils.parseUrl('https://example.com/api/v1?search=test&page=2');
      expect(parsed.host).toBe('example.com');
      expect(parsed.pathname).toBe('/api/v1');
      expect(parsed.params.search).toBe('test');
      expect(parsed.params.page).toBe('2');

      const built = UrlUtils.buildUrl('https://example.com/api', { foo: 'bar', num: 42 });
      expect(built).toBe('https://example.com/api?foo=bar&num=42');

      expect(UrlUtils.joinPath('/api/', '/v1/', 'users')).toBe('/api/v1/users');
    });

    it('ValueUtils checks nil, empty, deepClone, deepMerge, get, pick, omit', () => {
      expect(ValueUtils.isNil(null)).toBe(true);
      expect(ValueUtils.isEmpty({})).toBe(true);
      expect(ValueUtils.isEmpty([1])).toBe(false);

      const target = { a: 1, nested: { b: 2 } };
      const source = { nested: { c: 3 }, d: 4 };
      const merged = ValueUtils.deepMerge(target, source);
      expect(merged).toEqual({ a: 1, nested: { b: 2, c: 3 }, d: 4 });

      expect(ValueUtils.get<any>(merged, 'nested.b')).toBe(2);
      expect(ValueUtils.pick(merged, ['a', 'd'])).toEqual({ a: 1, d: 4 });
      expect(ValueUtils.omit(merged, ['nested'])).toEqual({ a: 1, d: 4 });
    });
  });
});
