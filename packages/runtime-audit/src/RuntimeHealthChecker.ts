import { ArchitectureSnapshot } from "./models/ArchitectureSnapshot";
import { WiringRecommendationEngine } from "./WiringRecommendationEngine";
import { BoundaryViolation } from "./BoundaryImportScanner";

export class RuntimeHealthChecker {
  public generateHealthReport(
    snapshot: ArchitectureSnapshot,
    boundaryViolations: BoundaryViolation[] = []
  ): string {
    let output = `Runtime Health Report\n\n`;

    for (const pkg of snapshot.packages) {
      output += `${pkg.name.padEnd(30, '.')} ${pkg.status}\n`;
    }

    if (snapshot.disconnectedPackages.length > 0) {
      output += `\nUnreachable Packages:\n`;
      for (const p of snapshot.disconnectedPackages) {
        output += ` - ${p}\n`;
      }
      output += `\nRecommendations:\n`;
      const recommendations = new WiringRecommendationEngine().generate(snapshot.disconnectedPackages);
      for (const rec of recommendations) {
        output += `Connect ${rec.packageName}: ${rec.suggestion}\n`;
      }
    } else {
      output += `\nAll packages are correctly wired.\n`;
    }

    if (boundaryViolations.length > 0) {
      output += `\nBoundary Violations (${boundaryViolations.length}):\n`;
      for (const v of boundaryViolations) {
        output += ` - [${v.type}] ${v.relativeFile}:${v.line} -> ${v.message}\n`;
      }
    } else {
      output += `No boundary import violations found.\n`;
    }

    return output;
  }
}
