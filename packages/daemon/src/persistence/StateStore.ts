import * as fs from 'fs';
import * as path from 'path';

export interface DaemonState {
  version: string;
  repositories: Array<{ id: string; rootPath: string }>;
  lastSavedAt: number;
}

export class StateStore {
  private stateFilePath: string;

  constructor(dataDir: string) {
    this.stateFilePath = path.join(dataDir, 'state.json');
  }

  public async saveState(state: DaemonState): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.stateFilePath), { recursive: true });
    await fs.promises.writeFile(this.stateFilePath, JSON.stringify(state, null, 2));
  }

  public async loadState(): Promise<DaemonState | null> {
    try {
      const data = await fs.promises.readFile(this.stateFilePath, 'utf-8');
      return JSON.parse(data) as DaemonState;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }
}
