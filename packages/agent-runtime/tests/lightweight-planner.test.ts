import { describe, it, expect } from 'bun:test';
import { LightweightPlanner, classifyGoal } from '../src/planning/LightweightPlanner';
import type { Model } from '@agent-os/providers';

describe('LightweightPlanner Pipeline and Classification', () => {
  it('1. classifyGoal("add a sum function") returns true', () => {
    expect(classifyGoal('add a sum function')).toBe(true);
  });

  it('2. classifyGoal("explain the approval flow") returns false', () => {
    expect(classifyGoal('explain the approval flow')).toBe(false);
  });

  it('3. generatePlan for "fix bug in sandbox" produces pipeline: [explore, edit, verify, patch, approve]', async () => {
    const fakeModel: Model = {
      id: 'mock-model',
      generate: async () => ({
        text: JSON.stringify({
          objective: 'Fix bug in sandbox',
          filesLikelyTouched: ['src/sandbox.ts'],
          steps: ['Read file', 'Edit file', 'Run verification'],
          verificationCommands: ['bun test'],
          risks: [],
        }),
      }),
    };

    const plan = await LightweightPlanner.generatePlan(fakeModel, {
      userInput: 'fix bug in sandbox',
    });

    expect(plan.isEditTask).toBe(true);
    expect(plan.pipeline).toEqual(['explore', 'edit', 'verify', 'patch', 'approve']);
  });

  it('4. generatePlan for "analyze authentication" produces pipeline: [explore]', async () => {
    const fakeModel: Model = {
      id: 'mock-model',
      generate: async () => ({
        text: JSON.stringify({
          objective: 'Analyze authentication architecture',
          filesLikelyTouched: ['src/auth.ts'],
          steps: ['Read auth module'],
          verificationCommands: [],
          risks: [],
        }),
      }),
    };

    const plan = await LightweightPlanner.generatePlan(fakeModel, {
      userInput: 'analyze authentication',
    });

    expect(plan.isEditTask).toBe(false);
    expect(plan.pipeline).toEqual(['explore']);
  });

  it('5. parsePlan with no pipeline field in JSON defaults to the full edit pipeline', () => {
    const jsonWithoutPipeline = JSON.stringify({
      objective: 'Do task',
      filesLikelyTouched: ['a.ts'],
      steps: ['step 1'],
      verificationCommands: ['bun test'],
      risks: [],
    });

    const plan = LightweightPlanner.parsePlan(jsonWithoutPipeline);
    expect(plan.isEditTask).toBe(true);
    expect(plan.pipeline).toEqual(['explore', 'edit', 'verify', 'patch', 'approve']);
  });
});
