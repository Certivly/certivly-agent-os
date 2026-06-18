import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { LocalWorkspaceSandbox } from "../src/local";
import { GitWorktreeSandbox } from "../src/worktree";
import { PatchEngine } from "../src/patch";
import * as path from "path";
import * as fs from "fs/promises";

// We'll use a temporary dummy workspace for tests instead of the main repo
// so we don't accidentally mess up real files if something goes wrong.

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

describe("Sandbox Environment", () => {
  const TEST_WORKSPACE = path.join(process.cwd(), "sandbox-test-workspace");

  beforeAll(async () => {
    // Setup a dummy workspace with git
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
    await execAsync("git init", { cwd: TEST_WORKSPACE });
    await fs.writeFile(path.join(TEST_WORKSPACE, "test.txt"), "hello world");
    await execAsync("git add test.txt", { cwd: TEST_WORKSPACE });
    await execAsync('git config user.email "test@example.com"', { cwd: TEST_WORKSPACE });
    await execAsync('git config user.name "Test User"', { cwd: TEST_WORKSPACE });
    await execAsync('git commit -m "initial commit"', { cwd: TEST_WORKSPACE });
  });

  afterAll(async () => {
    // Cleanup dummy workspace
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  test("LocalWorkspaceSandbox creation and execution", async () => {
    const sandbox = new LocalWorkspaceSandbox("test-local-1", TEST_WORKSPACE);
    await sandbox.create();

    const fileContent = await sandbox.readFile("test.txt");
    expect(fileContent).toBe("hello world");

    await sandbox.writeFile("new.txt", "new file");
    
    const res = await sandbox.execute(`bun -e "process.stdout.write(require('fs').readFileSync('new.txt', 'utf8'))"`);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe("new file");

    await sandbox.destroy();
  });

  test("GitWorktreeSandbox creation and patches", async () => {
    const sandbox = new GitWorktreeSandbox("test-worktree-1", TEST_WORKSPACE);
    await sandbox.create();

    const fileContent = await sandbox.readFile("test.txt");
    expect(fileContent).toBe("hello world");

    await sandbox.writeFile("test.txt", "hello agentos");
    
    const res = await sandbox.execute("git status");
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("modified:   test.txt");

    // Generate patches
    const patches = await sandbox.generatePatch();
    expect(patches).toHaveLength(1);
    expect(patches[0].filePath).toBe("test.txt");
    expect(patches[0].diff).toContain("-hello world");
    expect(patches[0].diff).toContain("+hello agentos");

    await sandbox.destroy();
  });
});
