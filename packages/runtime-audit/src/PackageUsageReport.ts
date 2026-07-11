import { ArchitectureSnapshot } from "./models/ArchitectureSnapshot";

export class PackageUsageReport {
  public generateReachability(snapshot: ArchitectureSnapshot): string {
    let output = `Reachability Report\n===================\n\n`;
    for (const pkg of snapshot.packages) {
      output += `${pkg.name}\n`;
      output += `  Status: ${pkg.status}\n`;
      output += `  Production Reachable: ${pkg.reachability.productionReachable}\n\n`;
    }
    return output;
  }

  public generateOwnership(snapshot: ArchitectureSnapshot): string {
    let output = `Ownership Report\n================\n\n`;
    for (const pkg of snapshot.packages) {
      output += `${pkg.name}\n`;
      output += `  Instantiated By: ${pkg.ownership.instantiatedBy.join(', ')}\n`;
      output += `  Lifecycle Owner: ${pkg.ownership.lifecycleOwner}\n\n`;
    }
    return output;
  }

  public generateDead(snapshot: ArchitectureSnapshot): string {
    let output = `Dead Packages\n=============\n\n`;
    for (const dead of snapshot.deadPackages) {
      output += `${dead}\n  Reason: No production runtime path found.\n\n`;
    }
    return output;
  }

  public generateStubbed(snapshot: ArchitectureSnapshot): string {
    let output = `Stub Report\n===========\n\n`;
    for (const stub of snapshot.stubbedPackages) {
      output += `${stub}\n  Status: STUBBED\n  Production Usage: 0\n\n`;
    }
    return output;
  }

  public generateGraph(snapshot: ArchitectureSnapshot): string {
    let output = `Runtime Graph\n=============\n\n`;
    for (const path of snapshot.runtimePaths) {
      output += path.callChain.join('\n   ↓\n') + '\n\n';
    }
    return output;
  }
}
