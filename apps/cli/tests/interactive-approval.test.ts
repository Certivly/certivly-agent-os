import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentRuntime } from '@agent-os/agent-runtime';
import { InteractiveApprovalBridge } from '../src/bridge/InteractiveApprovalBridge';
import type { Model, GenerationRequest, GenerationResponse } from '@agent-os/providers';

describe('Action 6-05: Interactive CLI Approval Wiring', () => {
  let tmpDir: string;
  let configPath: string;
  let runtimes: AgentRuntime[] = [];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-os-approval-test-'));
    configPath = path.join(tmpDir, 'agentos.config.json');
    runtimes = [];
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        activeProvider: 'lmstudio',
        activeModel: 'scripted',
        permissionMode: 'manual',
        runtime: { sessionDir: tmpDir },
      }),
      'utf8'
    );
  });

  afterEach(() => {
    for (const r of runtimes) {
      try { r.close(); } catch {}
    }
    runtimes = [];
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('1. InteractiveApprovalBridge resolves approval to true when decided', async () => {
    const bridge = new InteractiveApprovalBridge();
    const promise = bridge.requestApproval({
      toolName: 'edit_file',
      args: { path: 'test.ts', oldText: 'a', newText: 'b' },
      toolCallId: 'call_1',
    });

    expect(bridge.hasPending()).toBe(true);
    const decided = bridge.decide('call_1', true);
    expect(decided).toBe(true);

    const result = await promise;
    expect(result.approved).toBe(true);
    expect(bridge.hasPending()).toBe(false);
  });

  it('2. InteractiveApprovalBridge resolves approval to false with reason when rejected', async () => {
    const bridge = new InteractiveApprovalBridge();
    const promise = bridge.requestApproval({
      toolName: 'run_command',
      args: { command: 'rm -rf /' },
      toolCallId: 'call_danger',
    });

    expect(bridge.hasPending()).toBe(true);
    bridge.decide('call_danger', false, 'Disallowed command');

    const result = await promise;
    expect(result.approved).toBe(false);
    expect(result.reason).toBe('Disallowed command');
    expect(bridge.hasPending()).toBe(false);
  });

  it('3. AgentRuntime in manual mode calls requestApproval and applies edit when approved', async () => {
    const targetFile = path.join(tmpDir, 'sample.txt');
    fs.writeFileSync(targetFile, 'initial content', 'utf8');

    const bridge = new InteractiveApprovalBridge();
    const runtime = new AgentRuntime({
      configPath,
      workspaceRoot: tmpDir,
      permissionMode: 'manual',
      requestApproval: bridge.requestApproval,
    });
    runtimes.push(runtime);

    // Provide a model that first reads then attempts to edit the file
    let turn = 0;
    const fakeModel: Model = {
      id: 'fake-interactive',
      async generate(req: GenerationRequest): Promise<GenerationResponse> {
        turn++;
        if (turn === 1) {
          return {
            text: 'I will read the file first.',
            toolCalls: [
              {
                id: 'read_call_1',
                name: 'read_file',
                args: JSON.stringify({
                  path: targetFile,
                }),
              },
            ],
          };
        }
        if (turn === 2) {
          return {
            text: 'I will modify the file.',
            toolCalls: [
              {
                id: 'edit_call_1',
                name: 'edit_file',
                args: JSON.stringify({
                  path: targetFile,
                  oldText: 'initial content',
                  newText: 'updated content',
                }),
              },
            ],
          };
        }
        return {
          text: 'File successfully modified!',
        };
      },
    };

    (runtime as any).activeModel = fakeModel;

    const requestPromise = runtime.handleRequest('session_interactive_1', 'Update sample.txt');

    // Wait for approval to be requested
    let attempts = 0;
    while (!bridge.hasPending() && attempts < 30) {
      await Bun.sleep(20);
      attempts++;
    }
    expect(bridge.hasPending()).toBe(true);

    // Approve the tool call
    bridge.decide('edit_call_1', true);

    const output = await requestPromise;
    expect(output).toContain('File successfully modified!');

    // Verify file was actually modified on disk
    const contentOnDisk = fs.readFileSync(targetFile, 'utf8');
    expect(contentOnDisk).toBe('updated content');
  });

  it('4. AgentRuntime in manual mode denies edit when requestApproval returns false', async () => {
    const targetFile = path.join(tmpDir, 'protected.txt');
    fs.writeFileSync(targetFile, 'untouched content', 'utf8');

    const bridge = new InteractiveApprovalBridge();
    const runtime = new AgentRuntime({
      configPath,
      workspaceRoot: tmpDir,
      permissionMode: 'manual',
      requestApproval: bridge.requestApproval,
    });
    runtimes.push(runtime);

    let turn = 0;
    const fakeModel: Model = {
      id: 'fake-interactive-deny',
      async generate(req: GenerationRequest): Promise<GenerationResponse> {
        turn++;
        if (turn === 1) {
          return {
            text: 'I will read the file first.',
            toolCalls: [
              {
                id: 'read_call_deny',
                name: 'read_file',
                args: JSON.stringify({
                  path: targetFile,
                }),
              },
            ],
          };
        }
        if (turn === 2) {
          return {
            text: 'I will modify protected file.',
            toolCalls: [
              {
                id: 'edit_call_deny',
                name: 'edit_file',
                args: JSON.stringify({
                  path: targetFile,
                  oldText: 'untouched content',
                  newText: 'corrupted content',
                }),
              },
            ],
          };
        }
        return {
          text: 'Acknowledged refusal.',
        };
      },
    };

    (runtime as any).activeModel = fakeModel;

    const requestPromise = runtime.handleRequest('session_interactive_deny', 'Update protected.txt');

    let attempts = 0;
    while (!bridge.hasPending() && attempts < 30) {
      await Bun.sleep(20);
      attempts++;
    }
    expect(bridge.hasPending()).toBe(true);

    // Deny the tool call
    bridge.decide('edit_call_deny', false, 'User declined modification');

    const output = await requestPromise;
    expect(output).toContain('Acknowledged refusal.');

    // Verify file was NOT modified on disk
    const contentOnDisk = fs.readFileSync(targetFile, 'utf8');
    expect(contentOnDisk).toBe('untouched content');
  });
});
