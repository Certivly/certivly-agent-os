import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ReviewSubagent } from '../src/loop/ReviewSubagent';
import { ToolRegistry, readFileTool, editFileTool, runCommandTool } from '@agent-os/tools';

describe('ReviewSubagent Tests (Suggestion 06)', () => {
  let tmpDir: string;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-subagent-test-'));
    toolRegistry = new ToolRegistry();
    toolRegistry.register(readFileTool);
    toolRegistry.register(editFileTool);
    toolRegistry.register(runCommandTool);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  it('1. ReviewSubagent read-only registry only includes read_file', () => {
    const fakeModel = {
      id: 'mock-model',
      generate: async () => ({ text: '{"approved": true}' }),
    } as any;

    const reviewer = new ReviewSubagent(fakeModel, toolRegistry, tmpDir);
    const readOnlyReg = reviewer.getReadOnlyRegistry();

    expect(readOnlyReg.get('read_file')).toBeDefined();
    expect(readOnlyReg.get('edit_file')).toBeUndefined();
    expect(readOnlyReg.get('run_command')).toBeUndefined();
  });

  it('2. ReviewSubagent blocks attempt to call edit tools', async () => {
    let turnCount = 0;
    const capturedMessages: any[] = [];

    const fakeModel = {
      id: 'mock-model',
      generate: async (req: any) => {
        turnCount++;
        if (turnCount === 1) {
          return {
            text: 'I want to edit a file',
            toolCalls: [
              {
                id: 'call-illegal-edit',
                name: 'edit_file',
                args: { path: 'src/foo.ts' },
              },
            ],
          };
        }
        capturedMessages.push(...req.messages);
        return {
          text: JSON.stringify({
            approved: false,
            issues: ['Edit tool forbidden'],
            summary: 'Review blocked mutation',
          }),
        };
      },
    } as any;

    const reviewer = new ReviewSubagent(fakeModel, toolRegistry, tmpDir);
    const result = await reviewer.review('--- a/foo.ts\n+++ b/foo.ts');

    expect(result.approved).toBe(false);
    expect(result.issues).toContain('Edit tool forbidden');

    // Find the tool response message that blocked the edit call
    const toolResultMsg = capturedMessages.find(
      (m) => m.role === 'tool' && m.toolCallId === 'call-illegal-edit'
    );
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg?.content).toContain('[ReviewSubagent] Tool not permitted in review mode.');
  });

  it('3. ReviewSubagent returns approved: true for clean diff', async () => {
    const fakeModel = {
      id: 'mock-model',
      generate: async () => ({
        text: JSON.stringify({
          approved: true,
          issues: [],
          summary: 'All changes are safe and tested.',
        }),
      }),
    } as any;

    const reviewer = new ReviewSubagent(fakeModel, toolRegistry, tmpDir);
    const result = await reviewer.review('+ export function add(a, b) { return a + b; }');

    expect(result.approved).toBe(true);
    expect(result.issues.length).toBe(0);
    expect(result.summary).toContain('All changes are safe');
  });

  it('4. ReviewSubagent parses plain text APPROVE / REQUEST_CHANGES fallback', async () => {
    const fakeModelApproved = {
      id: 'mock-model',
      generate: async () => ({
        text: 'APPROVE: Looks solid with good test coverage.',
      }),
    } as any;

    const reviewerApproved = new ReviewSubagent(fakeModelApproved, toolRegistry, tmpDir);
    const resApprove = await reviewerApproved.review('diff');
    expect(resApprove.approved).toBe(true);

    const fakeModelReject = {
      id: 'mock-model',
      generate: async () => ({
        text: 'REQUEST_CHANGES: Missing null check on line 12 and missing unit test.',
      }),
    } as any;

    const reviewerReject = new ReviewSubagent(fakeModelReject, toolRegistry, tmpDir);
    const resReject = await reviewerReject.review('diff');
    expect(resReject.approved).toBe(false);
    expect(resReject.issues[0]).toContain('Missing null check');
  });
});
