export class MemoryInspector {
  public getHeapStatus() {
    const memoryUsage = process.memoryUsage();
    return {
      heapTotal: this.bytesToMB(memoryUsage.heapTotal),
      heapUsed: this.bytesToMB(memoryUsage.heapUsed),
      external: this.bytesToMB(memoryUsage.external),
      rss: this.bytesToMB(memoryUsage.rss)
    };
  }

  public report() {
    const status = this.getHeapStatus();
    console.log(`Heap Used: ${status.heapUsed.toFixed(2)} MB`);
    console.log(`Heap Total: ${status.heapTotal.toFixed(2)} MB`);
    console.log(`RSS: ${status.rss.toFixed(2)} MB`);
  }

  private bytesToMB(bytes: number): number {
    return bytes / 1024 / 1024;
  }
}
