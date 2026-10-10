import { describe, it, expect } from 'bun:test';
import { WiringRecommendationEngine } from '../src/WiringRecommendationEngine';

describe('WiringRecommendationEngine Suite', () => {
  it('generates detailed recommendations for disconnected, stubbed, and boundary violations', () => {
    const engine = new WiringRecommendationEngine();

    const recs = engine.generateDetailed({
      disconnectedPackages: ['@agent-os/unused-pkg'],
      stubbedPackages: ['@agent-os/half-done-pkg'],
      violations: [
        {
          file: 'packages/cli/src/main.ts',
          importPath: '@agent-os/core/src/internal',
          type: 'deep-package-import',
        },
      ],
    });

    expect(recs.length).toBe(3);
    expect(recs[0].packageName).toBe('@agent-os/unused-pkg');
    expect(recs[1].packageName).toBe('@agent-os/half-done-pkg');
    expect(recs[1].issue).toContain('incomplete stub implementations');
    expect(recs[2].packageName).toBe('packages/cli/src/main.ts');
    expect(recs[2].issue).toContain('Boundary violation');
  });
});
