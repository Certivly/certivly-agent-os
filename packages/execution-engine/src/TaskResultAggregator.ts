export class TaskResultAggregator {
  private results: Map<string, any> = new Map();

  public addTaskResult(taskId: string, result: any) {
    this.results.set(taskId, result);
  }

  public getTaskResult(taskId: string): any {
    return this.results.get(taskId);
  }

  public getAllResults(): Record<string, any> {
    const obj: Record<string, any> = {};
    for (const [key, value] of this.results.entries()) {
      obj[key] = value;
    }
    return obj;
  }
}
