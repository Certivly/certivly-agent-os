export class UpdateDebouncer {
  private timeoutId: any | null = null;
  private pendingChanges = new Set<string>();

  constructor(
    private delayMs: number,
    private onBatchReady: (changes: string[]) => Promise<void>
  ) {}

  public async debounce(filePath: string): Promise<void> {
    this.pendingChanges.add(filePath);

    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(async () => {
      const batch = Array.from(this.pendingChanges);
      this.pendingChanges.clear();
      this.timeoutId = null;
      await this.onBatchReady(batch);
    }, this.delayMs);
  }
}
