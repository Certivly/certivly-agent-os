import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { editFileTool } from '../../tools/src/implementations/edit_file';
import { writeFileTool } from '../../tools/src/implementations/write_file';
import { applyPatchTool } from '../../tools/src/implementations/apply_patch';
import { generateUnifiedDiff } from '../../shared/src/diff';
import { validateChangeSet } from '../../patch-engine/src/models/ChangeSet';
import { ChangeSetStore } from '../../patch-engine/src/store/ChangeSetStore';
import { AgentLoop } from '../src/loop/AgentLoop';
import { SessionManager } from '@agent-os/sessions';
import { SessionHistory } from '../src/loop/SessionHistory';
import { LoggingEventBus } from '@agent-os/shared';
import { ScriptedModel } from './helpers/ScriptedModel';
import type { LoopTool } from '../src/loop/LoopTool';

describe('Action 6-10: Real diffs and ChangeSet truth', () => {
  let testWorkspace: string;
  let dbPath: string;

  beforeEach(() => {
    testWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-os-diff-test-'));
    dbPath = path.join(testWorkspace, `session-${crypto.randomUUID()}.db`);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testWorkspace)) {
        fs.rmSync(testWorkspace, { recursive: true, force: true });
      }
    } catch {}
  });

  it('1. generateUnifiedDiff generates real hunks with line numbers', () => {
    const original = 'line 1\nline 2\nline 3\n';
    const modified = 'line 1\nline 2 modified\nline 3\n';

    const diff = generateUnifiedDiff(original, modified, 'sample.txt');
    expect(diff).toContain('--- a/sample.txt');
    expect(diff).toContain('+++ b/sample.txt');
    expect(diff).toContain('@@ -1,3 +1,3 @@');
    expect(diff).toContain('-line 2');
    expect(diff).toContain('+line 2 modified');
  });

  it('2. edit_file produces real diff and valid SHA-256 in metadata', async () => {
    const filePath = path.join(testWorkspace, 'test.txt');
    fs.writeFileSync(filePath, 'foo\nbar\nbaz\n', 'utf8');

    const res = await editFileTool.execute({
      path: 'test.txt',
      oldText: 'bar',
      newText: 'bar_updated',
    }, { workspaceRoot: testWorkspace });

    expect(res.isError).toBe(false);
    const meta = res.metadata as Record<string, any>;
    expect(meta.kind).toBe('modify');
    expect(meta.diff).toContain('-bar');
    expect(meta.diff).toContain('+bar_updated');
    expect(meta.before).toHaveLength(64);
    expect(meta.after).toHaveLength(64);
  });

  it('3. write_file produces real diff with kind add for new files and modify for overwrites', async () => {
    // New file
    const resAdd = await writeFileTool.execute({
      path: 'created.txt',
      content: 'hello world\n',
    }, { workspaceRoot: testWorkspace });

    expect(resAdd.isError).toBe(false);
    const metaAdd = resAdd.metadata as Record<string, any>;
    expect(metaAdd.kind).toBe('add');
    expect(metaAdd.diff).toContain('--- /dev/null');
    expect(metaAdd.diff).toContain('+++ b/created.txt');
    expect(metaAdd.diff).toContain('+hello world');
    expect(metaAdd.before).toBeUndefined();
    expect(metaAdd.after).toHaveLength(64);

    // Overwrite
    const resMod = await writeFileTool.execute({
      path: 'created.txt',
      content: 'hello agent-os\n',
      overwrite: true,
    }, { workspaceRoot: testWorkspace });

    expect(resMod.isError).toBe(false);
    const metaMod = resMod.metadata as Record<string, any>;
    expect(metaMod.kind).toBe('modify');
    expect(metaMod.diff).toContain('-hello world');
    expect(metaMod.diff).toContain('+hello agent-os');
    expect(metaMod.before).toHaveLength(64);
    expect(metaMod.after).toHaveLength(64);
  });

  it('4. apply_patch produces real diffs for all modified files in metadata', async () => {
    fs.writeFileSync(path.join(testWorkspace, 'f1.ts'), 'const a = 1;\n', 'utf8');

    const patch = `
*** Begin Patch
*** File: f1.ts
<<<<
const a = 1;
====
const a = 999;
>>>>
*** Add File: f2.ts
<<<<
====
const b = 2;
>>>>
*** End Patch
`.trim();

    const res = await applyPatchTool.execute({ patch }, { workspaceRoot: testWorkspace });
    expect(res.isError).toBe(false);
    const meta = res.metadata as { changes: any[] };
    expect(meta.changes).toHaveLength(2);

    const f1Change = meta.changes.find((c: any) => c.path === 'f1.ts');
    expect(f1Change.kind).toBe('modify');
    expect(f1Change.diff).toContain('-const a = 1;');
    expect(f1Change.diff).toContain('+const a = 999;');

    const f2Change = meta.changes.find((c: any) => c.path === 'f2.ts');
    expect(f2Change.kind).toBe('add');
    expect(f2Change.diff).toContain('--- /dev/null');
    expect(f2Change.diff).toContain('+const b = 2;');
  });

  it('5. AgentLoop merges multiple edits on the same file into a single truthful ChangeSet entry', async () => {
    fs.writeFileSync(path.join(testWorkspace, 'app.ts'), 'const a = 1;\nconst b = 2;\n', 'utf8');

    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    const loopTools: LoopTool[] = [
      {
        spec: editFileTool.spec,
        requiresApproval: () => false,
        execute: async (args, signal, id = 'tc') => {
          const res = await editFileTool.execute(args, { workspaceRoot: testWorkspace });
          return { toolCallId: id, name: 'edit_file', content: res.content, metadata: res.metadata, isError: Boolean(res.isError) };
        },
      },
      {
        spec: writeFileTool.spec,
        requiresApproval: () => false,
        execute: async (args, signal, id = 'tc') => {
          const res = await writeFileTool.execute(args, { workspaceRoot: testWorkspace });
          return { toolCallId: id, name: 'write_file', content: res.content, metadata: res.metadata, isError: Boolean(res.isError) };
        },
      },
    ];

    // Model makes 2 edits to app.ts, and 1 write to newfile.ts across 3 turns
    const model = new ScriptedModel([
      {
        text: 'Edit 1 on app.ts',
        toolCalls: [
          {
            id: 'tc1',
            name: 'edit_file',
            args: JSON.stringify({ path: 'app.ts', oldText: 'const a = 1;', newText: 'const a = 10;' }),
          },
        ],
      },
      {
        text: 'Edit 2 on app.ts',
        toolCalls: [
          {
            id: 'tc2',
            name: 'edit_file',
            args: JSON.stringify({ path: 'app.ts', oldText: 'const a = 10;', newText: 'const a = 100;' }),
          },
        ],
      },
      {
        text: 'Write newfile.ts',
        toolCalls: [
          {
            id: 'tc3',
            name: 'write_file',
            args: JSON.stringify({ path: 'newfile.ts', content: 'export const c = 3;\n' }),
          },
        ],
      },
      {
        text: 'All done!',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools: loopTools,
      history,
      eventBus,
      workspaceRoot: testWorkspace,
      options: { permissionMode: 'auto', skipVerification: true },
    });

    const sessionId = `s-${crypto.randomUUID()}`;
    sm.createSession(sessionId);
    const summary = await loop.run({ sessionId, userInput: 'Do edits', workspaceRoot: testWorkspace });
    sm.close();

    expect(summary.status).toBe('completed');
    expect(summary.changeSetId).toBeDefined();

    const store = new ChangeSetStore(path.join(testWorkspace, '.agentos/changesets'));
    const cs = store.load(summary.changeSetId!);
    expect(cs).not.toBeNull();

    // Exactly 2 files modified (app.ts and newfile.ts), NOT 3!
    expect(cs!.files).toHaveLength(2);

    const appEntry = cs!.files.find(f => f.path === 'app.ts');
    expect(appEntry).toBeDefined();
    expect(appEntry!.kind).toBe('modify');
    // True diff against baseline (const a = 1 -> const a = 100)
    expect(appEntry!.diff).toContain('-const a = 1;');
    expect(appEntry!.diff).toContain('+const a = 100;');
    expect(appEntry!.diff).not.toContain('const a = 10;');

    const newEntry = cs!.files.find(f => f.path === 'newfile.ts');
    expect(newEntry).toBeDefined();
    expect(newEntry!.kind).toBe('add');
    expect(newEntry!.diff).toContain('--- /dev/null');
    expect(newEntry!.diff).toContain('+export const c = 3;');

    // ChangeSet is fully valid according to schema rules
    const errors = validateChangeSet(cs!);
    expect(errors).toHaveLength(0);
  });

  it('6. AgentLoop accurately includes apply_patch modifications in ChangeSet', async () => {
    fs.writeFileSync(path.join(testWorkspace, 'init.ts'), 'export const val = 0;\n', 'utf8');

    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    const loopTools: LoopTool[] = [
      {
        spec: applyPatchTool.spec,
        requiresApproval: () => false,
        execute: async (args, signal, id = 'tc') => {
          const res = await applyPatchTool.execute(args, { workspaceRoot: testWorkspace });
          return { toolCallId: id, name: 'apply_patch', content: res.content, metadata: res.metadata, isError: Boolean(res.isError) };
        },
      },
    ];

    const patch = `
*** Begin Patch
*** File: init.ts
<<<<
export const val = 0;
====
export const val = 42;
>>>>
*** End Patch
`.trim();

    const model = new ScriptedModel([
      {
        text: 'Applying patch',
        toolCalls: [
          {
            id: 'tc_patch',
            name: 'apply_patch',
            args: JSON.stringify({ patch }),
          },
        ],
      },
      {
        text: 'Finished patch',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools: loopTools,
      history,
      eventBus,
      workspaceRoot: testWorkspace,
      options: { permissionMode: 'auto', skipVerification: true },
    });

    const sessionId = `s-${crypto.randomUUID()}`;
    sm.createSession(sessionId);
    const summary = await loop.run({ sessionId, userInput: 'Apply patch', workspaceRoot: testWorkspace });
    sm.close();

    expect(summary.status).toBe('completed');
    expect(summary.changeSetId).toBeDefined();

    const store = new ChangeSetStore(path.join(testWorkspace, '.agentos/changesets'));
    const cs = store.load(summary.changeSetId!);
    expect(cs).not.toBeNull();
    expect(cs!.files).toHaveLength(1);
    expect(cs!.files[0].path).toBe('init.ts');
    expect(cs!.files[0].kind).toBe('modify');
    expect(cs!.files[0].diff).toContain('-export const val = 0;');
    expect(cs!.files[0].diff).toContain('+export const val = 42;');

    const errors = validateChangeSet(cs!);
    expect(errors).toHaveLength(0);
  });
});
