import * as fs from 'fs';
import * as path from 'path';
import type { ChangeSet, ChangeSetFile } from '../models/ChangeSet';

import { generateUnifiedDiff } from '@agent-os/shared';

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
        } catch (_err) {
          // best-effort: candidate file may have already been removed
        }
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
        const diff = generateUnifiedDiff('', content, file.path);
        if (diff) chunks.push(diff.trim());
      } else if (file.kind === 'delete') {
        const diff = generateUnifiedDiff(file.before || '', '', file.path);
        if (diff) chunks.push(diff.trim());
      } else {
        const diff = generateUnifiedDiff(file.before || '', file.afterContent || '', file.path);
        if (diff) chunks.push(diff.trim());
      }
    }

    return chunks.join('\n\n') + (chunks.length > 0 ? '\n' : '');
  }
}
