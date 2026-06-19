export class FrameworkDetector {
  public detect(packageJson: any): string | null {
    if (!packageJson || !packageJson.dependencies) return null;
    
    if (packageJson.dependencies["next"]) return "Next.js";
    if (packageJson.dependencies["react"]) return "React";
    if (packageJson.dependencies["vue"]) return "Vue";
    if (packageJson.dependencies["@angular/core"]) return "Angular";
    if (packageJson.dependencies["express"]) return "Express";
    if (packageJson.dependencies["nestjs"]) return "NestJS";

    return null;
  }

  public detectPackageManager(files: string[]): string | null {
    if (files.includes("pnpm-lock.yaml")) return "pnpm";
    if (files.includes("yarn.lock")) return "yarn";
    if (files.includes("package-lock.json")) return "npm";
    if (files.includes("bun.lockb")) return "bun";
    return null;
  }

  public detectTestingFramework(packageJson: any): string | null {
    if (!packageJson || !packageJson.devDependencies) return null;
    
    if (packageJson.devDependencies["jest"]) return "jest";
    if (packageJson.devDependencies["vitest"]) return "vitest";
    if (packageJson.devDependencies["cypress"]) return "cypress";
    if (packageJson.devDependencies["playwright"]) return "playwright";

    return null;
  }
}
