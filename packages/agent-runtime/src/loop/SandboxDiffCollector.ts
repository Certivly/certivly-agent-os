import {
  ChangeSet,
  ChangeSetFile,
  ChangeKind,
  normalizeChangePath,
  computeSha256,
} from '@agent-os/patch-engine';
import * as path from 'path';
import * as fs from 'fs';
import * as childProcess from 'child_process';

export interface DiffCollectorOptions {
  workspaceRoot: string; // original workspace
  sandboxRoot: string; // worktree or temp copy
  runId: string;
}

export class SandboxDiffCollector {
  /**
   * Computes the unified diff between sandboxRoot and workspaceRoot,
   * returning a ChangeSet. Returns null if there are no changes.
   */
  public static collect(options: DiffCollectorOptions): ChangeSet | null {
    const { workspaceRoot, sandboxRoot, runId } = options;
    if (!fs.existsSync(workspaceRoot) || !fs.existsSync(sandboxRoot)) {
      return null;
    }

    try {
      const proc = childProcess.spawnSync(
        'git',
        ['diff', '--no-index', '--unified=3', workspaceRoot, sandboxRoot],
        {
          encoding: 'utf8',
          maxBuffer: 10 * 1024 * 1024,
        }
      );

      const rawDiff = proc.stdout || '';
      if (!rawDiff || rawDiff.trim().length === 0) {
        return null;
      }

      return this.parseDiffIntoChangeSet(rawDiff, runId, workspaceRoot, sandboxRoot);
    } catch (_err: unknown) {
      return null;
    }
  }

  public static parseDiffIntoChangeSet(
    rawDiff: string,
    runId: string,
    workspaceRoot?: string,
    sandboxRoot?: string
  ): ChangeSet | null {
    if (!rawDiff || rawDiff.trim().length === 0) {
      return null;
    }

    // Split raw diff into individual file diff chunks
    const chunks = rawDiff.split(/(?:^|\n)(?=diff --git )/).filter(c => c.trim().length > 0);
    const files: ChangeSetFile[] = [];

    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      const firstLine = lines[0] || '';

      let rawLine = firstLine.replace(/^diff --git\s+/, '').trim();
      let partA = '';
      let partB = '';

      if (rawLine.startsWith('"')) {
        const endQuote = rawLine.indexOf('"', 1);
        if (endQuote !== -1) {
          partA = rawLine.slice(1, endQuote);
          rawLine = rawLine.slice(endQuote + 1).trim();
        }
      } else {
        const spaceIdx = rawLine.indexOf(' ');
        if (spaceIdx !== -1) {
          partA = rawLine.slice(0, spaceIdx);
          rawLine = rawLine.slice(spaceIdx + 1).trim();
        }
      }

      if (rawLine.startsWith('"') && rawLine.endsWith('"')) {
        partB = rawLine.slice(1, -1);
      } else {
        partB = rawLine;
      }

      const stripPrefix = (p: string) => {
        let s = p.trim().replace(/\\+/g, '/');
        while (s.includes('//')) {
          s = s.replace(/\/\//g, '/');
        }
        if (s.startsWith('a/') || s.startsWith('b/')) {
          s = s.slice(2);
        }
        return s;
      };

      const cleanPath = (res: string) => {
        res = stripPrefix(res);
        while (res.includes('//')) {
          res = res.replace(/\/\//g, '/');
        }
        if (workspaceRoot) {
          let normWs = path.resolve(workspaceRoot).replace(/\\+/g, '/');
          while (normWs.includes('//')) {
            normWs = normWs.replace(/\/\//g, '/');
          }
          if (res.startsWith(normWs + '/')) {
            res = res.slice(normWs.length + 1);
          } else if (res.toLowerCase().startsWith(normWs.toLowerCase() + '/')) {
            res = res.slice(normWs.length + 1);
          }
        }
        if (sandboxRoot) {
          let normSb = path.resolve(sandboxRoot).replace(/\\+/g, '/');
          while (normSb.includes('//')) {
            normSb = normSb.replace(/\/\//g, '/');
          }
          if (res.startsWith(normSb + '/')) {
            res = res.slice(normSb.length + 1);
          } else if (res.toLowerCase().startsWith(normSb.toLowerCase() + '/')) {
            res = res.slice(normSb.length + 1);
          }
        }
        return normalizeChangePath(res);
      };

      const relA = cleanPath(partA);
      const relB = cleanPath(partB);

      let kind: ChangeKind = 'modify';
      for (const line of lines) {
        if (line.startsWith('new file mode') || line.startsWith('--- /dev/null')) {
          kind = 'create';
        } else if (line.startsWith('deleted file mode') || line.startsWith('+++ /dev/null')) {
          kind = 'delete';
        }
      }

      const filePath = kind === 'delete' ? relA : (relB || relA);
      if (!filePath) continue;

      if (
        filePath === '.agentos' ||
        filePath.startsWith('.agentos/') ||
        filePath === '.git' ||
        filePath.startsWith('.git/')
      ) {
        continue;
      }

      let beforeHash: string | undefined;
      let afterHash: string | undefined;
      let afterContent: string | undefined;

      if (workspaceRoot && kind !== 'create') {
        const fullWsPath = path.resolve(workspaceRoot, filePath);
        if (fs.existsSync(fullWsPath)) {
          beforeHash = computeSha256(fs.readFileSync(fullWsPath));
        }
      }

      if (sandboxRoot && kind !== 'delete') {
        const fullSbPath = path.resolve(sandboxRoot, filePath);
        if (fs.existsSync(fullSbPath)) {
          const content = fs.readFileSync(fullSbPath, 'utf8');
          afterHash = computeSha256(content);
          afterContent = content;
        }
      }

      files.push({
        path: filePath,
        kind,
        before: beforeHash,
        after: afterHash,
        diff: chunk.trim(),
        afterContent,
      });
    }

    if (files.length === 0) {
      return null;
    }

    return {
      id: runId,
      workspaceRoot: workspaceRoot || '',
      files,
      createdAt: new Date().toISOString(),
    };
  }
}
