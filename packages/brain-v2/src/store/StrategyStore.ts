import * as fs from "fs";
import * as path from "path";
import { Strategy } from "../models/Strategy";

export class StrategyStore {
  private strategies: Map<string, Strategy> = new Map();

  constructor(private outputDir: string = ".agentos/brain") {}

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
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(this.outputDir, "strategies.json"),
      JSON.stringify(this.getAll(), null, 2)
    );
  }

  public async load(): Promise<void> {
    const filePath = path.join(this.outputDir, "strategies.json");
    if (fs.existsSync(filePath)) {
      const data: Strategy[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      this.strategies.clear();
      for (const strategy of data) {
        this.save(strategy);
      }
    }
  }
}
