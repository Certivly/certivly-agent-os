import { DependencyNode } from "./DependencyGraphBuilder";

export class RuntimeReachabilityAnalyzer {
  public analyze(graph: Map<string, DependencyNode>, entryPoints: string[]): {
    productionReachable: Set<string>;
    testOnly: Set<string>;
  } {
    const productionReachable = new Set<string>();
    const testOnly = new Set<string>();

    // BFS for production
    const queue = [...entryPoints];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (!productionReachable.has(curr)) {
        productionReachable.add(curr);
        const node = graph.get(curr);
        if (node) {
          queue.push(...node.dependencies);
        }
      }
    }

    // For testOnly, we would need to parse devDependencies edges too.
    // For now, if it's not in productionReachable, we can mark it testOnly if some package has it in devDependencies.
    // However, the DependencyGraphBuilder currently only maps production dependencies.
    // We will keep testOnly empty or deduce it if needed.

    return { productionReachable, testOnly };
  }
}
