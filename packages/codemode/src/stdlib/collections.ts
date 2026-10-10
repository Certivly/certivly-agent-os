/**
 * Standard library collection utilities for CodeMode scripts.
 */

export const Collections = {
  chunk<T>(array: T[], size: number): T[][] {
    if (size <= 0) throw new RangeError('Chunk size must be greater than 0');
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  },

  groupBy<T, K extends string | number | symbol>(
    array: T[],
    keyFn: (item: T) => K
  ): Record<K, T[]> {
    const result = {} as Record<K, T[]>;
    for (const item of array) {
      const key = keyFn(item);
      if (!result[key]) {
        result[key] = [];
      }
      result[key].push(item);
    }
    return result;
  },

  keyBy<T, K extends string | number | symbol>(
    array: T[],
    keyFn: (item: T) => K
  ): Record<K, T> {
    const result = {} as Record<K, T>;
    for (const item of array) {
      const key = keyFn(item);
      result[key] = item;
    }
    return result;
  },

  unique<T>(array: T[]): T[] {
    return Array.from(new Set(array));
  },

  uniqueBy<T, K>(array: T[], keyFn: (item: T) => K): T[] {
    const seen = new Set<K>();
    const result: T[] = [];
    for (const item of array) {
      const key = keyFn(item);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
    return result;
  },

  sortBy<T>(array: T[], ...keyFns: Array<(item: T) => number | string>): T[] {
    return [...array].sort((a, b) => {
      for (const fn of keyFns) {
        const valA = fn(a);
        const valB = fn(b);
        if (valA < valB) return -1;
        if (valA > valB) return 1;
      }
      return 0;
    });
  },

  partition<T>(array: T[], predicate: (item: T) => boolean): [T[], T[]] {
    const pass: T[] = [];
    const fail: T[] = [];
    for (const item of array) {
      if (predicate(item)) {
        pass.push(item);
      } else {
        fail.push(item);
      }
    }
    return [pass, fail];
  },

  zip<T, U>(arrA: T[], arrB: U[]): Array<[T, U]> {
    const len = Math.min(arrA.length, arrB.length);
    const result: Array<[T, U]> = [];
    for (let i = 0; i < len; i++) {
      result.push([arrA[i], arrB[i]]);
    }
    return result;
  },

  flatten<T>(array: any[], depth: number = 1): T[] {
    return array.flat(depth) as T[];
  },

  difference<T>(arrA: T[], arrB: T[]): T[] {
    const setB = new Set(arrB);
    return arrA.filter(x => !setB.has(x));
  },

  intersection<T>(arrA: T[], arrB: T[]): T[] {
    const setB = new Set(arrB);
    return arrA.filter(x => setB.has(x));
  },

  sumBy<T>(array: T[], fn: (item: T) => number): number {
    return array.reduce((acc, curr) => acc + (fn(curr) || 0), 0);
  },

  countBy<T, K extends string | number | symbol>(
    array: T[],
    keyFn: (item: T) => K
  ): Record<K, number> {
    const result = {} as Record<K, number>;
    for (const item of array) {
      const key = keyFn(item);
      result[key] = (result[key] || 0) + 1;
    }
    return result;
  },
};
