/** Session-scoped WiCER query cache. Moved from @agent-os/seol. */
export class CacheManager {
  private wicerCache = new Map<string, any>();

  public getWicerCache(graphVersion: number, sessionId: string, queryHash: string): any | null {
    return this.wicerCache.get(`wicer_${graphVersion}_${sessionId}_${queryHash}`) ?? null;
  }

  public setWicerCache(graphVersion: number, sessionId: string, queryHash: string, value: any): void {
    this.wicerCache.set(`wicer_${graphVersion}_${sessionId}_${queryHash}`, value);
  }

  public clearSession(sessionId: string): void {
    for (const key of this.wicerCache.keys()) {
      if (key.includes(`_${sessionId}_`)) this.wicerCache.delete(key);
    }
  }
}
