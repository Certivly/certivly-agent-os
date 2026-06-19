import * as fs from 'fs';
import * as path from 'path';

export interface SessionSnapshot {
  sessionId: string;
  repositoryId: string;
  clientId: string;
  contextStack: any[];
  messages: any[];
  savedAt: number;
}

export class SessionSnapshotStore {
  private sessionsDir: string;

  constructor(dataDir: string) {
    this.sessionsDir = path.join(dataDir, 'sessions');
  }

  public async save(snapshot: SessionSnapshot): Promise<void> {
    await fs.promises.mkdir(this.sessionsDir, { recursive: true });
    const filePath = path.join(this.sessionsDir, `${snapshot.sessionId}.json`);
    await fs.promises.writeFile(filePath, JSON.stringify(snapshot, null, 2));
  }

  public async restore(sessionId: string): Promise<SessionSnapshot | null> {
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
    try {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(data) as SessionSnapshot;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  public async listSessions(): Promise<string[]> {
    try {
      const files = await fs.promises.readdir(this.sessionsDir);
      return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
    } catch (error: any) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
}
