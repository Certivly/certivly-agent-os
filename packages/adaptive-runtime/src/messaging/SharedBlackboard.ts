export class SharedBlackboard {
  private state: Map<string, any> = new Map();

  public write(key: string, value: any) {
    this.state.set(key, value);
  }

  public read(key: string): any {
    return this.state.get(key);
  }

  public getAll(): Record<string, any> {
    const obj: Record<string, any> = {};
    for (const [k, v] of this.state.entries()) {
      obj[k] = v;
    }
    return obj;
  }
}
