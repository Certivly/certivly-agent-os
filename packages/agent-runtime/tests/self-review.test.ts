import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentLoop } from '../src/loop/AgentLoop';
import { SessionHistory } from '../src/loop/SessionHistory';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import type { LoopTool } from '../src/loop/LoopTool';
import type { Model, GenerationRequest, GenerationResponse } from '@agent-os/providers';

describe('Self-Review Final Pass', () => {
  let tempDir: string;
  let dbPath: string;
  let sessionManager: SessionManager;
  let history: SessionHistory;
  let eventBus: LoggingEventBus;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'self-review-test-'));
    dbPath = path.join(tempDir, 'sessions.db');
    sessionManager = new SessionManager(dbPath);
    history = new SessionHistory(sessionManager);
    eventBus = new LoggingEventBus();

    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-self-review',
        scripts: { test: 'bun test' },
      })
    );
  });

  afterEach(() => {
    try {
      sessionManager.close();
    } catch {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  const createDummyEditTool = (): LoopTool => ({
    spec: {
      name: 'edit_file',
      description: 'Edit a file',
      readOnly: false,
      parameters: { type: 'object', properties: {} },
    },
    requiresApproval: async () => false,
    execute: async (args: any) => {
      fs.writeFileSync(path.join(tempDir, args.path || 'file.ts'), args.content || 'code');
      return {
        toolCallId: 'call_1',
        name: 'edit_file',
        content: 'edited',
        isError: false,
      };
    },
  });

  it('1. approve path finishes', async () => {
    const sessionId = 'test-review-approve';
    sessionManager.createSession(sessionId);

    let reviewCalled = false;
    const model: Model = {
      id: 'test-model',
      async generate(req: GenerationRequest): Promise<GenerationResponse> {
        // If reviewing (systemPrompt indicates reviewer)
        if (req.systemPrompt?.includes('expert code reviewer')) {
          reviewCalled = true;
          return { text: 'APPROVE: Looks clean and verified.' };
        }

        const lastMsg = req.messages[req.messages.length - 1];
        if (lastMsg && lastMsg.role === 'tool') {
          return { text: 'Done making edits.' };
        }

        return {
          text: 'Editing file',
          toolCalls: [
            {
              id: 'call_1',
              name: 'edit_file',
              args: JSON.stringify({ path: 'app.ts', content: 'export const x = 1;' }),
            },
          ],
        };
      },
    };

    const loop = new AgentLoop({
      model,
      tools: [createDummyEditTool()],
      history,
      eventBus,
      workspaceRoot: tempDir,
      options: {
        maxTurns: 5,
        maxWallTimeMs: 10000,
        maxApproxTokens: 4000,
        selfReview: true,
        verificationExecutor: async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }),
      },
    });

    const summary = await loop.run({
      sessionId,
      workspaceRoot: tempDir,
      userInput: 'make changes',
    });

    expect(reviewCalled).toBe(true);
    expect(summary.success).toBe(true);
  });

  it('2. request changes triggers one edit & 3. verification reruns after review edit', async () => {
    const sessionId = 'test-review-request-changes';
    sessionManager.createSession(sessionId);

    let reviewCount = 0;
    let editCount = 0;
    let verificationRunCount = 0;

    const editTool: LoopTool = {
      spec: {
        name: 'edit_file',
        description: 'Edit a file',
        readOnly: false,
        parameters: { type: 'object', properties: {} },
      },
      requiresApproval: async () => false,
      execute: async (args: any) => {
        editCount++;
        fs.writeFileSync(path.join(tempDir, 'app.ts'), args.content || 'code');
        return {
          toolCallId: 'call_edit',
          name: 'edit_file',
          content: 'edited',
          isError: false,
        };
      },
    };

    const model: Model = {
      id: 'test-model',
      async generate(req: GenerationRequest): Promise<GenerationResponse> {
        if (req.systemPrompt?.includes('expert code reviewer')) {
          reviewCount++;
          if (reviewCount === 1) {
            return { text: 'REQUEST_CHANGES: Missing JSDoc comment on export.' };
          }
          return { text: 'APPROVE: JSDoc comment added.' };
        }

        const lastMsg = req.messages[req.messages.length - 1];
        if (lastMsg && lastMsg.role === 'tool') {
          return { text: 'Edits applied.' };
        }

        if (lastMsg && lastMsg.role === 'user' && lastMsg.content.includes('Self-review requested changes')) {
          // Model acts on review feedback to make a second edit
          return {
            text: 'Adding JSDoc comment as requested.',
            toolCalls: [
              {
                id: 'call_fix',
                name: 'edit_file',
                args: JSON.stringify({
                  path: 'app.ts',
                  content: '/** JSDoc */\nexport const x = 1;',
                }),
              },
            ],
          };
        }

        return {
          text: 'Initial edit',
          toolCalls: [
            {
              id: 'call_init',
              name: 'edit_file',
              args: JSON.stringify({ path: 'app.ts', content: 'export const x = 1;' }),
            },
          ],
        };
      },
    };

    const loop = new AgentLoop({
      model,
      tools: [editTool],
      history,
      eventBus,
      workspaceRoot: tempDir,
      options: {
        maxTurns: 6,
        maxWallTimeMs: 10000,
        maxApproxTokens: 4000,
        selfReview: true,
        maxSelfReviewAttempts: 2,
        verificationExecutor: async () => {
          verificationRunCount++;
          return { exitCode: 0, stdout: 'ok', stderr: '' };
        },
      },
    });

    const summary = await loop.run({
      sessionId,
      workspaceRoot: tempDir,
      userInput: 'make changes',
    });

    expect(editCount).toBe(2); // Initial edit + 1 review fix edit
    expect(verificationRunCount).toBeGreaterThanOrEqual(2); // Verified after initial edit + verified after review edit
    expect(reviewCount).toBe(2);
    expect(summary.success).toBe(true);
  });

  it('4. second request changes stops safely without infinite loop', async () => {
    const sessionId = 'test-review-second-stop';
    sessionManager.createSession(sessionId);

    let reviewCount = 0;
    const model: Model = {
      id: 'test-model',
      async generate(req: GenerationRequest): Promise<GenerationResponse> {
        if (req.systemPrompt?.includes('expert code reviewer')) {
          reviewCount++;
          return { text: 'REQUEST_CHANGES: Persistent style complaint.' };
        }

        const lastMsg = req.messages[req.messages.length - 1];
        if (lastMsg && lastMsg.role === 'tool') {
          return { text: 'Finished.' };
        }

        return {
          text: 'Making an edit',
          toolCalls: [
            {
              id: 'call_1',
              name: 'edit_file',
              args: JSON.stringify({ path: 'app.ts', content: 'export const a = 1;' }),
            },
          ],
        };
      },
    };

    const loop = new AgentLoop({
      model,
      tools: [createDummyEditTool()],
      history,
      eventBus,
      workspaceRoot: tempDir,
      options: {
        maxTurns: 10,
        maxWallTimeMs: 10000,
        maxApproxTokens: 4000,
        selfReview: true,
        maxSelfReviewAttempts: 1, // Only allow 1 review request
        verificationExecutor: async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }),
      },
    });

    const summary = await loop.run({
      sessionId,
      workspaceRoot: tempDir,
      userInput: 'make changes',
    });

    // Should stop safely once max review attempts is reached
    expect(reviewCount).toBe(1);
    expect(summary.success).toBe(true);
  });

  it('5. feature flag off skips review', async () => {
    const sessionId = 'test-review-disabled';
    sessionManager.createSession(sessionId);

    let reviewCalled = false;
    const model: Model = {
      id: 'test-model',
      async generate(req: GenerationRequest): Promise<GenerationResponse> {
        if (req.systemPrompt?.includes('expert code reviewer')) {
          reviewCalled = true;
          return { text: 'APPROVE' };
        }

        const lastMsg = req.messages[req.messages.length - 1];
        if (lastMsg && lastMsg.role === 'tool') {
          return { text: 'Finished.' };
        }

        return {
          text: 'Making an edit',
          toolCalls: [
            {
              id: 'call_1',
              name: 'edit_file',
              args: JSON.stringify({ path: 'app.ts', content: 'export const a = 1;' }),
            },
          ],
        };
      },
    };

    const loop = new AgentLoop({
      model,
      tools: [createDummyEditTool()],
      history,
      eventBus,
      workspaceRoot: tempDir,
      options: {
        maxTurns: 5,
        maxWallTimeMs: 10000,
        maxApproxTokens: 4000,
        selfReview: false, // OFF by default
        verificationExecutor: async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }),
      },
    });

    const summary = await loop.run({
      sessionId,
      workspaceRoot: tempDir,
      userInput: 'make changes',
    });

    expect(reviewCalled).toBe(false);
    expect(summary.success).toBe(true);
  });
});
