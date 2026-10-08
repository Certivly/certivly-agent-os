import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { CompetitorEval } from '../src/eval/CompetitorEval';
import { EvalLoader } from '../src/eval/EvalLoader';

describe('Competitor Evaluation Harness', () => {
  const workspaceRoot = path.resolve(__dirname, '../../..');
  const tasksRoot = EvalLoader.getDefaultTasksRoot();

  it('interpolates command template with prompt, repo, and taskId', () => {
    const template = 'my-tool --msg "{prompt}" --dir "{repo}" --id "{taskId}"';
    const result = CompetitorEval.interpolateCommand(template, {
      prompt: 'Fix the off-by-one bug',
      repo: '/tmp/workspace-123',
      taskId: 'ts-off-by-one',
    });

    expect(result).toBe('my-tool --msg "Fix the off-by-one bug" --dir "/tmp/workspace-123" --id "ts-off-by-one"');
  });

  it('skips competitor when binary is not found on PATH', async () => {
    const task = await EvalLoader.loadTask('ts-off-by-one', tasksRoot);
    const result = await CompetitorEval.runCompetitorTask(
      'missing-tool',
      'totally-nonexistent-binary-998877 "{prompt}"',
      task
    );

    expect(result.status).toBe('skipped');
    expect(result.failureCategory).toBe('MISSING_BINARY');
    expect(result.error).toContain('not found on system PATH');
  });

  it('marks competitor as passed when it applies the fix and verifier succeeds', async () => {
    const task = await EvalLoader.loadTask('ts-off-by-one', tasksRoot);

    // Fake competitor using bun to fix the off-by-one error
    // In src/array-slice.ts: replace "i <= length" with "i < length"
    const fakeScript = `
      const fs = require('fs');
      const p = require('path').join(process.env.AGENTOS_COMPETITOR_WORKSPACE, 'src', 'array-slice.ts');
      const content = fs.readFileSync(p, 'utf8');
      fs.writeFileSync(p, content.replace('i <= length', 'i < length'));
    `.replace(/\n\s+/g, ' ');

    const commandTemplate = `bun -e "${fakeScript}"`;

    const result = await CompetitorEval.runCompetitorTask('fake-solver', commandTemplate, task);

    expect(result.status).toBe('passed');
    expect(result.filesChanged).toBeGreaterThan(0);
    expect(result.failureCategory).toBeUndefined();
  });

  it('categorizes failure as NO_FILES_MODIFIED when competitor does not modify files', async () => {
    const task = await EvalLoader.loadTask('ts-off-by-one', tasksRoot);

    // Competitor exits 0 but touches nothing
    const commandTemplate = 'bun -e "console.log(\'Doing nothing\')"';
    const result = await CompetitorEval.runCompetitorTask('fake-noop', commandTemplate, task);

    expect(result.status).toBe('failed');
    expect(result.filesChanged).toBe(0);
    expect(result.failureCategory).toBe('NO_FILES_MODIFIED');
  });

  it('generates benchmark report with AgentOS and competitor rows and summarizes failure categories', async () => {
    const task = await EvalLoader.loadTask('ts-off-by-one', tasksRoot);

    const reportPath = path.join(workspaceRoot, 'reports', 'test-competitive-benchmark.md');

    try {
      const benchmark = await CompetitorEval.runBenchmark({
        tasks: [task],
        agentOsModel: 'fake:scripted',
        config: {
          competitors: {
            'fake-noop': 'bun -e "console.log(\'noop\')"',
            'missing-bin': 'fake-missing-executable-12345 "{prompt}"',
          },
        },
        reportPath,
      });

      expect(benchmark.agentOsResults).toHaveLength(1);
      expect(benchmark.agentOsResults[0].passed).toBe(true);

      expect(benchmark.competitorResults).toHaveLength(2);

      const md = benchmark.markdownReport;
      // Report contains headers and AgentOS row
      expect(md).toContain('# Competitive Benchmark Report');
      expect(md).toContain('**AgentOS**');
      expect(md).toContain('**fake-noop**');
      expect(md).toContain('**missing-bin**');

      // Failure categories summarized
      expect(md).toContain('## 3. Failure Categories Summary');
      expect(md).toContain('`NO_FILES_MODIFIED`');
      expect(md).toContain('`MISSING_BINARY`');

      // File was saved
      expect(fs.existsSync(reportPath)).toBe(true);
    } finally {
      try {
        if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);
      } catch {}
    }
  });
});
