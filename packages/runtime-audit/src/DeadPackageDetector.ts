import { ScannedPackage } from "./PackageScanner";

export class DeadPackageDetector {
  public detect(
    packages: ScannedPackage[],
    productionReachable: Set<string>,
    testOnly: Set<string>
  ): string[] {
    const deadPackages: string[] = [];

    for (const pkg of packages) {
      if (!productionReachable.has(pkg.name) && !testOnly.has(pkg.name)) {
        deadPackages.push(pkg.name);
      }
    }

    return deadPackages;
  }
}
