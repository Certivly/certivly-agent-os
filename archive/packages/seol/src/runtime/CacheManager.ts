export class CacheManager {
  private wicerCache: Map<string, any> = new Map();
  private graphCache: Map<string, any> = new Map();

  public getWicerCache(graphVersion: number, sessionId: string, queryHash: string): any | null {
    const key = `wicer_${graphVersion}_${sessionId}_${queryHash}`;
    return this.wicerCache.get(key) || null;
  }

  public setWicerCache(graphVersion: number, sessionId: string, queryHash: string, value: any): void {
    const key = `wicer_${graphVersion}_${sessionId}_${queryHash}`;
    this.wicerCache.set(key, value);
  }

  public clearSession(sessionId: string): void {
    for (const key of this.wicerCache.keys()) {
      if (key.includes(`_${sessionId}_`)) {
        this.wicerCache.delete(key);
      }
    }
  }
}
