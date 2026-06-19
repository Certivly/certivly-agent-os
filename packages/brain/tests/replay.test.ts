import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import { RepositoryProfiler } from "../src/profile/RepositoryProfiler";
import { ConventionEngine } from "../src/conventions/ConventionEngine";
import { SuccessMemory } from "../src/memory/SuccessMemory";
import { FailureMemory } from "../src/memory/FailureMemory";
import { SuccessPatternMiner } from "../src/patterns/SuccessPatternMiner";
import { FailurePatternMiner } from "../src/patterns/FailurePatternMiner";
import { PatternMiner } from "../src/patterns/PatternMiner";
import { BrainStore } from "../src/store/BrainStore";
import { BrainCompiler } from "../src/compiler/BrainCompiler";
import { HotFileAnalyzer } from "../src/patterns/HotFileAnalyzer";

describe("Repository Brain Replay & Determinism", () => {
  const TEST_DIR = ".agentos/brain_test_replay";

  beforeAll(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  });

  test("builds repository profiles and learns conventions deterministically", async () => {
    // 1. Profiling
    const profiler = new RepositoryProfiler();
    const profile = profiler.profile(
      { dependencies: { "next": "13.0.0" }, devDependencies: { "jest": "29.0.0" } },
      ["package.json", "pnpm-lock.yaml", "src/index.ts", "src/app.tsx", "src/utils.js"],
      ["src/features"]
    );

    expect(profile.framework).toBe("Next.js");
    expect(profile.packageManager).toBe("pnpm");
    expect(profile.testingFramework).toBe("jest");
    expect(profile.architectureStyle).toBe("feature-based");
    expect(profile.languages).toEqual(["JavaScript", "TypeScript"]);
    expect(profile.confidence).toBeGreaterThan(0.8);

    // 2. Conventions
    const conventionEngine = new ConventionEngine();
    const mockFiles = [
      "Button.tsx", "Card.tsx", "Header.tsx", "Footer.tsx", "Sidebar.tsx",
      "useUser.ts", "useAuth.ts", "useQuery.ts", "useTheme.ts", "useStore.ts"
    ];
    
    const conventions = conventionEngine.discover(mockFiles);
    expect(conventions.length).toBe(2);
    expect(conventions[0].type).toBe("naming");
    expect(conventions[1].type).toBe("naming");

    // 3. Memories
    const successMemory = new SuccessMemory();
    const failureMemory = new FailureMemory();

    // Store memories
    for (let i = 0; i < 5; i++) {
      successMemory.store({
        id: `s_${i}`, goalId: "g1", planId: "p1", trustScore: 95, taskGraphId: "tg1",
        affectedFiles: ["src/app.tsx"], executionPath: ["Search", "Patch", "Test"], timestamp: 1000 + i
      });
      failureMemory.store({
        id: `f_${i}`, goalId: "g2", reason: "build fail", trustScore: 20, failedNodeId: "n1",
        affectedFiles: ["src/utils.js"], executionPath: ["Search", "Patch", "Build"], timestamp: 1000 + i
      });
    }

    // 4. Pattern Mining
    const patternMiner = new PatternMiner(
      new SuccessPatternMiner(successMemory),
      new FailurePatternMiner(failureMemory)
    );
    const patterns = patternMiner.mine();
    
    expect(patterns.length).toBe(2);
    expect(patterns.find(p => p.category === "success")?.occurrences).toBe(5);
    expect(patterns.find(p => p.category === "failure")?.occurrences).toBe(5);

    // 5. Hot Files
    const hotFileAnalyzer = new HotFileAnalyzer(successMemory, failureMemory);
    const hotFiles = hotFileAnalyzer.analyze();
    expect(hotFiles.length).toBe(2);

    // 6. Compiler and Replay (Persistence)
    const store = new BrainStore();
    store.profile = profile;
    store.conventions = conventions;
    store.patterns = patterns;
    store.hotFiles = hotFiles;

    const compiler = new BrainCompiler(store, successMemory, failureMemory, TEST_DIR);
    await compiler.compile(); // writes to disk

    // Verify files exist
    expect(fs.existsSync(`${TEST_DIR}/repository-profile.json`)).toBe(true);
    expect(fs.existsSync(`${TEST_DIR}/conventions.json`)).toBe(true);
    expect(fs.existsSync(`${TEST_DIR}/success-memory.json`)).toBe(true);

    // Wipe store and reload
    const store2 = new BrainStore();
    const successMemory2 = new SuccessMemory();
    const failureMemory2 = new FailureMemory();
    const compiler2 = new BrainCompiler(store2, successMemory2, failureMemory2, TEST_DIR);
    await compiler2.load();

    expect(store2.profile?.framework).toBe("Next.js");
    expect(store2.conventions.length).toBe(2);
    expect(store2.patterns.length).toBe(2);
    expect(successMemory2.getAll().length).toBe(5);
  });
});
