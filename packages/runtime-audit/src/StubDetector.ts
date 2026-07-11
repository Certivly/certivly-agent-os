import * as fs from 'fs';
import * as path from 'path';

export class StubDetector {
  public async detectStubs(workspaceRoot: string): Promise<string[]> {
    const bootstrapPath = path.join(workspaceRoot, 'packages', 'runtime-integration', 'src', 'RuntimeBootstrap.ts');
    if (!fs.existsSync(bootstrapPath)) return [];
    
    const content = await fs.promises.readFile(bootstrapPath, 'utf8');
    const stubbedPackages: string[] = [];
    
    const blocks = content.split('this.registry.register');
    for (let i = 1; i < blocks.length; i++) {
      const blockContent = blocks[i-1];
      const match = blocks[i].match(/^\("([^"]+)"/);
      if (match) {
        const pkgKey = match[1];
        // Find the most recent "const X = new Y" or similar in blockContent
        const recentLines = blockContent.split('\n').slice(-10).join('\n');
        if (recentLines.includes('{} as any') || recentLines.includes('Mock') || recentLines.includes(' as any')) {
           stubbedPackages.push(`@agent-os/${pkgKey}`);
        }
      }
    }
    
    return [...new Set(stubbedPackages)];
  }
}
