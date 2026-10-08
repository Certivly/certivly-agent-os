import { TaskGraph } from './TaskGraph';

export class DependencyResolver {
  public resolve(graph: TaskGraph): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const processing = new Set<string>();

    const visit = (nodeId: string) => {
      if (processing.has(nodeId)) {
        throw new Error(`Cycle detected involving node ${nodeId}`);
      }
      if (visited.has(nodeId)) {
        return;
      }

      processing.add(nodeId);
      
      const deps = graph.getIncomingEdges(nodeId);
      for (const dep of deps) {
        visit(dep);
      }

      processing.delete(nodeId);
      visited.add(nodeId);
      sorted.push(nodeId);
    };

    for (const nodeId of graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        visit(nodeId);
      }
    }

    return sorted;
  }
}
