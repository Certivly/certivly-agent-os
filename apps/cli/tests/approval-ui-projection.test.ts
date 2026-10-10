import { describe, it, expect } from 'bun:test';
import { reduceBatch, type UIProjection } from '../src/ui/hooks/useEventStream';
import { detectApprovalWarnings, projectApprovalState } from '../src/ui/approval/ApprovalHelper';
import { AgentLoop } from '@agent-os/agent-runtime';
import { SessionHistory } from '@agent-os/agent-runtime';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import type { LoopTool } from '@agent-os/agent-runtime';
import type { Model, GenerationRequest, GenerationResponse } from '@agent-os/providers';

describe('Approval UI Projection and Warnings', () => {
  it('1. approval event projects into UI state', () => {
    const initialState: UIProjection = {
      lastEvents: [],
      activeSkills: [],
      traceTree: [],
      chatHistory: [],
      streamingBuffer: '',
      activeStreamingMessageId: null,
      activeMcpCount: 0,
      agentState: 'idle',
      providerStatus: 'ok',
      todos: [],
      turnCount: 0,
    };

    const approvalPayload = {
      id: 'appr-123',
      sessionId: 'sess-test',
      toolName: 'write_file',
      args: { path: 'src/config.ts', content: 'export const API = 123;' },
      reason: 'Critical file modification',
      files: [
        { path: 'src/config.ts', kind: 'modify' as const, diff: '--- a/src/config.ts\n+++ b/src/config.ts\n@@ -1 +1 @@\n+export const API = 123;' },
      ],
      commandsRun: ['bun test'],
      verificationVerdict: 'verified',
    };

    const nextState = reduceBatch(
      [
        {
          id: 'ev-1',
          type: 'approval.requested',
          timestamp: Date.now(),
          payload: approvalPayload,
        },
      ],
      initialState
    );

    expect(nextState.pendingApproval).toBeDefined();
    expect(nextState.pendingApproval?.id).toBe('appr-123');
    expect(nextState.pendingApproval?.filesChanged).toEqual(['src/config.ts']);
    expect(nextState.pendingApproval?.modifyCount).toBe(1);
    expect(nextState.pendingApproval?.diffPreview).toContain('export const API = 123;');
    expect(nextState.pendingApproval?.verificationVerdict).toBe('verified');
    expect(nextState.pendingApproval?.commandsRun).toEqual(['bun test']);

    // Approval decided clears pendingApproval
    const clearedState = reduceBatch(
      [
        {
          id: 'ev-2',
          type: 'approval.decided',
          timestamp: Date.now(),
          payload: { approved: true },
        },
      ],
      nextState
    );
    expect(clearedState.pendingApproval).toBeNull();
  });

  it('2. denial reason returns to AgentLoop', async () => {
    const sessionManager = new SessionManager(':memory:');
    const history = new SessionHistory(sessionManager);
    const eventBus = new LoggingEventBus();
    const sessionId = 'test-denial-session';
    sessionManager.createSession(sessionId);

    let executedTool = false;
    const sensitiveTool: LoopTool = {
      spec: {
        name: 'dangerous_action',
        description: 'Requires approval',
        readOnly: false,
        parameters: { type: 'object', properties: {} },
      },
      requiresApproval: async () => true,
      execute: async () => {
        executedTool = true;
        return { toolCallId: 'c1', name: 'dangerous_action', content: 'Executed', isError: false };
      },
    };

    let callTurn = 0;
    const model: Model = {
      id: 'test-model',
      async generate(): Promise<GenerationResponse> {
        callTurn++;
        if (callTurn === 1) {
          return {
            text: 'I want to execute dangerous action',
            toolCalls: [{ id: 'call_danger', name: 'dangerous_action', args: '{}' }],
          };
        }
        return { text: 'Understood, action was denied.' };
      },
    };

    const denialReason = 'Policy violation: unauthorized production database edit';

    const loop = new AgentLoop({
      model,
      tools: [sensitiveTool],
      history,
      eventBus,
      workspaceRoot: process.cwd(),
      requestApproval: async () => {
        return {
          approved: false,
          reason: denialReason,
        };
      },
    });

    const summary = await loop.run({
      sessionId,
      userInput: 'Run dangerous action please',
      workspaceRoot: process.cwd(),
    });

    // Tool should not have run
    expect(executedTool).toBe(false);

    // Denial reason should be recorded in summary and toolCalls
    const record = summary.toolCalls.find(tc => tc.name === 'dangerous_action');
    expect(record).toBeDefined();
    expect(record?.success).toBe(false);
    expect(record?.error).toContain(denialReason);

    // Verify denial reason was stored in run record
    const run = sessionManager.getRuns(sessionId)[0];
    expect(run.approvalDecisions).toContain(denialReason);
  });

  it('4. warnings appear for lockfile/config edits and other sensitive changes', () => {
    const files = [
      { path: 'package-lock.json', kind: 'modify' as const, diff: 'modified lockfile' },
      { path: 'agentos.config.json', kind: 'modify' as const, diff: 'modified config' },
      { path: 'package.json', kind: 'modify' as const, diff: '--- a/package.json\n+++ b/package.json\n@@ -5,2 +5,2 @@\n- "scripts": {\n+ "scripts": {\n+   "postinstall": "malicious"' },
      { path: '.github/workflows/ci.yml', kind: 'modify' as const, diff: 'modified ci' },
      { path: 'old-util.ts', kind: 'delete' as const, diff: 'deleted file' },
      { path: 'binary.wasm', kind: 'modify' as const, isBinary: true, diff: 'Binary files differ' },
    ];

    const warnings = detectApprovalWarnings(files);
    const warningTypes = warnings.map(w => w.type);

    expect(warningTypes).toContain('touches_lockfile');
    expect(warningTypes).toContain('touches_config');
    expect(warningTypes).toContain('touches_package_scripts');
    expect(warningTypes).toContain('touches_ci');
    expect(warningTypes).toContain('deletes_files');
    expect(warningTypes).toContain('binary_change');
  });
});
