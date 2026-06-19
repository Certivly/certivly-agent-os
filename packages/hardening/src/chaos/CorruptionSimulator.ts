import * as fs from 'fs';
import * as path from 'path';

export class CorruptionSimulator {
  constructor(private dataDir: string) {}

  public async corruptSessionFiles() {
    const sessionsDir = path.join(this.dataDir, 'sessions');
    if (!fs.existsSync(sessionsDir)) return;

    const files = await fs.promises.readdir(sessionsDir);
    for (const file of files) {
      if (file.endsWith('.json') && Math.random() > 0.5) {
        // Write invalid JSON
        await fs.promises.writeFile(path.join(sessionsDir, file), "{ corrupted: true, missing_brace: ");
      }
    }
  }

  public async corruptDaemonState() {
    const stateFile = path.join(this.dataDir, 'state.json');
    if (fs.existsSync(stateFile)) {
      // Overwrite with empty object to simulate partial write
      await fs.promises.writeFile(stateFile, "{}");
    }
  }
}
