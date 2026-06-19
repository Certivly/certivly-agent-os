import { TaskGraphNode, TaskGraphEdge } from '../models/AgentTask';

export class TaskGraph {
  public nodes: Map<string, TaskGraphNode> = new Map();
  public edges: TaskGraphEdge[] = [];

  addNode(node: TaskGraphNode) {
    this.nodes.set(node.id, node);
  }

  addEdge(from: string, to: string) {
    this.edges.push({ from, to });
    const toNode = this.nodes.get(to);
    if (toNode && !toNode.dependencies.includes(from)) {
      toNode.dependencies.push(from);
    }
  }

  getNode(id: string): TaskGraphNode | undefined {
    return this.nodes.get(id);
  }

  getIncomingEdges(nodeId: string): string[] {
    return this.edges.filter(e => e.to === nodeId).map(e => e.from);
  }

  getOutgoingEdges(nodeId: string): string[] {
    return this.edges.filter(e => e.from === nodeId).map(e => e.to);
  }

  updateNodeStatus(id: string, status: TaskGraphNode['status'], result?: any) {
    const node = this.nodes.get(id);
    if (node) {
      node.status = status;
      if (result) {
        node.result = result;
      }
    }
  }

  getReadyNodes(): TaskGraphNode[] {
    return Array.from(this.nodes.values()).filter(node => {
      if (node.status !== 'pending') return false;
      const deps = this.getIncomingEdges(node.id);
      return deps.every(depId => this.nodes.get(depId)?.status === 'completed');
    });
  }

  isComplete(): boolean {
    return Array.from(this.nodes.values()).every(n => n.status === 'completed');
  }

  hasFailed(): boolean {
    return Array.from(this.nodes.values()).some(n => n.status === 'failed');
  }
}
