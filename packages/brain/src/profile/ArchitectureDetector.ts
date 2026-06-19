export class ArchitectureDetector {
  public detect(directories: string[]): string | null {
    // Determine architecture style based on folders
    const hasFeatures = directories.includes("src/features");
    const hasPackages = directories.includes("packages");
    const hasAppRouter = directories.includes("src/app") || directories.includes("app");
    
    if (hasPackages) return "monorepo";
    if (hasFeatures) return "feature-based";
    if (hasAppRouter) return "app-router";

    return "standard";
  }
}
