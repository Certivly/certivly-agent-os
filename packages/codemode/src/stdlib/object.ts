const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class ObjectUtils {
  public static keys<T extends object>(obj: T): string[] {
    if (!obj || typeof obj !== 'object') return [];
    return Object.keys(obj).filter(k => !BLOCKED_KEYS.has(k));
  }

  public static values<T extends object>(obj: T): any[] {
    if (!obj || typeof obj !== 'object') return [];
    return Object.entries(obj)
      .filter(([k]) => !BLOCKED_KEYS.has(k))
      .map(([, v]) => v);
  }

  public static entries<T extends object>(obj: T): [string, any][] {
    if (!obj || typeof obj !== 'object') return [];
    return Object.entries(obj).filter(([k]) => !BLOCKED_KEYS.has(k));
  }

  public static hasOwn(obj: object, prop: string): boolean {
    if (!obj || typeof obj !== 'object' || BLOCKED_KEYS.has(prop)) return false;
    return Object.prototype.hasOwnProperty.call(obj, prop);
  }

  public static pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
    const res = {} as Pick<T, K>;
    if (!obj || typeof obj !== 'object') return res;
    for (const key of keys) {
      if (!BLOCKED_KEYS.has(String(key)) && key in obj) {
        res[key] = obj[key];
      }
    }
    return res;
  }

  public static omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
    const res = {} as any;
    if (!obj || typeof obj !== 'object') return res;
    const omitSet = new Set(keys.map(String));
    for (const [k, v] of Object.entries(obj)) {
      if (!omitSet.has(k) && !BLOCKED_KEYS.has(k)) {
        res[k] = v;
      }
    }
    return res;
  }

  public static deepClone<T>(val: T): T {
    if (val === null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map(item => this.deepClone(item)) as any;
    const cloned: any = {};
    for (const [k, v] of Object.entries(val)) {
      if (!BLOCKED_KEYS.has(k)) {
        cloned[k] = this.deepClone(v);
      }
    }
    return cloned;
  }

  public static deepMerge(target: any, source: any): any {
    if (!target || typeof target !== 'object') return this.deepClone(source);
    if (!source || typeof source !== 'object') return target;

    const result = this.deepClone(target);
    for (const [k, v] of Object.entries(source)) {
      if (BLOCKED_KEYS.has(k)) continue;
      if (v && typeof v === 'object' && !Array.isArray(v) && result[k] && typeof result[k] === 'object') {
        result[k] = this.deepMerge(result[k], v);
      } else {
        result[k] = this.deepClone(v);
      }
    }
    return result;
  }

  public static get(obj: any, pathStr: string, defaultValue?: any): any {
    if (!obj || typeof obj !== 'object') return defaultValue;
    const parts = pathStr.split('.').filter(p => p.length > 0 && !BLOCKED_KEYS.has(p));
    let curr = obj;
    for (const part of parts) {
      if (curr === null || curr === undefined || typeof curr !== 'object') return defaultValue;
      curr = curr[part];
    }
    return curr !== undefined ? curr : defaultValue;
  }
}
