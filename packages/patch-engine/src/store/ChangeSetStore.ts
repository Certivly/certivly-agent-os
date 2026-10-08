import * as fs from 'fs';
import * as path from 'path';
import type { ChangeSet, ChangeSetFile } from '../models/ChangeSet';

export class ChangeSetStore {
  constructor(private outputDir: string = '.agentos/changesets') {}

  public save(changeSet: ChangeSet): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    const filePath = path.join(this.outputDir, `${changeSet.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(changeSet, null, 2), 'utf8');
  }

  public load(runId: string): ChangeSet | null {
    const candidates = [
      path.join(this.outputDir, `${runId}.json`),
      path.join(process.cwd(), '.agentos', 'changesets', `${runId}.json`),
      path.join(process.cwd(), '.agentos', 'patches', `${runId}.json`),
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        try {
          return JSON.parse(fs.readFileSync(c, 'utf8'));
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  public delete(runId: string): boolean {
    const candidates = [
      path.join(this.outputDir, `${runId}.json`),
      path.join(process.cwd(), '.agentos', 'changesets', `${runId}.json`),
      path.join(process.cwd(), '.agentos', 'patches', `${runId}.json`),
    ];

    let deleted = false;
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        try {
          fs.unlinkSync(c);
          deleted = true;
        } catch {}
      }
    }
    return deleted;
  }

  public static toUnifiedDiff(changeSet: ChangeSet): string {
    const chunks: string[] = [];

    for (const file of changeSet.files) {
      if (file.diff && file.diff.trim().length > 0) {
        chunks.push(file.diff.trim());
      } else if (file.kind === 'add' || (file.kind as string) === 'create') {
        const content = file.afterContent || '';
        const lines = content.split('\n');
        chunks.push(
          `--- /dev/null\n+++ b/${file.path}\n@@ -0,0 +1,${lines.length} @@\n` +
            lines.map(l => `+${l}`).join('\n')
        );
      } else if (file.kind === 'delete') {
        chunks.push(`--- a/${file.path}\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-deleted`);
      } else {
        chunks.push(`--- a/${file.path}\n+++ b/${file.path}\n@@ -1 +1 @@\n# modified ${file.path}`);
      }
    }

    return chunks.join('\n\n') + (chunks.length > 0 ? '\n' : '');
  }
}
