import * as fs from "fs";
import * as path from "path";
import { BrainStore } from "../store/BrainStore";
import { SuccessMemory } from "../memory/SuccessMemory";
import { FailureMemory } from "../memory/FailureMemory";

export class BrainCompiler {
  constructor(
    private store: BrainStore,
    private successMemory: SuccessMemory,
    private failureMemory: FailureMemory,
    private outputDir: string = ".agentos/brain"
  ) {}

  public async compile(): Promise<void> {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Write all intelligence as raw JSON files
    const write = (filename: string, data: any) => {
      fs.writeFileSync(
        path.join(this.outputDir, filename),
        JSON.stringify(data, null, 2)
      );
    };

    write("repository-profile.json", this.store.profile);
    write("conventions.json", this.store.conventions);
    write("patterns.json", this.store.patterns);
    write("hot-files.json", this.store.hotFiles);
    write("success-memory.json", this.successMemory.getAll());
    write("failure-memory.json", this.failureMemory.getAll());
  }

  public async load(): Promise<void> {
    if (!fs.existsSync(this.outputDir)) return;

    const read = (filename: string, fallback: any) => {
      try {
        const filePath = path.join(this.outputDir, filename);
        if (fs.existsSync(filePath)) {
          return JSON.parse(fs.readFileSync(filePath, "utf-8"));
        }
      } catch (e) {
        // Ignored
      }
      return fallback;
    };

    this.store.profile = read("repository-profile.json", null);
    this.store.conventions = read("conventions.json", []);
    this.store.patterns = read("patterns.json", []);
    this.store.hotFiles = read("hot-files.json", []);
    this.store.rebuildIndexes();

    const successes = read("success-memory.json", []);
    for (const s of successes) this.successMemory.store(s);

    const failures = read("failure-memory.json", []);
    for (const f of failures) this.failureMemory.store(f);
  }
}
