import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import { SessionHistory } from '../src/loop/SessionHistory';
import { AgentLoop } from '../src/loop/AgentLoop';
import type { LoopTool } from '../src/loop/LoopTool';
import { ScriptedModel } from './helpers/ScriptedModel';

describe('ReadBeforeEdit Guard (Action 4-05)', () => {
  const testDir = path.join(__dirname, '.tmp-read-before-edit');
  let dbPath: string;
  let workspaceDir: string;

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    workspaceDir = path.join(testDir, `ws-${crypto.randomUUID()}`);
    fs.mkdirSync(workspaceDir, { recursive: true });
    dbPath = path.join(testDir, `test-${crypto.randomUUID()}.db`);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {}
  });

  const createTools = (wsDir: string): LoopTool[] => {
    return [
      {
        spec: {
          name: 'read_file',
          description: 'Read file',
          parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
          readOnly: true,
        },
        requiresApproval: () => false,
        execute: async (args, _signal, toolCallId = 'tc') => {
          const filePath = path.resolve(wsDir, args.path as string);
          if (!fs.existsSync(filePath)) {
            return { toolCallId, name: 'read_file', content: `File not found: ${args.path}`, isError: true };
          }
          const content = fs.readFileSync(filePath, 'utf8');
          return { toolCallId, name: 'read_file', content, isError: false };
        },
      },
      {
        spec: {
          name: 'edit_file',
          description: 'Edit file',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              oldText: { type: 'string' },
              newText: { type: 'string' },
            },
            required: ['path'],
          },
          readOnly: false,
        },
        requiresApproval: () => false,
        execute: async (args, _signal, toolCallId = 'tc') => {
          const filePath = path.resolve(wsDir, args.path as string);
          if (!fs.existsSync(filePath)) {
            return { toolCallId, name: 'edit_file', content: `File not found: ${args.path}`, isError: true };
          }
          const content = fs.readFileSync(filePath, 'utf8');
          const oldText = (args.oldText as string) || '';
          const newText = (args.newText as string) || '';
          const updated = oldText ? content.replace(oldText, newText) : newText;
          fs.writeFileSync(filePath, updated, 'utf8');
          return { toolCallId, name: 'edit_file', content: `Successfully edited ${args.path}`, isError: false };
        },
      },
      {
        spec: {
          name: 'write_file',
          description: 'Write file',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['path', 'content'],
          },
          readOnly: false,
        },
        requiresApproval: () => false,
        execute: async (args, _signal, toolCallId = 'tc') => {
          const filePath = path.resolve(wsDir, args.path as string);
          fs.writeFileSync(filePath, (args.content as string) || '', 'utf8');
          return { toolCallId, name: 'write_file', content: `Successfully wrote ${args.path}`, isError: false };
        },
      },
    ];
  };

  it('1. Guard triggers: edit_file on unread file returns [ReadBeforeEdit] and edit is NOT applied', async () => {
    const existingFile = path.join(workspaceDir, 'foo.txt');
    fs.writeFileSync(existingFile, 'original content', 'utf8');

    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();
    const tools = createTools(workspaceDir);

    const model = new ScriptedModel([
      {
        text: 'I will edit foo.txt directly without reading it.',
        toolCalls: [
          {
            id: 'tc-edit',
            name: 'edit_file',
            args: { path: 'foo.txt', oldText: 'original', newText: 'modified' },
          },
        ],
      },
      {
        text: 'Finished attempting edit.',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools,
      history,
      eventBus,
      workspaceRoot: workspaceDir,
      options: { maxTurns: 5, skipVerification: true },
    });

    const summary = await loop.run({
      sessionId: 'test-session-guard-triggers',
      userInput: 'Edit foo.txt',
      workspaceRoot: workspaceDir,
    });

    expect(summary.toolCalls).toHaveLength(1);
    expect(summary.toolCalls[0].name).toBe('edit_file');
    expect(summary.toolCalls[0].success).toBe(false);
    expect(summary.toolCalls[0].error).toContain('[ReadBeforeEdit]');
    expect(summary.toolCalls[0].error).toContain('You must call read_file("foo.txt") before editing it');

    // Verify file on disk was NOT modified
    const contentOnDisk = fs.readFileSync(existingFile, 'utf8');
    expect(contentOnDisk).toBe('original content');
  });

  it('2. Guard clears: after read_file, subsequent edit_file proceeds normally', async () => {
    const existingFile = path.join(workspaceDir, 'bar.txt');
    fs.writeFileSync(existingFile, 'initial bar content', 'utf8');

    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();
    const tools = createTools(workspaceDir);

    const model = new ScriptedModel([
      {
        text: 'Let me read the file first.',
        toolCalls: [
          {
            id: 'tc-read',
            name: 'read_file',
            args: { path: 'bar.txt' },
          },
        ],
      },
      {
        text: 'Now I will edit the file.',
        toolCalls: [
          {
            id: 'tc-edit',
            name: 'edit_file',
            args: { path: 'bar.txt', oldText: 'initial bar', newText: 'updated bar' },
          },
        ],
      },
      {
        text: 'All done.',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools,
      history,
      eventBus,
      workspaceRoot: workspaceDir,
      options: { maxTurns: 5, skipVerification: true },
    });

    const summary = await loop.run({
      sessionId: 'test-session-guard-clears',
      userInput: 'Read and update bar.txt',
      workspaceRoot: workspaceDir,
    });

    expect(summary.toolCalls).toHaveLength(2);
    expect(summary.toolCalls[0].name).toBe('read_file');
    expect(summary.toolCalls[0].success).toBe(true);
    expect(summary.toolCalls[1].name).toBe('edit_file');
    expect(summary.toolCalls[1].success).toBe(true);

    // Verify file on disk was updated
    const contentOnDisk = fs.readFileSync(existingFile, 'utf8');
    expect(contentOnDisk).toBe('updated bar content');
  });

  it('3. New file exemption: write_file for a new path is NOT blocked by the guard', async () => {
    const newFilePath = path.join(workspaceDir, 'new-file.txt');
    expect(fs.existsSync(newFilePath)).toBe(false);

    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();
    const tools = createTools(workspaceDir);

    const model = new ScriptedModel([
      {
        text: 'Creating brand new file.',
        toolCalls: [
          {
            id: 'tc-write',
            name: 'write_file',
            args: { path: 'new-file.txt', content: 'hello brand new file' },
          },
        ],
      },
      {
        text: 'File created.',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools,
      history,
      eventBus,
      workspaceRoot: workspaceDir,
      options: { maxTurns: 5, skipVerification: true },
    });

    const summary = await loop.run({
      sessionId: 'test-session-new-file',
      userInput: 'Create new-file.txt',
      workspaceRoot: workspaceDir,
    });

    expect(summary.toolCalls).toHaveLength(1);
    expect(summary.toolCalls[0].name).toBe('write_file');
    expect(summary.toolCalls[0].success).toBe(true);

    expect(fs.existsSync(newFilePath)).toBe(true);
    expect(fs.readFileSync(newFilePath, 'utf8')).toBe('hello brand new file');
  });

  it('4. noReadGuard bypass: when loopOptions.noReadGuard = true, edit proceeds without checking', async () => {
    const existingFile = path.join(workspaceDir, 'bypass.txt');
    fs.writeFileSync(existingFile, 'unbypassed content', 'utf8');

    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();
    const tools = createTools(workspaceDir);

    const model = new ScriptedModel([
      {
        text: 'Direct edit with guard bypassed.',
        toolCalls: [
          {
            id: 'tc-edit',
            name: 'edit_file',
            args: { path: 'bypass.txt', oldText: 'unbypassed', newText: 'bypassed' },
          },
        ],
      },
      {
        text: 'Bypass edit completed.',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools,
      history,
      eventBus,
      workspaceRoot: workspaceDir,
      options: { maxTurns: 5, skipVerification: true, noReadGuard: true },
    });

    const summary = await loop.run({
      sessionId: 'test-session-bypass',
      userInput: 'Direct edit bypass.txt',
      workspaceRoot: workspaceDir,
    });

    expect(summary.toolCalls).toHaveLength(1);
    expect(summary.toolCalls[0].name).toBe('edit_file');
    expect(summary.toolCalls[0].success).toBe(true);

    const contentOnDisk = fs.readFileSync(existingFile, 'utf8');
    expect(contentOnDisk).toBe('bypassed content');
  });
});
