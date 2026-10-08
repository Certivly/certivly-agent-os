import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { checkDocs } from '../../../scripts/check-docs';

describe('Documentation & Links Validation', () => {
  const workspaceRoot = path.resolve(__dirname, '../../..');

  it('verifies all expected core documentation files exist', () => {
    const requiredDocs = [
      'docs/architecture.md',
      'docs/tool-authoring.md',
      'docs/provider-setup.md',
      'docs/evals.md',
      'docs/safety.md',
      'docs/troubleshooting.md',
      'docs/examples/bug-fix.md',
      'docs/examples/add-test.md',
      'docs/examples/approve-patch.md',
    ];

    for (const relDoc of requiredDocs) {
      const fullPath = path.join(workspaceRoot, relDoc);
      expect(fs.existsSync(fullPath)).toBe(true);
      const stat = fs.statSync(fullPath);
      expect(stat.size).toBeGreaterThan(100);
    }
  });

  it('validates relative markdown links and command snippets in docs and README', () => {
    const result = checkDocs(workspaceRoot);
    if (!result.valid) {
      console.error('Doc checker errors:', result.errors);
    }
    expect(result.valid).toBe(true);
    expect(result.docCount).toBeGreaterThanOrEqual(10);
    expect(result.commandSnippetCount).toBeGreaterThan(10);
    expect(result.errors).toHaveLength(0);
  });

  it('detects broken links when target does not exist', () => {
    // Test that the checkDocs logic properly flags missing targets
    const tempDir = fs.mkdtempSync(path.join(workspaceRoot, '.agentos', 'test-doc-check-'));
    try {
      const tempDocs = path.join(tempDir, 'docs');
      fs.mkdirSync(tempDocs, { recursive: true });
      fs.writeFileSync(
        path.join(tempDocs, 'test.md'),
        '# Test Doc\n\nLink to [missing](file:///missing.md) and [ok](file:///test.md).\n'
      );

      const result = checkDocs(tempDir);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('missing.md'))).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('detects unclosed quotes in command snippets', () => {
    const tempDir = fs.mkdtempSync(path.join(workspaceRoot, '.agentos', 'test-cmd-check-'));
    try {
      const tempDocs = path.join(tempDir, 'docs');
      fs.mkdirSync(tempDocs, { recursive: true });
      fs.writeFileSync(
        path.join(tempDocs, 'bad-command.md'),
        '# Bad Snippet\n\n```bash\nagent run "unclosed string\n```\n'
      );

      const result = checkDocs(tempDir);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Unbalanced double quotes'))).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
