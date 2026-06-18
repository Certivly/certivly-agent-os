import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { LocalWorkspaceSandbox } from "../src/local";
import { GitWorktreeSandbox } from "../src/worktree";
import { PatchEngine } from "../src/patch";
import * as path from "path";
import * as fs from "fs/promises";

// We'll use a temporary dummy workspace for tests instead of the main repo
// so we don't accidentally mess up real files if something goes wrong.

const DUMMY_WORKSPACE = path.join(process.cwd(), ".agentos", "test-workspace");

describe("Sandbox Environment", () => {
  beforeAll(async () => {
    // Setup dummy workspace
    await fs.mkdir(DUMMY_WORKSPACE, { recursive: true });
    await fs.writeFile(path.join(DUMMY_WORKSPACE, "test.txt"), "Hello World");
    
    // Initialize git repo in dummy workspace to test worktrees
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(exec);
    await execAsync("git init", { cwd: DUMMY_WORKSPACE });
    await execAsync("git add test.txt", { cwd: DUMMY_WORKSPACE });
    await execAsync(`git config user.email "test@example.com"`, { cwd: DUMMY_WORKSPACE });
    await execAsync(`git config user.name "Test User"`, { cwd: DUMMY_WORKSPACE });
    await execAsync(`git commit -m "Initial commit"`, { cwd: DUMMY_WORKSPACE });
  });

  afterAll(async () => {
    // Cleanup dummy workspace
    await fs.rm(DUMMY_WORKSPACE, { recursive: true, force: true });
  });

  test("LocalWorkspaceSandbox creation and execution", async () => {
    const sandbox = new LocalWorkspaceSandbox("test-local-1", DUMMY_WORKSPACE);
    
    await sandbox.create();
    
    // Test execution
    const res = await sandbox.execute("echo 'Hello Sandbox'");
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("Hello Sandbox");
    
    // Test file read
    const content = await sandbox.readFile("test.txt");
    expect(content).toBe("Hello World");
    
    // Test file write
    await sandbox.writeFile("new.txt", "New File");
    const newContent = await sandbox.readFile("new.txt");
    expect(newContent).toBe("New File");

    await sandbox.destroy();
  });

  test("GitWorktreeSandbox creation and patches", async () => {
    const sandbox = new GitWorktreeSandbox("test-worktree-1", DUMMY_WORKSPACE);
    
    await sandbox.create();
    
    const content = await sandbox.readFile("test.txt");
    expect(content).toBe("Hello World");
    
    // Modify file
    await sandbox.writeFile("test.txt", "Hello Worktree");
    
    // Test execution
    const res = await sandbox.execute("git status");
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("modified:   test.txt");

    // Generate patches
    const patches = await sandbox.generatePatches();
    expect(patches.length).toBe(1);
    expect(patches[0].filePath).toBe("test.txt");
    expect(patches[0].diff).toContain("-Hello World");
    expect(patches[0].diff).toContain("+Hello Worktree");

    await sandbox.destroy();
  });
});
