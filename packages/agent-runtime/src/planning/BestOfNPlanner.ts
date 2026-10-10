import type { Model, GenerationRequest } from '@agent-os/providers';

export interface CandidateTrajectory {
  id: string; // 'A', 'B', 'C', etc.
  proposal: string;
  reasoning?: string;
}

export interface BestOfNResult {
  winningCandidateId: string;
  selectedPlan: string;
  evaluationRationale: string;
  candidates: CandidateTrajectory[];
  durationMs: number;
}

export interface BestOfNOptions {
  n?: number;                 // Number of candidates, default: 3
  temperature?: number;       // Sampling diversity
  reasoningModel?: Model;     // Model for generating candidates
  judgeModel?: Model;         // Model for judging/selecting
  abortSignal?: AbortSignal;
}

export class BestOfNPlanner {
  public static readonly DEFAULT_N = 3;

  constructor(
    private defaultModel: Model,
    private defaultJudgeModel?: Model
  ) {}

  public async evaluate(
    problemStatement: string,
    contextSummary: string,
    options?: BestOfNOptions
  ): Promise<BestOfNResult> {
    const startTime = Date.now();
    const n = Math.min(6, Math.max(2, options?.n ?? BestOfNPlanner.DEFAULT_N));
    const candidateModel = options?.reasoningModel || this.defaultModel;
    const judgeModel = options?.judgeModel || this.defaultJudgeModel || this.defaultModel;

    const candidateLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    // 1. Generate N parallel candidate plans
    const candidatePromises: Promise<CandidateTrajectory>[] = [];

    for (let i = 0; i < n; i++) {
      const letter = candidateLetters[i];
      const request: GenerationRequest = {
        systemPrompt: `You are an expert technical planner. Given a software engineering challenge and repository context, generate a complete, rigorous, and minimal step-by-step implementation plan. Think carefully about edge cases, type safety, and test verification before proposing your solution. Candidate ID: [${letter}].`,
        messages: [
          {
            role: 'user',
            content: `Problem Statement:\n${problemStatement}\n\nContext Summary:\n${contextSummary}\n\nProvide your proposed implementation plan with rationale.`,
          },
        ],
        signal: options?.abortSignal,
      };

      const p = candidateModel.generate(request).then((res) => {
        const rawContent = res.text || '';
        // Extract <think> tags if present
        let reasoning = '';
        let proposal = rawContent;

        const thinkMatch = rawContent.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkMatch) {
          reasoning = thinkMatch[1].trim();
          proposal = rawContent.replace(/<think>[\s\S]*?<\/think>/, '').trim();
        }

        return {
          id: letter,
          proposal: proposal.trim() || rawContent,
          reasoning: reasoning || undefined,
        };
      });

      candidatePromises.push(p);
    }

    const candidates = await Promise.all(candidatePromises);

    // 2. Impartial Judge model evaluates all candidates
    const formattedCandidates = candidates
      .map((c) => `--- CANDIDATE ${c.id} ---\n${c.proposal}`)
      .join('\n\n');

    const judgePrompt = `You are a Principal Software Architect serving as an impartial Judge.
Analyze the following ${n} independent technical proposals for solving the issue.

<problem>
${problemStatement}
</problem>

<context>
${contextSummary}
</context>

<proposals>
${formattedCandidates}
</proposals>

Your task:
1. Identify the pros, cons, edge-case vulnerabilities, and regression risks of each proposal.
2. Select the single best proposal (e.g., A, B, C) or synthesize the optimal strategy.
3. Output your decision in this exact format:

WINNING_CANDIDATE: [A/B/C...]
RATIONALE: [Why this candidate was selected]
FINAL_PLAN:
[Definitive step-by-step instructions for the coding agent]`;

    const judgeRequest: GenerationRequest = {
      systemPrompt: 'You are an objective, rigorous Principal Software Architect judge evaluating competing implementation plans.',
      messages: [{ role: 'user', content: judgePrompt }],
      signal: options?.abortSignal,
    };

    const judgeResponse = await judgeModel.generate(judgeRequest);
    const judgeText = judgeResponse.text || '';

    // Parse Judge output
    let winningCandidateId = 'A';
    const winMatch = judgeText.match(/WINNING_CANDIDATE:\s*([A-Z])/i);
    if (winMatch) {
      winningCandidateId = winMatch[1].toUpperCase();
    }

    let evaluationRationale = '';
    const ratMatch = judgeText.match(/RATIONALE:\s*([\s\S]*?)(?=FINAL_PLAN:|$)/i);
    if (ratMatch) {
      evaluationRationale = ratMatch[1].trim();
    } else {
      evaluationRationale = 'Selected by judge model evaluation.';
    }

    let selectedPlan = '';
    const planMatch = judgeText.match(/FINAL_PLAN:\s*([\s\S]*)/i);
    if (planMatch && planMatch[1].trim()) {
      selectedPlan = planMatch[1].trim();
    } else {
      // Fallback to the winning candidate's own proposal
      const winningCand = candidates.find((c) => c.id === winningCandidateId) || candidates[0];
      selectedPlan = winningCand.proposal;
    }

    return {
      winningCandidateId,
      selectedPlan,
      evaluationRationale,
      candidates,
      durationMs: Date.now() - startTime,
    };
  }
}
