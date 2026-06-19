import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import { StrategyCompiler } from "../src/strategy/StrategyCompiler";
import { StrategyScoreCalculator } from "../src/scoring/StrategyScoreCalculator";
import { StrategyRanker } from "../src/strategy/StrategyRanker";
import { StrategyStore } from "../src/store/StrategyStore";
import { StrategyEngine } from "../src/strategy/StrategyEngine";
import { FailureAvoidanceEngine } from "../src/planner/FailureAvoidanceEngine";
import { StrategyQueryEngine } from "../src/query/StrategyQueryEngine";
import { PlanningAdvisor } from "../src/planner/PlanningAdvisor";
import { GoalFingerprintEngine } from "../src/planner/GoalFingerprint";
import { GoalClassifier } from "../src/planner/GoalClassifier";
import { SimilarGoalFinder } from "../src/planner/SimilarGoalFinder";

// Mock memories from Brain v1
import { SuccessMemory } from "../../brain/src/memory/SuccessMemory";
import { FailureMemory } from "../../brain/src/memory/FailureMemory";

describe("Brain v2 Replay & Determinism", () => {
  const TEST_DIR = ".agentos/brain_v2_test";

  beforeAll(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  });

  test("compiles, scores, and ranks strategies deterministically", async () => {
    const successMemory = new SuccessMemory();
    const failureMemory = new FailureMemory();

    // Strategy 1: High success, high trust
    for (let i = 0; i < 95; i++) {
      successMemory.store({
        id: `s1_${i}`, goalId: "g1", planId: "p1", trustScore: 98, taskGraphId: "tg1",
        affectedFiles: ["src/auth.ts"], executionPath: ["Search", "Patch", "Test"], timestamp: 1000
      });
    }
    for (let i = 0; i < 5; i++) {
      failureMemory.store({
        id: `f1_${i}`, goalId: "g1", reason: "fail", trustScore: 50, failedNodeId: "n1",
        affectedFiles: ["src/auth.ts"], executionPath: ["Search", "Patch", "Test"], timestamp: 1000
      });
    }

    // Strategy 2: High failure rate (Should be avoided)
    for (let i = 0; i < 2; i++) {
      successMemory.store({
        id: `s2_${i}`, goalId: "g2", planId: "p2", trustScore: 90, taskGraphId: "tg2",
        affectedFiles: ["src/ui.tsx"], executionPath: ["Search", "Patch", "Build"], timestamp: 1000
      });
    }
    for (let i = 0; i < 8; i++) {
      failureMemory.store({
        id: `f2_${i}`, goalId: "g2", reason: "fail", trustScore: 20, failedNodeId: "n2",
        affectedFiles: ["src/ui.tsx"], executionPath: ["Search", "Patch", "Build"], timestamp: 1000
      });
    }

    const store = new StrategyStore(TEST_DIR);
    const compiler = new StrategyCompiler(successMemory, failureMemory);
    const engine = new StrategyEngine(compiler, store);

    // 1. Compile
    const strategies = engine.executePipeline();
    expect(strategies.length).toBe(2);

    await store.persist();
    expect(fs.existsSync(`${TEST_DIR}/strategies.json`)).toBe(true);

    // 2. Score & Rank
    const calculator = new StrategyScoreCalculator();
    const ranker = new StrategyRanker(calculator);
    const ranked = ranker.rank(strategies);
    
    expect(ranked[0].strategyId).toBe(strategies.find(s => s.successRate === 0.95)!.id);

    // 3. Failure Avoidance & Advising
    const queryEngine = new StrategyQueryEngine(store);
    const avoidanceEngine = new FailureAvoidanceEngine();
    const advisor = new PlanningAdvisor(queryEngine, ranker, avoidanceEngine);

    const advice = advisor.advise();
    expect(advice.recommendedStrategy).toBe(ranked[0].strategyId);
    expect(advice.confidence).toBe(0.95);

    // 4. Fingerprinting
    const fpEngine = new GoalFingerprintEngine();
    const sig = fpEngine.generate("Fix the login bug", ["src/auth/login.ts"]);
    expect(sig.action).toBe("fix");
    expect(sig.domain).toBe("auth");
    expect(sig.repositoryAreas).toEqual(["src"]);

    const classifier = new GoalClassifier();
    expect(classifier.classify(sig)).toBe("fix:auth:runtime");

    // 5. Replay from disk
    const store2 = new StrategyStore(TEST_DIR);
    await store2.load();
    expect(store2.getAll().length).toBe(2);
    expect(store2.getAll()[0].executions).toBe(100);
  });
});
