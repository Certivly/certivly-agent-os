import { TaskNode, TaskDependency } from "./models";

export class TaskGraph {
  private nodes: Map<string, TaskNode> = new Map();
  private edges: Map<string, string[]> = new Map(); // from -> to[]
  private reverseEdges: Map<string, string[]> = new Map(); // to -> from[]

  public addNode(node: TaskNode) {
    this.nodes.set(node.id, node);
    if (!this.edges.has(node.id)) this.edges.set(node.id, []);
    if (!this.reverseEdges.has(node.id)) this.reverseEdges.set(node.id, []);
  }

  public addDependency(dep: TaskDependency) {
    if (!this.nodes.has(dep.fromTaskId) || !this.nodes.has(dep.toTaskId)) {
      throw new Error(`Cannot add dependency. Missing nodes: ${dep.fromTaskId} -> ${dep.toTaskId}`);
    }
    
    // from -> to
    const fromEdges = this.edges.get(dep.fromTaskId) || [];
    fromEdges.push(dep.toTaskId);
    this.edges.set(dep.fromTaskId, fromEdges);

    // to depends on from
    const toEdges = this.reverseEdges.get(dep.toTaskId) || [];
    toEdges.push(dep.fromTaskId);
    this.reverseEdges.set(dep.toTaskId, toEdges);

    // Update node dependencies array for quick access
    const node = this.nodes.get(dep.toTaskId)!;
    if (!node.dependencies.includes(dep.fromTaskId)) {
      node.dependencies.push(dep.fromTaskId);
    }
  }

  public getReadyNodes(): TaskNode[] {
    const ready: TaskNode[] = [];
    for (const [id, node] of this.nodes.entries()) {
      if (node.status === "pending") {
        const deps = this.reverseEdges.get(id) || [];
        const allDepsCompleted = deps.every(depId => this.nodes.get(depId)?.status === "completed");
        if (allDepsCompleted) {
          ready.push(node);
        }
      }
    }
    return ready;
  }

  public updateNodeStatus(id: string, status: "pending" | "running" | "completed" | "failed") {
    const node = this.nodes.get(id);
    if (node) {
      node.status = status;
    }
  }

  public hasFailedNodes(): boolean {
    for (const node of this.nodes.values()) {
      if (node.status === "failed") return true;
    }
    return false;
  }

  public isComplete(): boolean {
    for (const node of this.nodes.values()) {
      if (node.status !== "completed") return false;
    }
    return true;
  }

  public getNodes(): TaskNode[] {
    return Array.from(this.nodes.values());
  }

  public detectCycles(): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const checkCycle = (nodeId: string): boolean => {
      if (recStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      recStack.add(nodeId);

      const children = this.edges.get(nodeId) || [];
      for (const child of children) {
        if (checkCycle(child)) return true;
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (checkCycle(nodeId)) return true;
    }

    return false;
  }
}
