import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { EvalLoader } from '../src/eval/EvalLoader';
import { EvalRunner } from '../src/eval/EvalRunner';

describe('Action 3.02: Smoke Gate & CI Configuration', () => {
  it('1. package.json contains gate:smoke script', () => {
    const rootPkgPath = path.resolve(process.cwd(), 'package.json');
    expect(fs.existsSync(rootPkgPath)).toBe(true);
    const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));

    expect(rootPkg.scripts).toBeDefined();
    expect(rootPkg.scripts['gate:smoke']).toBeDefined();
    expect(rootPkg.scripts['gate:smoke']).toContain('eval --task smoke --model fake:scripted');
  });

  it('2. CI workflow file exists and invokes gate:smoke', () => {
    const ciPath = path.resolve(process.cwd(), '.github', 'workflows', 'ci.yml');
    expect(fs.existsSync(ciPath)).toBe(true);
    const content = fs.readFileSync(ciPath, 'utf8');
    expect(content).toContain('bun run gate:smoke');
  });

  it('3. smoke eval task executes real tools with fake:scripted', async () => {
    const tasksRoot = EvalLoader.getDefaultTasksRoot();
    const task = await EvalLoader.loadTask('ts-off-by-one', tasksRoot);

    expect(task.meta.tags).toContain('smoke');

    const result = await EvalRunner.runTask(task, {
      modelName: 'fake:scripted',
    });

    expect(result.passed).toBe(true);
    expect(result.turns).toBe(2);
    expect(result.toolCalls['edit_file']).toBe(1);
    expect(result.filesChanged).toContain('src/array-slice.ts');
    expect(result.verifierOutput).toContain('Verification passed');
  });
});
