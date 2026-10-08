import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RuntimeAuditor } from '../src/RuntimeAuditor';
import { BoundaryImportScanner } from '../src/BoundaryImportScanner';
import { RuntimeHealthChecker } from '../src/RuntimeHealthChecker';
import { LoggingEventBus } from '@agent-os/shared';

describe('Runtime Audit & Dead-Code Quarantine (Action 2.17)', () => {
  let tempWorkspaceRoot: string;

  beforeEach(() => {
    tempWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-audit-test-'));

    // Create minimal mock monorepo structure
    fs.mkdirSync(path.join(tempWorkspaceRoot, 'apps', 'cli', 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempWorkspaceRoot, 'packages', 'reachable-pkg', 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempWorkspaceRoot, 'packages', 'unreachable-pkg', 'src'), { recursive: true });

    // apps/cli/package.json
    fs.writeFileSync(
      path.join(tempWorkspaceRoot, 'apps', 'cli', 'package.json'),
      JSON.stringify({
        name: '@agent-os/cli',
        version: '1.0.0',
        dependencies: {
          '@agent-os/reachable-pkg': 'workspace:*',
        },
      })
    );

    // packages/reachable-pkg/package.json
    fs.writeFileSync(
      path.join(tempWorkspaceRoot, 'packages', 'reachable-pkg', 'package.json'),
      JSON.stringify({
        name: '@agent-os/reachable-pkg',
        version: '1.0.0',
        dependencies: {},
      })
    );
    fs.writeFileSync(
      path.join(tempWorkspaceRoot, 'packages', 'reachable-pkg', 'src', 'index.ts'),
      'export const reachable = true;\n'
    );

    // packages/unreachable-pkg/package.json
    fs.writeFileSync(
      path.join(tempWorkspaceRoot, 'packages', 'unreachable-pkg', 'package.json'),
      JSON.stringify({
        name: '@agent-os/unreachable-pkg',
        version: '1.0.0',
        dependencies: {},
      })
    );
    fs.writeFileSync(
      path.join(tempWorkspaceRoot, 'packages', 'unreachable-pkg', 'src', 'index.ts'),
      'export const dead = true;\n'
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWorkspaceRoot, { recursive: true, force: true });
    } catch {}
  });

  it('1. reachable package not flagged and 2. unreachable package flagged', async () => {
    const bus = new LoggingEventBus();
    const auditor = new RuntimeAuditor(bus, tempWorkspaceRoot);
    const snapshot = await auditor.audit();

    // 1. reachable-pkg should be active / not disconnected
    expect(snapshot.disconnectedPackages).not.toContain('@agent-os/reachable-pkg');
    const reachableNode = snapshot.packages.find((p) => p.name === '@agent-os/reachable-pkg');
    expect(reachableNode?.status).toBe('ACTIVE');

    // 2. unreachable-pkg should be detected as dead / disconnected
    expect(snapshot.disconnectedPackages).toContain('@agent-os/unreachable-pkg');
    const unreachableNode = snapshot.packages.find((p) => p.name === '@agent-os/unreachable-pkg');
    expect(unreachableNode?.status).toBe('DEAD');
  });

  it('3. relative cross-package import flagged', async () => {
    // Add a forbidden relative import from reachable-pkg into another package
    fs.writeFileSync(
      path.join(tempWorkspaceRoot, 'packages', 'reachable-pkg', 'src', 'bad.ts'),
      `import { dead } from '../../unreachable-pkg/src/index';\nconsole.log(dead);\n`
    );

    const scanner = new BoundaryImportScanner(tempWorkspaceRoot);
    const violations = await scanner.scanImports();

    expect(violations.length).toBeGreaterThanOrEqual(1);
    const relViolation = violations.find((v) => v.type === 'relative-cross-package');
    expect(relViolation).toBeDefined();
    expect(relViolation?.importPath).toContain('../../unreachable-pkg/src/index');
    expect(relViolation?.message).toContain('Relative cross-package import forbidden');
  });

  it('4. deep package import flagged', async () => {
    // Add a forbidden deep import: @agent-os/<pkg>/src/...
    fs.writeFileSync(
      path.join(tempWorkspaceRoot, 'packages', 'reachable-pkg', 'src', 'deep.ts'),
      `import { foo } from '@agent-os/other/src/internal/foo';\nconsole.log(foo);\n`
    );

    const scanner = new BoundaryImportScanner(tempWorkspaceRoot);
    const violations = await scanner.scanImports();

    expect(violations.length).toBeGreaterThanOrEqual(1);
    const deepViolation = violations.find((v) => v.type === 'deep-package-import');
    expect(deepViolation).toBeDefined();
    expect(deepViolation?.importPath).toBe('@agent-os/other/src/internal/foo');
    expect(deepViolation?.message).toContain('Deep package import forbidden');
  });

  it('5. doctor report detects violations and health checker produces error list', async () => {
    // Unreachable package exists in tempWorkspaceRoot
    const bus = new LoggingEventBus();
    const auditor = new RuntimeAuditor(bus, tempWorkspaceRoot);
    const snapshot = await auditor.audit();

    // Add a violation
    const violations = [
      {
        file: 'packages/reachable-pkg/src/bad.ts',
        relativeFile: 'packages/reachable-pkg/src/bad.ts',
        line: 1,
        importPath: '../../unreachable-pkg/src',
        type: 'relative-cross-package' as const,
        message: 'Relative cross-package import forbidden',
      },
    ];

    const checker = new RuntimeHealthChecker();
    const report = checker.generateHealthReport(snapshot, violations);

    expect(report).toContain('Unreachable Packages:');
    expect(report).toContain('@agent-os/unreachable-pkg');
    expect(report).toContain('Boundary Violations (1):');
    expect(report).toContain('Relative cross-package import forbidden');

    // Both snapshot.disconnectedPackages and violations should fail health gate
    const isHealthy = snapshot.disconnectedPackages.length === 0 && violations.length === 0;
    expect(isHealthy).toBe(false);
  });
});
