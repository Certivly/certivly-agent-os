import { ArchitectureSnapshot } from "./models/ArchitectureSnapshot";
import { WiringRecommendationEngine } from "./WiringRecommendationEngine";

export class RuntimeHealthChecker {
  public generateHealthReport(snapshot: ArchitectureSnapshot): string {
    let output = `Runtime Health Report\n\n`;

    for (const pkg of snapshot.packages) {
      output += `${pkg.name.padEnd(30, '.')} ${pkg.status}\n`;
    }

    if (snapshot.disconnectedPackages.length > 0) {
      output += `\nRecommendations:\n`;
      const recommendations = new WiringRecommendationEngine().generate(snapshot.disconnectedPackages);
      for (const rec of recommendations) {
        output += `Connect ${rec.packageName}: ${rec.suggestion}\n`;
      }
    } else {
      output += `\nAll packages are correctly wired.\n`;
    }

    return output;
  }
}
