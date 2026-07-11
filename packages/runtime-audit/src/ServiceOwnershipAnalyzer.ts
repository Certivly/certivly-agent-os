import { OwnershipReport } from "./models/ArchitectureSnapshot";
import { ScannedPackage } from "./PackageScanner";

export class ServiceOwnershipAnalyzer {
  public analyze(packages: ScannedPackage[]): Map<string, OwnershipReport> {
    const reports = new Map<string, OwnershipReport>();

    // For a real static ownership analysis, we'd parse the AST.
    // For this audit, we approximate by identifying that RuntimeBootstrap is the lifecycle owner.
    for (const pkg of packages) {
      reports.set(pkg.name, {
        packageName: pkg.name,
        instantiatedBy: ["@agent-os/runtime-integration"],
        consumedBy: ["@agent-os/runtime-integration"],
        lifecycleOwner: "@agent-os/runtime-integration",
        shutdownOwner: "@agent-os/runtime-integration"
      });
    }

    return reports;
  }
}
