# Plan 04: Best-of-N Trajectory Thinking & Judge Selection

**Document:** `plans/v2/04-best-of-n-thinking-and-judge.md`  
**Date:** 2026-10-09  
**Status:** Implementation Specification  
**Benchmark Source:** Freebuff (`agents/thinker/best-of-n/`)

---

## 1. Problem Statement & Motivation

When facing high-complexity challenges (e.g. race conditions, parser re-writes, database schema migrations, subtle compiler errors), a single LLM trajectory frequently suffers from **premature cognitive commitment**:
- The model locks onto the first plausible fix that comes to mind.
- It writes code, fails verification, attempts a minor patch, and enters an edit-test loop.
- It wastes 5 to 10 turns trying to force a flawed approach instead of exploring alternative architectural hypotheses.

---

## 2. Freebuff Architecture Pattern (`thinker/best-of-n/`)

Freebuff introduces a **Best-of-N Thinker & Judge** pipeline:
1. **Context Aggregation**: All relevant file contents and compiler errors are gathered *prior* to invocation.
2. **Parallel Generation (`GENERATE_N`)**:
   - The engine issues $N$ parallel generation requests (typically $N=3$ to $5$) with differing sampling parameters or system instruction variations (e.g. Solution A: in-place refactor; Solution B: rewrite with new abstraction; Solution C: algorithmic optimization).
3. **Internal Thinking Slices**: Each candidate thinks independently using explicit `<think>` scratchpads.
4. **Judge / Selector Agent (`thinker-selector`)**:
   - A dedicated evaluation prompt/model receives all $N$ candidate trajectories labeled A, B, C...
   - The Judge evaluates them across:
     - Edge case handling
     - Architectural elegance & adherence to repository conventions
     - Regression risk & backwards compatibility
     - Completeness (no stubs or partial implementations)
   - Outputs the winning candidate and explains the rationale.

---

## 3. AgentOS Engineering Specification

### 3.1. Subsystem Architecture: `packages/agent-runtime/src/planning/BestOfNPlanner.ts`

```typescript
export interface CandidateTrajectory {
  id: string; // 'A', 'B', 'C', ...
  proposal: string;
  reasoning?: string;
  confidenceScore?: number;
}

export interface BestOfNResult {
  winningCandidateId: string;
  selectedPlan: string;
  evaluationRationale: string;
  candidateComparisons: Array<{ id: string; strengths: string[]; weaknesses: string[] }>;
}

export class BestOfNPlanner {
  constructor(
    private reasoningModel: Model,
    private judgeModel?: Model
  ) {}

  public async evaluate(
    problemStatement: string,
    contextSummary: string,
    options?: { n?: number; temperature?: number }
  ): Promise<BestOfNResult>;
}
```

### 3.2. Evaluation Prompt Matrix

The Judge model runs an adversarial evaluation rubric:
```markdown
You are an expert Principal Software Architect acting as an impartial Judge.
Analyze the following N independent technical proposals for solving the issue:

<problem>
${problemStatement}
</problem>

<context>
${contextSummary}
</context>

<candidates>
${candidateList}
</candidates>

Task:
1. Identify hidden assumptions or critical flaws in each candidate.
2. Verify backwards compatibility and test coverage.
3. Select the single best candidate (or synthesize the optimal approach combining the best elements of multiple candidates).
4. Output the definitive step-by-step implementation plan.
```

---

## 4. Integration into AgentOS Runtime

1. **Autonomous Triggering**:
   In `AgentLoop.ts`, if `antiLoopMonitor` flags a repetitive edit failure or if `LightweightPlanner` marks task complexity as `complex`, `BestOfNPlanner` is automatically engaged.
2. **Model Routing**:
   - Candidate generation ($N=3$) can run on cost-effective reasoning models (DeepSeek V3, Claude Haiku, or GPT-4o-mini).
   - Judge evaluation runs on the primary flagship model (Claude 3.5 Sonnet, GPT-4o, or Gemini 1.5 Pro).
   - This delivers high reasoning diversity at 70% lower cost than running $N$ runs on flagship models.

---

## 5. Verification & Acceptance Criteria
- [ ] Concurrently generates $N$ distinct solution candidates without blocking the event loop.
- [ ] Judge model parses candidate outputs and generates comparative critique.
- [ ] Validated on real benchmark: solves complex logic bug on turn 1 rather than entering multi-turn thrashing.
