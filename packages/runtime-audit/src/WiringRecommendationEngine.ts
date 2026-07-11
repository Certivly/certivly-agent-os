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
}
