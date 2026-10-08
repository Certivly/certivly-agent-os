import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import {
  CommandPolicyEngine,
  commandPolicyEngine,
  hasShellOperators,
  isSafeCommand,
  isReadOnlyCommand,
  truncateOutput,
  runCommandTool,
} from '../src';

describe('Action 2.04: Command Policy and Execution', () => {
  const tmpDir = path.resolve(__dirname, '.tmp-command-policy-' + Date.now());

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    commandPolicyEngine.setMode('workspace-write');
    commandPolicyEngine.setApprovalCallback(async () => false);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    commandPolicyEngine.setMode('workspace-write');
  });

  describe('Policy Engine: 40+ Command Strings Analysis', () => {
    const testCases: Array<{
      cmd: string;
      compound: boolean;
      readOnly: boolean;
      workspaceWriteSafe: boolean;
    }> = [
      // 1-15: Compound, operator, or shell redirection injection
      { cmd: 'ls; rm -rf x', compound: true, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'cat a > b', compound: true, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'echo hi && curl x', compound: true, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'git log | grep fix', compound: true, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'echo "a" >> file.txt', compound: true, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'cat < input.txt', compound: true, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'git log $(git rev-parse HEAD)', compound: true, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'echo `id`', compound: true, readOnly: false, workspaceWriteSafe: false },
      { cmd: '(cd /tmp && ls)', compound: true, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'bun test || echo fail', compound: true, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'ls\nrm -rf /', compound: true, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'ls\r\nrm -rf /', compound: true, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'cat file.txt | wc -l', compound: true, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'echo 1; echo 2', compound: true, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'test (1 -eq 1)', compound: true, readOnly: false, workspaceWriteSafe: false },

      // 16-25: Dangerous/arbitrary tools not in safe allowlist
      { cmd: 'curl https://malicious.site', compound: false, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'wget https://malicious.site', compound: false, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'powershell -Command Remove-Item -Recurse', compound: false, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'cmd /c del /f /q *', compound: false, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'bash -c "rm -rf *"', compound: false, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'rm -rf node_modules', compound: false, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'del file.txt', compound: false, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'lsblk', compound: false, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'sudo rm -rf /', compound: false, readOnly: false, workspaceWriteSafe: false },
      { cmd: 'shutdown -r now', compound: false, readOnly: false, workspaceWriteSafe: false },

      // 26-37: Read-only safe commands
      { cmd: 'git status', compound: false, readOnly: true, workspaceWriteSafe: true },
      { cmd: 'git diff', compound: false, readOnly: true, workspaceWriteSafe: true },
      { cmd: 'git log --oneline', compound: false, readOnly: true, workspaceWriteSafe: true },
      { cmd: 'git show HEAD', compound: false, readOnly: true, workspaceWriteSafe: true },
      { cmd: 'git branch', compound: false, readOnly: true, workspaceWriteSafe: true },
      { cmd: 'rg "TODO" packages/tools', compound: false, readOnly: true, workspaceWriteSafe: true },
      { cmd: 'ripgrep pattern', compound: false, readOnly: true, workspaceWriteSafe: true },
      { cmd: 'ls -la', compound: false, readOnly: true, workspaceWriteSafe: true },
      { cmd: 'dir', compound: false, readOnly: true, workspaceWriteSafe: true },
      { cmd: 'pwd', compound: false, readOnly: true, workspaceWriteSafe: true },
      { cmd: 'cat package.json', compound: false, readOnly: true, workspaceWriteSafe: true },
      { cmd: 'echo "hello world"', compound: false, readOnly: true, workspaceWriteSafe: true },

      // 38-46: Build & Test commands safe in workspace-write but NOT read-only
      { cmd: 'bun test', compound: false, readOnly: false, workspaceWriteSafe: true },
      { cmd: 'bun test packages/tools', compound: false, readOnly: false, workspaceWriteSafe: true },
      { cmd: 'bun run test', compound: false, readOnly: false, workspaceWriteSafe: true },
      { cmd: 'bun run build', compound: false, readOnly: false, workspaceWriteSafe: true },
      { cmd: 'npm test', compound: false, readOnly: false, workspaceWriteSafe: true },
      { cmd: 'npm run build', compound: false, readOnly: false, workspaceWriteSafe: true },
      { cmd: 'tsc --noEmit', compound: false, readOnly: false, workspaceWriteSafe: true },
      { cmd: 'bunx tsc --noEmit', compound: false, readOnly: false, workspaceWriteSafe: true },
      { cmd: 'pytest', compound: false, readOnly: false, workspaceWriteSafe: true },
    ];

    it('evaluates all 43 command strings correctly against safety predicates', () => {
      expect(testCases.length).toBeGreaterThanOrEqual(40);
      for (const tc of testCases) {
        expect(hasShellOperators(tc.cmd)).toBe(tc.compound);
        expect(isReadOnlyCommand(tc.cmd)).toBe(tc.readOnly);
        expect(isSafeCommand(tc.cmd, 'workspace-write')).toBe(tc.workspaceWriteSafe);
      }
    });

    it('respects read-only mode in CommandPolicyEngine', async () => {
      const engine = new CommandPolicyEngine('read-only');

      const roDecision = await engine.evaluate('git status');
      expect(roDecision.allowed).toBe(true);

      const writeDecision = await engine.evaluate('bun run build');
      expect(writeDecision.allowed).toBe(false);

      const dangerousDecision = await engine.evaluate('curl https://bad.com');
      expect(dangerousDecision.allowed).toBe(false);
    });

    it('respects workspace-write mode in CommandPolicyEngine', async () => {
      const engine = new CommandPolicyEngine('workspace-write');

      const safeTest = await engine.evaluate('bun test');
      expect(safeTest.allowed).toBe(true);

      const safeBuild = await engine.evaluate('bun run build');
      expect(safeBuild.allowed).toBe(true);

      const blockedCmd = await engine.evaluate('rm -rf /');
      expect(blockedCmd.allowed).toBe(false);
      expect(blockedCmd.requiresApproval).toBe(true);
    });

    it('records all commands in full-access mode', async () => {
      const engine = new CommandPolicyEngine('full-access');
      expect(engine.getRecordedCommands().length).toBe(0);

      const d1 = await engine.evaluate('bun test');
      const d2 = await engine.evaluate('rm -rf something');

      expect(d1.allowed).toBe(true);
      expect(d2.allowed).toBe(true);
      expect(engine.getRecordedCommands()).toEqual(['bun test', 'rm -rf something']);
    });
  });

  describe('run_command Execution Requirements', () => {
    it('1. captures successful command stdout and returns exitCode 0', async () => {
      const result = await runCommandTool.execute(
        { command: 'echo hello-agent-os' },
        { workspaceRoot: tmpDir }
      );

      expect(result.success).toBe(true);
      expect(result.isError).toBe(false);
      expect(result.data?.exitCode).toBe(0);
      expect(result.content).toContain('hello-agent-os');
    });

    it('2. returns non-zero exit code without throwing an unhandled error', async () => {
      // Safe git command with bad argument exits with error code and stderr output
      const result = await runCommandTool.execute(
        { command: 'git status --unknown-flag-for-testing' },
        { workspaceRoot: tmpDir }
      );

      expect(result.success).toBe(false);
      expect(result.isError).toBe(true);
      expect(result.data?.exitCode).not.toBe(0);
      expect(result.content).toContain('Command exited with code');
    });

    it('3. times out and kills process tree when timeoutMs exceeded', async () => {
      // In full-access mode, long-running process can be executed and tested for tree kill
      commandPolicyEngine.setMode('full-access');

      const start = Date.now();
      const result = await runCommandTool.execute(
        {
          command: 'node -e "setTimeout(() => {}, 10000)"',
          timeoutMs: 500,
        },
        { workspaceRoot: tmpDir }
      );
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(3500);
      expect(result.success).toBe(false);
      expect(result.data?.timedOut).toBe(true);
      expect(result.content).toContain('timed out after 500ms');
    });

    it('4. rejects cwd escaping workspace root', async () => {
      expect(
        runCommandTool.execute(
          { command: 'git status', cwd: '../../../../' },
          { workspaceRoot: tmpDir }
        )
      ).rejects.toThrow(/Security Violation/);
    });

    it('5. truncates output around 30k characters while preserving head and tail', () => {
      const headPattern = 'HEAD_START_12345';
      const tailPattern = 'TAIL_END_67890';
      const filler = 'X'.repeat(40_000);
      const largeOutput = `${headPattern}${filler}${tailPattern}`;

      const truncated = truncateOutput(largeOutput, 30_000);

      expect(truncated.length).toBeLessThanOrEqual(30_500);
      expect(truncated.startsWith(headPattern)).toBe(true);
      expect(truncated.endsWith(tailPattern)).toBe(true);
      expect(truncated).toContain('output truncated:');
    });
  });
});
