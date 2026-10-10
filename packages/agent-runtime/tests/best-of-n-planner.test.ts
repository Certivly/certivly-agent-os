import { describe, it, expect } from 'bun:test';
import { BestOfNPlanner } from '../src/planning/BestOfNPlanner';
import type { Model, GenerationRequest, GenerationResponse } from '@agent-os/providers';

describe('BestOfNPlanner (Freebuff Trajectory Reasoning & Judge Pattern)', () => {
  let callCount = 0;

  const mockModel: Model = {
    id: 'mock-model',
    generate: async (req: GenerationRequest): Promise<GenerationResponse> => {
      callCount++;
      const systemPrompt = req.systemPrompt || '';

      // Check if this is the Judge model prompt
      if (systemPrompt.includes('Principal Software Architect judge')) {
        return {
          text: `WINNING_CANDIDATE: B\nRATIONALE: Candidate B correctly addresses race conditions using atomic mutex locks.\nFINAL_PLAN:\n1. Add mutex lock in SessionStore.\n2. Verify with concurrent integration test.`,
        };
      }

      // Candidate generator
      const match = systemPrompt.match(/Candidate ID: \[([A-Z])\]/);
      const letter = match ? match[1] : 'X';

      return {
        text: `<think>Internal thoughts for candidate ${letter}</think>\nProposal ${letter}: Implement solution using strategy ${letter}.`,
      };
    },
    stream: async function* () {
      yield { type: 'text_delta', text: '' };
    },
  };

  it('1. generates N parallel candidate trajectories and selects the winning proposal via Judge', async () => {
    callCount = 0;
    const planner = new BestOfNPlanner(mockModel);

    const result = await planner.evaluate(
      'Fix concurrency race condition in auth cache',
      'Auth cache uses unsynchronized map writes',
      { n: 3 }
    );

    // 3 candidate calls + 1 judge call = 4 total model calls
    expect(callCount).toBe(4);
    expect(result.candidates.length).toBe(3);
    expect(result.candidates[0].id).toBe('A');
    expect(result.candidates[1].id).toBe('B');
    expect(result.candidates[2].id).toBe('C');

    // Reasoning was extracted from <think> tag
    expect(result.candidates[0].reasoning).toBe('Internal thoughts for candidate A');
    expect(result.candidates[0].proposal).toBe('Proposal A: Implement solution using strategy A.');

    // Judge selected candidate B
    expect(result.winningCandidateId).toBe('B');
    expect(result.evaluationRationale).toContain('atomic mutex locks');
    expect(result.selectedPlan).toContain('Add mutex lock in SessionStore');
  });

  it('2. clamps N between bounds 2 and 6', async () => {
    callCount = 0;
    const planner = new BestOfNPlanner(mockModel);

    const resultLow = await planner.evaluate('Task', 'Context', { n: 1 });
    expect(resultLow.candidates.length).toBe(2);

    const resultHigh = await planner.evaluate('Task', 'Context', { n: 10 });
    expect(resultHigh.candidates.length).toBe(6);
  });
});
