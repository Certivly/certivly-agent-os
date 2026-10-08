import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { editFileTool } from '../src/implementations/edit_file';
import { writeFileTool } from '../src/implementations/write_file';
import { applyPatchTool } from '../src/implementations/apply_patch';
import type { ToolContext } from '../src/types';

describe('Edit, Write, and Patch Tools (Action 2.03)', () => {
  const testWorkspace = path.join(__dirname, '.tmp-edit-patch-ws');
  const context: ToolContext = { workspaceRoot: testWorkspace };

  beforeEach(() => {
    if (fs.existsSync(testWorkspace)) {
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(testWorkspace, { recursive: true });

    // Seed file
    fs.writeFileSync(path.join(testWorkspace, 'app.ts'), 'function main() {\n  return 1;\n}\n');
    fs.writeFileSync(path.join(testWorkspace, 'multi.ts'), 'apple\nbanana\napple\n');
    fs.writeFileSync(path.join(testWorkspace, 'crlf.ts'), 'line1\r\nline2\r\nline3\r\n');
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testWorkspace)) fs.rmSync(testWorkspace, { recursive: true, force: true });
    } catch {}
  });

  it('1. exact one-match edit updates file', async () => {
    const res = await editFileTool.execute({
      path: 'app.ts',
      oldText: 'return 1;',
      newText: 'return 42;',
    }, context);

    expect(res.isError).toBe(false);
    expect(res.content).toContain('Successfully replaced 1 occurrence');

    const content = fs.readFileSync(path.join(testWorkspace, 'app.ts'), 'utf8');
    expect(content).toContain('return 42;');
    expect(content).not.toContain('return 1;');
  });

  it('2. zero-match failure returns error', async () => {
    const res = await editFileTool.execute({
      path: 'app.ts',
      oldText: 'nonexistent code',
      newText: 'new code',
    }, context);

    expect(res.isError).toBe(true);
    expect(res.content).toContain('oldText not found');
  });

  it('3. multiple-match failure without replaceAll returns error', async () => {
    const res = await editFileTool.execute({
      path: 'multi.ts',
      oldText: 'apple',
      newText: 'orange',
      replaceAll: false,
    }, context);

    expect(res.isError).toBe(true);
    expect(res.content).toContain('Multiple occurrences (2) of oldText found');
  });

  it('4. replace all replaces all occurrences', async () => {
    const res = await editFileTool.execute({
      path: 'multi.ts',
      oldText: 'apple',
      newText: 'orange',
      replaceAll: true,
    }, context);

    expect(res.isError).toBe(false);
    expect(res.content).toContain('Successfully replaced 2 occurrence(s)');

    const content = fs.readFileSync(path.join(testWorkspace, 'multi.ts'), 'utf8');
    expect(content).toBe('orange\nbanana\norange\n');
  });

  it('5. CRLF line endings are preserved', async () => {
    const res = await editFileTool.execute({
      path: 'crlf.ts',
      oldText: 'line2',
      newText: 'line2_updated',
    }, context);

    expect(res.isError).toBe(false);
    const content = fs.readFileSync(path.join(testWorkspace, 'crlf.ts'), 'utf8');
    expect(content).toContain('line2_updated');
    expect(content).toContain('\r\n');
  });

  it('6. write new file creates file and directories', async () => {
    const res = await writeFileTool.execute({
      path: 'nested/dir/new.txt',
      content: 'hello new file',
    }, context);

    expect(res.isError).toBe(false);
    const content = fs.readFileSync(path.join(testWorkspace, 'nested', 'dir', 'new.txt'), 'utf8');
    expect(content).toBe('hello new file');
  });

  it('7. overwrite refused unless overwrite:true', async () => {
    const res1 = await writeFileTool.execute({
      path: 'app.ts',
      content: 'overwritten',
      overwrite: false,
    }, context);

    expect(res1.isError).toBe(true);
    expect(res1.content).toContain('already exists and overwrite is false');

    const res2 = await writeFileTool.execute({
      path: 'app.ts',
      content: 'overwritten',
      overwrite: true,
    }, context);

    expect(res2.isError).toBe(false);
    expect(fs.readFileSync(path.join(testWorkspace, 'app.ts'), 'utf8')).toBe('overwritten');
  });

  it('8. multi-file patch applies atomically', async () => {
    fs.writeFileSync(path.join(testWorkspace, 'f1.ts'), 'const a = 1;\n');
    fs.writeFileSync(path.join(testWorkspace, 'f2.ts'), 'const b = 2;\n');

    const patch = `
*** Begin Patch
*** File: f1.ts
<<<<
const a = 1;
====
const a = 100;
>>>>
*** File: f2.ts
<<<<
const b = 2;
====
const b = 200;
>>>>
*** End Patch
    `.trim();

    const res = await applyPatchTool.execute({ patch }, context);
    expect(res.isError).toBe(false);

    expect(fs.readFileSync(path.join(testWorkspace, 'f1.ts'), 'utf8')).toBe('const a = 100;\n');
    expect(fs.readFileSync(path.join(testWorkspace, 'f2.ts'), 'utf8')).toBe('const b = 200;\n');
  });

  it('9. second-file patch failure leaves first unchanged (atomic rollback)', async () => {
    fs.writeFileSync(path.join(testWorkspace, 'first.ts'), 'original first;\n');
    fs.writeFileSync(path.join(testWorkspace, 'second.ts'), 'original second;\n');

    const badPatch = `
*** Begin Patch
*** File: first.ts
<<<<
original first;
====
modified first;
>>>>
*** File: second.ts
<<<<
nonexistent hunk;
====
modified second;
>>>>
*** End Patch
    `.trim();

    const res = await applyPatchTool.execute({ patch: badPatch }, context);
    expect(res.isError).toBe(true);
    expect(res.content).toContain('not found');

    // First file MUST be unchanged!
    expect(fs.readFileSync(path.join(testWorkspace, 'first.ts'), 'utf8')).toBe('original first;\n');
    expect(fs.readFileSync(path.join(testWorkspace, 'second.ts'), 'utf8')).toBe('original second;\n');
  });

  it('10. path traversal is rejected', async () => {
    const res = await writeFileTool.execute({
      path: '../outside.txt',
      content: 'hacked',
    }, context);

    expect(res.isError).toBe(true);
    expect(res.content).toContain('Security Violation');
  });

  it('11. .git/ modification is rejected', async () => {
    const res = await writeFileTool.execute({
      path: '.git/config',
      content: 'hacked',
    }, context);

    expect(res.isError).toBe(true);
    expect(res.content).toContain('Security Violation');

    const patchRes = await applyPatchTool.execute({
      patch: `*** File: .git/HEAD\n<<<<\nref\n====\nnewref\n>>>>`,
    }, context);
    expect(patchRes.isError).toBe(true);
    expect(patchRes.content).toContain('Security Violation');
  });
});
