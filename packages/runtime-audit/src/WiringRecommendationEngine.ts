export interface WiringRecommendation {
  packageName: string;
  issue: string;
  suggestion: string;
}

export class WiringRecommendationEngine {
  public generate(disconnectedPackages: string[]): WiringRecommendation[] {
    return disconnectedPackages.map(pkg => ({
      packageName: pkg,
      issue: 'Never instantiated or disconnected from production path.',
      suggestion: `Wire ${pkg} into RuntimeContainer -> RuntimeBootstrap, or ensure it is imported by an active package.`
    }));
  }

  public generateDetailed(options: {
    disconnectedPackages?: string[];
    stubbedPackages?: string[];
    violations?: Array<{ importPath: string; type: string; file: string }>;
  }): WiringRecommendation[] {
    const recs: WiringRecommendation[] = [];

    for (const pkg of (options.disconnectedPackages ?? [])) {
      recs.push({
        packageName: pkg,
        issue: 'Never instantiated or disconnected from production path.',
        suggestion: `Wire ${pkg} into RuntimeContainer -> RuntimeBootstrap, or ensure it is imported by an active package.`
      });
    }

    for (const pkg of (options.stubbedPackages ?? [])) {
      recs.push({
        packageName: pkg,
        issue: 'Package contains incomplete stub implementations or mock placeholders.',
        suggestion: `Implement concrete logic for ${pkg} or replace mock bindings with production instances.`
      });
    }

    for (const v of (options.violations ?? [])) {
      recs.push({
        packageName: v.file,
        issue: `Boundary violation (${v.type}): ${v.importPath}`,
        suggestion: `Replace deep internal import or relative path with public package export via index.ts.`
      });
    }

    return recs;
  }
}
