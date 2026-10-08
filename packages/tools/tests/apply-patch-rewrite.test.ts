import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { applyPatchTool } from '../src/implementations/apply_patch';
import type { ToolContext } from '../src/types';

describe('Action 6-09: apply_patch rewrite and hardening', () => {
  let testWorkspace: string;
  let context: ToolContext;

  beforeEach(() => {
    testWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-os-patch-test-'));
    context = { workspaceRoot: testWorkspace };
  });

  afterEach(() => {
    if (fs.existsSync(testWorkspace)) {
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
  });

  it('1. does not corrupt files when replacement text contains $\', $&, $`, or $$', async () => {
    const original = `function processMatch(str) {\n  return str;\n}\n`;
    fs.writeFileSync(path.join(testWorkspace, 'handler.ts'), original, 'utf8');

    const replacement = `function processMatch(str) {\n  const ref = "$& $'";\n  const price = "$$99";\n  const back = "$\`";\n  return str + ref + price + back;\n}\n`;

    const patch = `
*** Begin Patch
*** File: handler.ts
<<<<
function processMatch(str) {
  return str;
}
====
function processMatch(str) {
  const ref = "$& $'";
  const price = "$$99";
  const back = "$\`";
  return str + ref + price + back;
}
>>>>
*** End Patch
`.trim();

    const res = await applyPatchTool.execute({ patch }, context);
    expect(res.isError).toBe(false);

    const actual = fs.readFileSync(path.join(testWorkspace, 'handler.ts'), 'utf8');
    expect(actual).toBe(replacement);
    expect(actual).toContain('$& $\'');
    expect(actual).toContain('$$99');
    expect(actual).toContain('$\`');
  });

  it('2. supports markdown code block envelopes wrapping patch', async () => {
    fs.writeFileSync(path.join(testWorkspace, 'app.ts'), 'const x = 1;\n', 'utf8');

    const patch = '```patch\n*** Begin Patch\n*** File: app.ts\n<<<<\nconst x = 1;\n====\nconst x = 42;\n>>>>\n*** End Patch\n```';

    const res = await applyPatchTool.execute({ patch }, context);
    expect(res.isError).toBe(false);

    const actual = fs.readFileSync(path.join(testWorkspace, 'app.ts'), 'utf8');
    expect(actual).toBe('const x = 42;\n');
  });

  it('3. handles multiple hunks in a single file', async () => {
    const original = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';
    fs.writeFileSync(path.join(testWorkspace, 'multi.ts'), original, 'utf8');

    const patch = `
*** Begin Patch
*** File: multi.ts
<<<<
const a = 1;
====
const a = 10;
>>>>
<<<<
const c = 3;
====
const c = 30;
>>>>
*** End Patch
`.trim();

    const res = await applyPatchTool.execute({ patch }, context);
    expect(res.isError).toBe(false);

    const actual = fs.readFileSync(path.join(testWorkspace, 'multi.ts'), 'utf8');
    expect(actual).toBe('const a = 10;\nconst b = 2;\nconst c = 30;\n');
  });

  it('4. supports creating new files via patch', async () => {
    const patch = `
*** Begin Patch
*** Add File: src/new_module.ts
<<<<
====
export const answer = 42;
>>>>
*** End Patch
`.trim();

    const res = await applyPatchTool.execute({ patch }, context);
    expect(res.isError).toBe(false);

    const actual = fs.readFileSync(path.join(testWorkspace, 'src', 'new_module.ts'), 'utf8');
    expect(actual).toBe('export const answer = 42;\n');
  });

  it('5. supports deleting files via patch', async () => {
    fs.writeFileSync(path.join(testWorkspace, 'obsolete.ts'), 'console.log("bye");\n', 'utf8');

    const patch = `
*** Begin Patch
*** Delete File: obsolete.ts
*** End Patch
`.trim();

    const res = await applyPatchTool.execute({ patch }, context);
    expect(res.isError).toBe(false);
    expect(fs.existsSync(path.join(testWorkspace, 'obsolete.ts'))).toBe(false);
  });

  it('6. atomic rollback when hunk validation fails in second file', async () => {
    fs.writeFileSync(path.join(testWorkspace, 'file1.ts'), 'original 1\n', 'utf8');
    fs.writeFileSync(path.join(testWorkspace, 'file2.ts'), 'original 2\n', 'utf8');

    const badPatch = `
*** Begin Patch
*** File: file1.ts
<<<<
original 1
====
updated 1
>>>>
*** File: file2.ts
<<<<
nonexistent hunk
====
updated 2
>>>>
*** End Patch
`.trim();

    const res = await applyPatchTool.execute({ patch: badPatch }, context);
    expect(res.isError).toBe(true);

    // file1 must not have been modified
    expect(fs.readFileSync(path.join(testWorkspace, 'file1.ts'), 'utf8')).toBe('original 1\n');
    expect(fs.readFileSync(path.join(testWorkspace, 'file2.ts'), 'utf8')).toBe('original 2\n');
  });

  it('7. atomic rollback if an unexpected error occurs during disk write', async () => {
    fs.writeFileSync(path.join(testWorkspace, 'f1.ts'), 'f1 original\n', 'utf8');
    fs.writeFileSync(path.join(testWorkspace, 'f2.ts'), 'f2 original\n', 'utf8');

    // Make f2 a directory so writing to it as a file fails
    fs.rmSync(path.join(testWorkspace, 'f2.ts'));
    fs.mkdirSync(path.join(testWorkspace, 'f2.ts'));

    const patch = `
*** Begin Patch
*** File: f1.ts
<<<<
f1 original
====
f1 updated
>>>>
*** File: f2.ts
<<<<
====
f2 content
>>>>
*** End Patch
`.trim();

    const res = await applyPatchTool.execute({ patch }, context);
    expect(res.isError).toBe(true);

    // f1 should have been rolled back to original
    expect(fs.readFileSync(path.join(testWorkspace, 'f1.ts'), 'utf8')).toBe('f1 original\n');
  });

  it('8. unified diff wrapped in *** Begin Patch preserves special characters', async () => {
    fs.writeFileSync(path.join(testWorkspace, 'util.ts'), 'const pattern = 1;\n', 'utf8');

    const patch = `
*** Begin Patch
--- a/util.ts
+++ b/util.ts
@@ -1 +1 @@
-const pattern = 1;
+const pattern = "$& $'";
*** End Patch
`.trim();

    const res = await applyPatchTool.execute({ patch }, context);
    expect(res.isError).toBe(false);

    const actual = fs.readFileSync(path.join(testWorkspace, 'util.ts'), 'utf8');
    expect(actual).toBe('const pattern = "$& $\'";\n');
  });
});
