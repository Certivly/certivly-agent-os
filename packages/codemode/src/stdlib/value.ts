/**
 * Standard library value and object inspection utilities for CodeMode scripts.
 */

function get<T = any>(obj: unknown, pathStr: string): T;
function get<T>(obj: unknown, pathStr: string, defaultValue: T): T;
function get(obj: unknown, pathStr: string, defaultValue?: any): any {
  if (obj === null || obj === undefined) return defaultValue;
  const segments = pathStr.split('.').filter(Boolean);
  let curr: any = obj;
  for (const seg of segments) {
    if (curr === null || curr === undefined) return defaultValue;
    curr = curr[seg];
  }
  return curr !== undefined ? curr : defaultValue;
}

export const ValueUtils = {
  isNil(value: unknown): value is null | undefined {
    return value === null || value === undefined;
  },

  isEmpty(value: unknown): boolean {
    if (this.isNil(value)) return true;
    if (typeof value === 'string' || Array.isArray(value)) return value.length === 0;
    if (value instanceof Map || value instanceof Set) return value.size === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  },

  isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === null || proto === Object.prototype;
  },

  deepClone<T>(value: T): T {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      return value.map(item => this.deepClone(item)) as unknown as T;
    }
    const copy: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      copy[k] = this.deepClone(v);
    }
    return copy as T;
  },

  deepMerge<T extends Record<string, any>, U extends Record<string, any>>(
    target: T,
    source: U
  ): T & U {
    const output: Record<string, any> = { ...target };
    for (const [key, val] of Object.entries(source)) {
      if (this.isPlainObject(val) && this.isPlainObject(output[key])) {
        output[key] = this.deepMerge(output[key], val);
      } else {
        output[key] = val;
      }
    }
    return output as T & U;
  },

  pick<T extends Record<string, any>, K extends keyof T>(
    obj: T,
    keys: K[]
  ): Pick<T, K> {
    const result = {} as Pick<T, K>;
    for (const key of keys) {
      if (key in obj) {
        result[key] = obj[key];
      }
    }
    return result;
  },

  omit<T extends Record<string, any>, K extends keyof T>(
    obj: T,
    keys: K[]
  ): Omit<T, K> {
    const keySet = new Set(keys as string[]);
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!keySet.has(k)) {
        result[k] = v;
      }
    }
    return result as Omit<T, K>;
  },

  get,
};
