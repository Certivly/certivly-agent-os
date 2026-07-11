import { Strategy } from '../models';

export class StrategyStore {
  private strategies: Map<string, Strategy> = new Map();
  private outputDir: string;

  constructor(outputDir: string = '.agentos/brain') {
    this.outputDir = outputDir;
  }

  public save(strategy: Strategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  public get(id: string): Strategy | undefined {
    return this.strategies.get(id);
  }

  public getAll(): Strategy[] {
    return Array.from(this.strategies.values());
  }

  public async persist(): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(this.outputDir, 'strategies.json'),
      JSON.stringify(this.getAll(), null, 2)
    );
  }

  public async load(): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(this.outputDir, 'strategies.json');
    if (fs.existsSync(filePath)) {
      const data: Strategy[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      this.strategies.clear();
      for (const s of data) this.save(s);
    }
  }
}
