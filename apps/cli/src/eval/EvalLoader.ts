import * as fs from 'fs';
import * as path from 'path';
import type { EvalTask, EvalTaskMeta, VerifierType } from './EvalTypes';

export class EvalLoader {
  public static getDefaultTasksRoot(): string {
    // Check relative to current working directory or search upwards
    let curr = process.cwd();
    while (true) {
      const candidate = path.join(curr, 'evals', 'tasks');
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      const parent = path.dirname(curr);
      if (parent === curr) break;
      curr = parent;
    }
    return path.resolve(process.cwd(), 'evals', 'tasks');
  }

  public static isVerifierFile(filePathOrName: string): boolean {
    const base = path.basename(filePathOrName);
    return /^verify\.(ts|sh|js)$/i.test(base);
  }

  public static async listTasks(tasksRoot?: string): Promise<string[]> {
    const root = tasksRoot || this.getDefaultTasksRoot();
    if (!fs.existsSync(root)) {
      return [];
    }

    const entries = fs.readdirSync(root, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();
  }

  public static async loadTask(taskId: string, tasksRoot?: string): Promise<EvalTask> {
    const root = tasksRoot || this.getDefaultTasksRoot();
    const taskDir = path.resolve(root, taskId);

    if (!fs.existsSync(taskDir) || !fs.statSync(taskDir).isDirectory()) {
      throw new Error(`Eval task directory not found: ${taskId} at ${taskDir}`);
    }

    // 1. Validate prompt.md
    const promptPath = path.join(taskDir, 'prompt.md');
    if (!fs.existsSync(promptPath) || !fs.statSync(promptPath).isFile()) {
      throw new Error(`Task '${taskId}' is missing prompt.md`);
    }
    const promptContent = fs.readFileSync(promptPath, 'utf8');

    // 2. Validate repo directory
    const repoDir = fs.existsSync(path.join(taskDir, 'repo'))
      ? path.join(taskDir, 'repo')
      : path.join(taskDir, 'workspace');
    if (!fs.existsSync(repoDir) || !fs.statSync(repoDir).isDirectory()) {
      throw new Error(`Task '${taskId}' is missing repo directory`);
    }

    // 3. Validate verifier file (verify.ts, verify.sh, verify.js)
    let verifierPath = '';
    let verifierType: VerifierType = 'ts';
    if (fs.existsSync(path.join(taskDir, 'verify.ts'))) {
      verifierPath = path.join(taskDir, 'verify.ts');
      verifierType = 'ts';
    } else if (fs.existsSync(path.join(taskDir, 'verify.sh'))) {
      verifierPath = path.join(taskDir, 'verify.sh');
      verifierType = 'sh';
    } else if (fs.existsSync(path.join(taskDir, 'verify.js'))) {
      verifierPath = path.join(taskDir, 'verify.js');
      verifierType = 'js';
    } else {
      throw new Error(`Task '${taskId}' is missing verifier (verify.ts or verify.sh)`);
    }

    // 4. Validate meta.json
    const metaPath = path.join(taskDir, 'meta.json');
    if (!fs.existsSync(metaPath) || !fs.statSync(metaPath).isFile()) {
      throw new Error(`Task '${taskId}' has invalid meta.json (file missing)`);
    }

    let meta: EvalTaskMeta;
    try {
      const metaContent = fs.readFileSync(metaPath, 'utf8');
      meta = JSON.parse(metaContent);
      if (!meta || typeof meta !== 'object' || typeof meta.id !== 'string' || !meta.id.trim()) {
        throw new Error('meta.json must be an object containing a non-empty string "id"');
      }
    } catch (err: any) {
      throw new Error(`Task '${taskId}' has invalid meta.json: ${err.message || String(err)}`);
    }

    return {
      id: taskId,
      taskDir,
      repoDir,
      promptPath,
      promptContent,
      verifierPath,
      verifierType,
      meta,
      metaPath,
    };
  }

  public static async loadAllTasks(tasksRoot?: string): Promise<EvalTask[]> {
    const taskIds = await this.listTasks(tasksRoot);
    const tasks: EvalTask[] = [];
    for (const id of taskIds) {
      tasks.push(await this.loadTask(id, tasksRoot));
    }
    return tasks;
  }

  public static async prepareWorkspace(task: EvalTask, destinationDir: string): Promise<void> {
    fs.mkdirSync(destinationDir, { recursive: true });

    // Copy repo directory contents to destinationDir
    // Exclude any verifier files from agent workspace
    const copyRecursive = (src: string, dest: string) => {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        if (this.isVerifierFile(entry.name)) {
          // Never copy verifier into agent workspace
          continue;
        }
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
          fs.mkdirSync(destPath, { recursive: true });
          copyRecursive(srcPath, destPath);
        } else if (entry.isFile()) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };

    copyRecursive(task.repoDir, destinationDir);
  }

  public static async copyVerifier(task: EvalTask, destinationDir: string): Promise<string> {
    const filename = path.basename(task.verifierPath);
    const destPath = path.join(destinationDir, filename);
    fs.copyFileSync(task.verifierPath, destPath);
    return destPath;
  }
}
