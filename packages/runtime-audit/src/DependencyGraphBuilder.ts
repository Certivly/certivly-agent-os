import { ScannedPackage } from "./PackageScanner";

export interface DependencyNode {
  packageName: string;
  dirName: string;
  dependencies: string[];
  dependents: string[];
}

export class DependencyGraphBuilder {
  public build(packages: ScannedPackage[]): Map<string, DependencyNode> {
    const graph = new Map<string, DependencyNode>();

    // Initialize nodes
    for (const pkg of packages) {
      graph.set(pkg.name, {
        packageName: pkg.name,
        dirName: pkg.dirName,
        dependencies: [],
        dependents: []
      });
    }

    // Populate edges
    for (const pkg of packages) {
      const node = graph.get(pkg.name)!;
      for (const dep of Object.keys(pkg.dependencies)) {
        if (graph.has(dep)) {
          node.dependencies.push(dep);
          graph.get(dep)!.dependents.push(pkg.name);
        }
      }
    }

    return graph;
  }
}
