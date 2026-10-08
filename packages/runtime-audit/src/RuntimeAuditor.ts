import { ArchitectureSnapshot, PackageNode, PackageStatus } from "./models/ArchitectureSnapshot";
import { PackageScanner } from "./PackageScanner";
import { DependencyGraphBuilder } from "./DependencyGraphBuilder";
import { RuntimeReachabilityAnalyzer } from "./RuntimeReachabilityAnalyzer";
import { StubDetector } from "./StubDetector";
import { DeadPackageDetector } from "./DeadPackageDetector";
import { ServiceOwnershipAnalyzer } from "./ServiceOwnershipAnalyzer";
import { RuntimePathAnalyzer } from "./RuntimePathAnalyzer";
import { LoggingEventBus } from "@agent-os/shared";

export class RuntimeAuditor {
  constructor(
    private eventBus: LoggingEventBus,
    private workspaceRoot: string
  ) { }

  public async audit(): Promise<ArchitectureSnapshot> {
    this.eventBus.publish("runtime.audit.started", {});

    const scanner = new PackageScanner(this.workspaceRoot);
    const packages = await scanner.scanPackages();
    packages.forEach(p => this.eventBus.publish("runtime.package.discovered", { name: p.name }));

    const graphBuilder = new DependencyGraphBuilder();
    const graph = graphBuilder.build(packages);

    const pathAnalyzer = new RuntimePathAnalyzer();
    const runtimePaths = pathAnalyzer.analyze();

    const reachabilityAnalyzer = new RuntimeReachabilityAnalyzer();
    // Assuming entry points are the ones from runtime paths
    const entryPoints = ["@agent-os/cli"];
    const { productionReachable, testOnly } = reachabilityAnalyzer.analyze(graph, entryPoints);

    const stubDetector = new StubDetector();
    const stubbedPackages = await stubDetector.detectStubs(this.workspaceRoot);

    const deadPackageDetector = new DeadPackageDetector();
    const deadPackages = deadPackageDetector.detect(packages, productionReachable, testOnly);

    const ownershipAnalyzer = new ServiceOwnershipAnalyzer();
    const ownershipReports = ownershipAnalyzer.analyze(packages);

    const disconnectedPackages = deadPackages;

    const packageNodes: PackageNode[] = packages.map(pkg => {
      let status: PackageStatus = 'ACTIVE';
      if (deadPackages.includes(pkg.name)) status = 'DEAD';
      else if (stubbedPackages.includes(pkg.name)) status = 'STUBBED';
      else if (testOnly.has(pkg.name)) status = 'TEST_ONLY';
      else if (!productionReachable.has(pkg.name)) status = 'DISCONNECTED';

      if (status === 'DEAD') this.eventBus.publish("runtime.package.dead", { name: pkg.name });
      if (status === 'STUBBED') this.eventBus.publish("runtime.package.stubbed", { name: pkg.name });

      return {
        name: pkg.name,
        status,
        reachability: {
          packageName: pkg.name,
          reachable: productionReachable.has(pkg.name) || testOnly.has(pkg.name),
          productionReachable: productionReachable.has(pkg.name),
          testOnly: testOnly.has(pkg.name),
          dead: status === 'DEAD',
          entryPoints: status !== 'DEAD' ? ["@agent-os/cli"] : []
        },
        ownership: ownershipReports.get(pkg.name)!,
        dependencies: graph.get(pkg.name)!.dependencies,
        dependents: graph.get(pkg.name)!.dependents
      };
    });

    const snapshot: ArchitectureSnapshot = {
      timestamp: new Date().toISOString(),
      packages: packageNodes,
      runtimePaths,
      deadPackages,
      stubbedPackages,
      disconnectedPackages
    };

    this.eventBus.publish("runtime.audit.completed", { snapshot });
    return snapshot;
  }
}
