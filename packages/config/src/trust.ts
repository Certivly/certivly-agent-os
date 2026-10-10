import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface TrustedWorkspaceRecord {
  trustedAt: string;
}

export type TrustedWorkspacesMap = Record<string, TrustedWorkspaceRecord>;

export class WorkspaceTrustManager {
  private trustStorePath: string;

  constructor(customStorePath?: string) {
    this.trustStorePath =
      customStorePath || path.join(os.homedir(), '.agentos', 'trusted-workspaces.json');
  }

  public isWorkspaceTrusted(workspaceRoot: string): boolean {
    const norm = this.normalize(workspaceRoot);
    const store = this.loadStore();
    return Boolean(store[norm]);
  }

  public trustWorkspace(workspaceRoot: string): void {
    const norm = this.normalize(workspaceRoot);
    const store = this.loadStore();
    store[norm] = { trustedAt: new Date().toISOString() };
    this.saveStore(store);
  }

  public revokeWorkspace(workspaceRoot: string): void {
    const norm = this.normalize(workspaceRoot);
    const store = this.loadStore();
    delete store[norm];
    this.saveStore(store);
  }

  public listTrusted(): string[] {
    const store = this.loadStore();
    return Object.keys(store);
  }

  private normalize(dirPath: string): string {
    const resolved = path.resolve(dirPath);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }

  private loadStore(): TrustedWorkspacesMap {
    if (!fs.existsSync(this.trustStorePath)) {
      return {};
    }
    try {
      const content = fs.readFileSync(this.trustStorePath, 'utf8');
      return JSON.parse(content);
    } catch (_err: unknown) {
      return {};
    }
  }

  private saveStore(store: TrustedWorkspacesMap): void {
    const dir = path.dirname(this.trustStorePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.trustStorePath, JSON.stringify(store, null, 2), { mode: 0o600 });
  }
}
