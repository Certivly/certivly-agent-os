import { expect, test, describe } from "bun:test";
import { EvidenceCollector } from "../src/evidence/EvidenceCollector";
import { ClaimEngine } from "../src/claims/ClaimEngine";
import { VerificationEngine } from "../src/verification/VerificationEngine";
import { ContradictionDetector } from "../src/contradictions/ContradictionDetector";
import { TrustScoreCalculator } from "../src/trust/TrustScoreCalculator";
import { TrustEngine } from "../src/trust/TrustEngine";
import { GoalApprovalEngine } from "../src/trust/GoalApprovalEngine";
import { RegressionDetector } from "../src/regression/RegressionDetector";
import { BaselineManager } from "../src/regression/BaselineManager";
import { DiffAnalyzer } from "../src/regression/DiffAnalyzer";
import { Goal } from "@agent-os/adaptive-runtime/src/models/Goal";

describe("Trust Runtime Stress Test", () => {
  test("processes 1k goals, 10k claims, 100k evidence natively", async () => {
    const collector = new EvidenceCollector();
    const claimEngine = new ClaimEngine();
    const verifier = new VerificationEngine();
    const detector = new ContradictionDetector();
    const calculator = new TrustScoreCalculator();
    const trustEngine = new TrustEngine(calculator, verifier, detector);
    const baselineManager = new BaselineManager();
    const diffAnalyzer = new DiffAnalyzer();
    const regressionDetector = new RegressionDetector(baselineManager, diffAnalyzer);
    const approvalEngine = new GoalApprovalEngine();

    const start = performance.now();

    let totalClaims = 0;
    let totalContradictions = 0;
    let approvedGoals = 0;
    let rejectedGoals = 0;

    for (let i = 0; i < 1000; i++) {
      const goal: Goal = {
        id: `goal-${i}`,
        description: "Fix stuff",
        successCriteria: [{ id: `c-${i}`, description: "Pass", type: "test", satisfied: true }],
        status: "pending"
      };

      baselineManager.capture(goal.id, { id: `base-${i}`, testCount: 100, coverage: 80, buildStatus: true, validationStatus: true });

      // Generate 100 evidence items per goal (100k total)
      const evidence = [];
      for (let j = 0; j < 100; j++) {
        // Every goal will have a test failure (so 1000 goals * 10 claims = 10k contradictions)
        const isTestFailure = j === 0; 
        
        evidence.push(
          collector.collect(
            j === 0 ? "test" : "patch",
            "TestAgent",
            { data: { failed: isTestFailure ? 1 : 0 } }
          )
        );
      }

      // Generate 10 claims per goal (10k total)
      const claims = [];
      for (let k = 0; k < 10; k++) {
        claims.push(...claimEngine.extractClaims({
          agentId: "test-agent",
          data: { failed: 0 } // Agent always claims success
        }));
      }
      
      totalClaims += claims.length;

      // 100 goals have failed tests in evidence, but agent claims tests pass -> 100 * 10 claims = 1000 contradictions
      const regressionReport = regressionDetector.detect(goal.id, {
        id: `curr-${i}`,
        testCount: 100,
        coverage: 80,
        buildStatus: true,
        validationStatus: true
      });

      const evaluation = trustEngine.evaluate(goal.id, claims, evidence, regressionReport);
      totalContradictions += evaluation.criticalContradictions;

      const approval = approvalEngine.approve(goal, evaluation);
      if (approval.approved) {
        approvedGoals++;
      } else {
        rejectedGoals++;
      }
    }

    const duration = performance.now() - start;

    expect(collector.getAll().length).toBe(100000); // 100k evidence
    expect(totalClaims).toBe(10000); // 10k claims
    expect(totalContradictions).toBe(10000); // 10k contradictions
    expect(rejectedGoals).toBe(1000); // 1k goals rejected
    expect(approvedGoals).toBe(0);
  }, 10000);
});
