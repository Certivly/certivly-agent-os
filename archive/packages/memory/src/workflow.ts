import { Database } from 'bun:sqlite';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface WorkflowMemoryRecord {
  id: string;
  runId: string;
  verdict: 'verified' | 'failed';
  packageManager?: string;
  passingTestCommands?: string[];
  passingBuildCommands?: string[];
  failedCommandSignatures?: string[];
  filesChanged?: string[];
  notes?: string[];
  createdAt: string;
}

export class WorkflowMemoryStore {
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
      .all() as any[];

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
      .all() as any[];

    const checksSet = new Set<string>();
    for (const r of verified) {
      if (r.passing_build_commands) {
        try {
          const arr = JSON.parse(r.passing_build_commands);
          if (Array.isArray(arr)) arr.forEach((c) => checksSet.add(c));
        } catch {}
      }
      if (r.passing_test_commands) {
        try {
          const arr = JSON.parse(r.passing_test_commands);
          if (Array.isArray(arr)) arr.forEach((c) => checksSet.add(c));
        } catch {}
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
    } catch {}
  }
}
