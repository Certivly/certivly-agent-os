import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ChangeSetStore, type ChangeSet } from '@agent-os/patch-engine';

describe('Patch Save and Show', () => {
  let tempDir: string;
  let store: ChangeSetStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentos-patch-test-'));
    store = new ChangeSetStore(tempDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('3. patch save writes expected diff and 5. patch show renders changed file list', () => {
    const runId = 'test-run-patch-1';
    const sampleDiff = `--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import * as os from 'os';
+import * as fs from 'fs';
 export const version = '1.0';`;

    const changeSet: ChangeSet = {
      id: runId,
      workspaceRoot: tempDir,
      files: [
        {
          path: 'src/index.ts',
          kind: 'modify',
          diff: sampleDiff,
          afterContent: "import * as os from 'os';\nimport * as fs from 'fs';\nexport const version = '1.0';",
        },
        {
          path: 'new-file.ts',
          kind: 'add',
          diff: `--- /dev/null\n+++ b/new-file.ts\n@@ -0,0 +1,1 @@\n+export const newFeature = true;`,
          afterContent: 'export const newFeature = true;',
        },
      ],
      createdAt: new Date().toISOString(),
    };

    // Save ChangeSet
    store.save(changeSet);

    // Verify loading exact ChangeSet for runId
    const loaded = store.load(runId);
    expect(loaded).toBeDefined();
    expect(loaded?.id).toBe(runId);
    expect(loaded?.files.length).toBe(2);

    // 5. patch show renders changed file list
    const fileList = loaded!.files.map(f => `[${f.kind.toUpperCase()}] ${f.path}`);
    expect(fileList).toContain('[MODIFY] src/index.ts');
    expect(fileList).toContain('[ADD] new-file.ts');

    // 3. patch save writes expected diff
    const unifiedDiff = ChangeSetStore.toUnifiedDiff(loaded!);
    expect(unifiedDiff).toContain('--- a/src/index.ts');
    expect(unifiedDiff).toContain('+import * as fs from \'fs\';');
    expect(unifiedDiff).toContain('+++ b/new-file.ts');

    const outPatchPath = path.join(tempDir, 'change.patch');
    fs.writeFileSync(outPatchPath, unifiedDiff, 'utf8');

    const writtenContent = fs.readFileSync(outPatchPath, 'utf8');
    expect(writtenContent).toBe(unifiedDiff);
  });
});
