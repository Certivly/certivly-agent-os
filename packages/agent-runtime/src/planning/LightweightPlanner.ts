import type { Model } from '@agent-os/providers';
import type { LightweightPlan, PipelineStage } from '../loop/types';

export function classifyGoal(userInput: string): boolean {
  return /\b(add|fix|implement|refactor|create|update|remove|delete|rename|change|migrate|convert|repair|patch|edit)\w*/i.test(userInput);
}

export interface ShouldTriggerPlanOptions {
  planningMode?: 'off' | 'auto' | 'always';
  userInput: string;
  likelyFileCount?: number;
  verificationAttempts?: number;
}

export interface PlanGenerationContext {
  userInput: string;
  workspaceRoot?: string;
  likelyFiles?: string[];
  currentPlan?: LightweightPlan;
  revisionReason?: string;
  verificationFailures?: string[];
}

export class LightweightPlanner {
  public static shouldTriggerPlan(options: ShouldTriggerPlanOptions): boolean {
    const mode = options.planningMode ?? 'auto';
    if (mode === 'off') {
      return false;
    }
    if (mode === 'always') {
      return true;
    }

    // Auto mode triggers:
    // 1. User says refactor / migrate / multi-file
    if (/refactor|migrate|multi-file/i.test(options.userInput)) {
      return true;
    }

    // 2. repo_map returns more than 5 likely files
    if (options.likelyFileCount !== undefined && options.likelyFileCount > 5) {
      return true;
    }

    // 3. verification failed twice (attempts >= 2)
    if (options.verificationAttempts !== undefined && options.verificationAttempts >= 2) {
      return true;
    }

    return false;
  }

  public static async generatePlan(
    model: Model,
    context: PlanGenerationContext
  ): Promise<LightweightPlan> {
    const isRevision = !!context.currentPlan;
    const prompt = isRevision
      ? `You are revising an execution plan for a coding task.
Task: ${context.userInput}
Current Plan:
${JSON.stringify(context.currentPlan, null, 2)}
Revision Reason: ${context.revisionReason || 'New evidence or verification failure.'}
${context.verificationFailures && context.verificationFailures.length > 0 ? `Verification Failures:\n${context.verificationFailures.join('\n')}` : ''}

Respond with a JSON object in this format:
{
  "objective": "...",
  "filesLikelyTouched": ["..."],
  "steps": ["..."],
  "verificationCommands": ["..."],
  "risks": ["..."]
}`
      : `You are creating a lightweight execution plan for a coding task.
Task: ${context.userInput}
${context.likelyFiles && context.likelyFiles.length > 0 ? `Likely Files:\n${context.likelyFiles.map((f) => `- ${f}`).join('\n')}` : ''}

Respond with a JSON object in this format:
{
  "objective": "...",
  "filesLikelyTouched": ["..."],
  "steps": ["..."],
  "verificationCommands": ["..."],
  "risks": ["..."]
}`;

    try {
      const response = await model.generate({
        systemPrompt:
          'You are an expert software architect creating a lightweight execution plan. Output only valid JSON conforming to the requested schema.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const plan = this.parsePlan(response.text, context.userInput);
      return plan;
    } catch (_err: unknown) {
      return this.fallbackPlan(context);
    }
  }

  public static parsePlan(text: string, userInput?: string): LightweightPlan {
    const isEdit = userInput !== undefined ? classifyGoal(userInput) : true;
    try {
      let cleaned = text.trim();
      const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        cleaned = codeBlockMatch[1].trim();
      }
      const parsed = JSON.parse(cleaned);
      const isEditTask = typeof parsed.isEditTask === 'boolean' ? parsed.isEditTask : isEdit;
      const defaultPipeline: PipelineStage[] = isEditTask
        ? ['explore', 'edit', 'verify', 'patch', 'approve']
        : ['explore'];
      const pipeline: PipelineStage[] = Array.isArray(parsed.pipeline) && parsed.pipeline.length > 0
        ? parsed.pipeline
        : defaultPipeline;

      return {
        objective: typeof parsed.objective === 'string' ? parsed.objective : 'Complete requested task',
        filesLikelyTouched: Array.isArray(parsed.filesLikelyTouched) ? parsed.filesLikelyTouched.map(String) : [],
        steps: Array.isArray(parsed.steps) ? parsed.steps.map(String) : [],
        verificationCommands: Array.isArray(parsed.verificationCommands)
          ? parsed.verificationCommands.map(String)
          : ['bun test'],
        risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
        pipeline,
        isEditTask,
      };
    } catch (_err: unknown) {
      const defaultPipeline: PipelineStage[] = isEdit
        ? ['explore', 'edit', 'verify', 'patch', 'approve']
        : ['explore'];
      return {
        objective: 'Execute required task steps',
        filesLikelyTouched: [],
        steps: ['Analyze code', 'Apply necessary modifications', 'Verify changes'],
        verificationCommands: ['bun test'],
        risks: ['Unexpected regressions'],
        pipeline: defaultPipeline,
        isEditTask: isEdit,
      };
    }
  }

  public static formatPlan(plan: LightweightPlan): string {
    const lines: string[] = [];
    lines.push('### Advisory Execution Plan');
    lines.push(`**Objective**: ${plan.objective}`);
    lines.push('');
    lines.push('**Files Likely Touched**:');
    if (plan.filesLikelyTouched.length === 0) {
      lines.push('- None identified yet');
    } else {
      for (const f of plan.filesLikelyTouched) {
        lines.push(`- ${f}`);
      }
    }
    lines.push('');
    lines.push('**Steps**:');
    if (plan.steps.length === 0) {
      lines.push('1. Complete requested edits');
    } else {
      plan.steps.forEach((step, idx) => {
        lines.push(`${idx + 1}. ${step}`);
      });
    }
    lines.push('');
    lines.push('**Verification Commands**:');
    if (plan.verificationCommands.length === 0) {
      lines.push('- Default automated test runner');
    } else {
      for (const cmd of plan.verificationCommands) {
        lines.push(`- \`${cmd}\``);
      }
    }
    lines.push('');
    lines.push('**Risks**:');
    if (plan.risks.length === 0) {
      lines.push('- None noted');
    } else {
      for (const r of plan.risks) {
        lines.push(`- ${r}`);
      }
    }
    return lines.join('\n');
  }

  private static fallbackPlan(context: PlanGenerationContext): LightweightPlan {
    const isEdit = classifyGoal(context.userInput);
    return {
      objective: context.userInput,
      filesLikelyTouched: context.likelyFiles || [],
      steps: ['Investigate repository', 'Implement changes', 'Run tests and verification'],
      verificationCommands: ['bun test'],
      risks: ['Potential edge case breakage'],
      pipeline: isEdit ? ['explore', 'edit', 'verify', 'patch', 'approve'] : ['explore'],
      isEditTask: isEdit,
    };
  }
}
