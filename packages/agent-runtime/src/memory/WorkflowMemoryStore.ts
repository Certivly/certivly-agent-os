import { Database } from 'bun:sqlite';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '@agent-os/shared';
import type { WorkflowMemoryRecord, WorkflowMemoryStore as IWorkflowMemoryStore } from '../loop/types';

export class WorkflowMemoryStore implements IWorkflowMemoryStore {
  private sqlite: Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.sqlite = new Database(dbPath);
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS workflow_memories (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        verdict TEXT NOT NULL,
        package_manager TEXT,
        passing_test_commands TEXT,
        passing_build_commands TEXT,
        failed_command_signatures TEXT,
        files_changed TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      );
    `);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_workflow_memories_verdict ON workflow_memories(verdict);`);
  }

  public computeHash(record: Omit<WorkflowMemoryRecord, 'id' | 'createdAt'>): string {
    const norm = {
      verdict: record.verdict,
      packageManager: record.packageManager || '',
      passingTestCommands: [...(record.passingTestCommands || [])].sort(),
      passingBuildCommands: [...(record.passingBuildCommands || [])].sort(),
      failedCommandSignatures: [...(record.failedCommandSignatures || [])].sort(),
    };
    return crypto.createHash('sha256').update(JSON.stringify(norm)).digest('hex');
  }

  public save(record: Omit<WorkflowMemoryRecord, 'id' | 'createdAt'>): boolean {
    if (record.verdict !== 'verified' && record.verdict !== 'failed') {
      return false;
    }

    const id = this.computeHash(record);
    const existing = this.sqlite
      .query(`SELECT id FROM workflow_memories WHERE id = ?`)
      .get(id);

    if (existing) {
      return false; // Duplicate ignored
    }

    const createdAt = new Date().toISOString();
    this.sqlite.run(
      `INSERT INTO workflow_memories (
        id, run_id, verdict, package_manager, passing_test_commands,
        passing_build_commands, failed_command_signatures, files_changed,
        notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        record.runId,
        record.verdict,
        record.packageManager || null,
        record.passingTestCommands ? JSON.stringify(record.passingTestCommands) : null,
        record.passingBuildCommands ? JSON.stringify(record.passingBuildCommands) : null,
        record.failedCommandSignatures ? JSON.stringify(record.failedCommandSignatures) : null,
        record.filesChanged ? JSON.stringify(record.filesChanged) : null,
        record.notes ? JSON.stringify(record.notes) : null,
        createdAt,
      ]
    );

    return true;
  }

  public getMemories(): WorkflowMemoryRecord[] {
    const rows = this.sqlite
      .query(`SELECT * FROM workflow_memories ORDER BY created_at DESC`)
      .all() as Array<{
        id: string;
        run_id: string;
        verdict: string;
        package_manager: string | null;
        passing_test_commands: string | null;
        passing_build_commands: string | null;
        failed_command_signatures: string | null;
        files_changed: string | null;
        notes: string | null;
        created_at: string;
      }>;

    return rows.map((r) => ({
      id: r.id,
      runId: r.run_id,
      verdict: r.verdict as 'verified' | 'failed',
      packageManager: r.package_manager || undefined,
      passingTestCommands: r.passing_test_commands ? JSON.parse(r.passing_test_commands) : undefined,
      passingBuildCommands: r.passing_build_commands ? JSON.parse(r.passing_build_commands) : undefined,
      failedCommandSignatures: r.failed_command_signatures ? JSON.parse(r.failed_command_signatures) : undefined,
      filesChanged: r.files_changed ? JSON.parse(r.files_changed) : undefined,
      notes: r.notes ? JSON.parse(r.notes) : undefined,
      createdAt: r.created_at,
    }));
  }

  public getKnownChecks(): string[] {
    const verified = this.sqlite
      .query(`SELECT passing_build_commands, passing_test_commands FROM workflow_memories WHERE verdict = 'verified'`)
      .all() as Array<{
        passing_build_commands: string | null;
        passing_test_commands: string | null;
      }>;

    const checksSet = new Set<string>();
    for (const r of verified) {
      if (r.passing_build_commands) {
        try {
          const arr = JSON.parse(r.passing_build_commands);
          if (Array.isArray(arr)) {
            arr.forEach((c: string) => checksSet.add(c));
          }
        } catch (err) {
          logger.warn('memory', 'parse.build_commands_failed', `Failed to parse passing_build_commands: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (r.passing_test_commands) {
        try {
          const arr = JSON.parse(r.passing_test_commands);
          if (Array.isArray(arr)) {
            arr.forEach((c: string) => checksSet.add(c));
          }
        } catch (err) {
          logger.warn('memory', 'parse.test_commands_failed', `Failed to parse passing_test_commands: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    return Array.from(checksSet);
  }

  public formatPromptHints(): string {
    const checks = this.getKnownChecks();
    if (checks.length === 0) return '';
    const lines = ['Known project checks:'];
    for (const check of checks) {
      lines.push(`- ${check}`);
    }
    return lines.join('\n');
  }

  public close(): void {
    try {
      this.sqlite.close();
    } catch (err) {
      logger.warn('memory', 'close.failed', `Failed to close workflow memory db: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
