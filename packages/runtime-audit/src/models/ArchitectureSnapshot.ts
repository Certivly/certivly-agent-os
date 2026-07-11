export type PackageStatus = 'ACTIVE' | 'DISCONNECTED' | 'STUBBED' | 'TEST_ONLY' | 'DEAD';

export interface PackageReachability {
  packageName: string;
  reachable: boolean;
  productionReachable: boolean;
  testOnly: boolean;
  dead: boolean;
  entryPoints: string[];
}

export interface OwnershipReport {
  packageName: string;
  instantiatedBy: string[];
  consumedBy: string[];
  lifecycleOwner?: string;
  shutdownOwner?: string;
}

export interface PackageNode {
  name: string;
  status: PackageStatus;
  reachability: PackageReachability;
  ownership: OwnershipReport;
  dependencies: string[];
  dependents: string[];
}

export interface RuntimePath {
  source: string;
  target: string;
  callChain: string[];
}

export interface ArchitectureSnapshot {
  timestamp: string;
  packages: PackageNode[];
  runtimePaths: RuntimePath[];
  deadPackages: string[];
  stubbedPackages: string[];
  disconnectedPackages: string[];
}
