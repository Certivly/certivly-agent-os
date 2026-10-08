import type { Model } from '@agent-os/providers';
import type { LoopTool } from '../loop/LoopTool';

export const READ_ONLY_TOOL_NAMES = new Set([
  'read_file',
  'grep',
  'list_dir',
  'repo_map',
  'find_symbol',
  'find_references',
]);

export interface ExplorationJob {
  topic: 'likely_files' | 'test_commands' | 'risk_areas';
  prompt: string;
}

export interface ParallelExplorerOptions {
  model: Model;
  tools?: LoopTool[];
  workspaceRoot?: string;
  timeoutMs?: number;
}

export class ParallelExplorer {
  private model: Model;
  private readOnlyTools: LoopTool[];
  private timeoutMs: number;

  constructor(options: ParallelExplorerOptions) {
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? 5000;

    // Filter tools and guard against write tools
    const originalTools = options.tools || [];
    this.readOnlyTools = originalTools.map((tool) => {
      const isReadOnly =
        tool.spec.readOnly || READ_ONLY_TOOL_NAMES.has(tool.spec.name);

      return {
        spec: tool.spec,
        requiresApproval: async () => false,
        execute: async (args: any) => {
          if (!isReadOnly) {
            throw new Error(
              `Tool ${tool.spec.name} is not permitted during read-only exploration`
            );
          }
          return tool.execute(args);
        },
      };
    });
  }

  public async runJob(
    job: ExplorationJob,
    userTask: string,
    abortSignal?: AbortSignal
  ): Promise<{ topic: string; summary: string }> {
    if (abortSignal?.aborted) {
      throw new Error('Exploration cancelled');
    }

    const systemPrompt =
      `You are an exploration sub-agent focused only on ${job.topic}.\n` +
      `Answer the user's inquiry concisely in 1-2 bullet points.`;

    const toolSpecs = this.readOnlyTools
      .filter((t) => t.spec.readOnly || READ_ONLY_TOOL_NAMES.has(t.spec.name))
      .map((t) => ({
        name: t.spec.name,
        description: t.spec.description,
        parameters: t.spec.parameters as any,
      }));

    const generatePromise = this.model.generate({
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Task: ${userTask}\nFocus: ${job.prompt}`,
        },
      ],
      ...(toolSpecs.length > 0 ? { tools: toolSpecs } : {}),
    });

    const response = await Promise.race([
      generatePromise,
      new Promise<never>((_, reject) => {
        if (abortSignal?.aborted) {
          reject(new Error('Exploration cancelled'));
        } else {
          abortSignal?.addEventListener(
            'abort',
            () => reject(new Error('Exploration cancelled')),
            { once: true }
          );
        }
      }),
    ]);

    // If the model called tools, execute them if they are read-only
    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const tc of response.toolCalls) {
        if (!READ_ONLY_TOOL_NAMES.has(tc.name)) {
          throw new Error(
            `Tool ${tc.name} is not permitted during read-only exploration`
          );
        }
        const tool = this.readOnlyTools.find((t) => t.spec.name === tc.name);
        if (tool) {
          const args =
            typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
          await tool.execute(args);
        }
      }
    }

    return {
      topic: job.topic,
      summary: response.text?.trim() || 'No specific findings.',
    };
  }

  public async explore(
    userTask: string,
    parentAbortSignal?: AbortSignal
  ): Promise<string> {
    const jobs: ExplorationJob[] = [
      {
        topic: 'likely_files',
        prompt: 'Identify the likely files that need inspection or editing.',
      },
      {
        topic: 'test_commands',
        prompt: 'Identify the relevant test commands or verifications to run.',
      },
      {
        topic: 'risk_areas',
        prompt: 'Identify potential risks, edge cases, or breaking changes.',
      },
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    if (parentAbortSignal) {
      parentAbortSignal.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
    }

    try {
      const promises = jobs.map((job) =>
        this.runJob(job, userTask, controller.signal)
      );

      const results = await Promise.allSettled(promises);
      clearTimeout(timeoutId);

      // Deterministically sort and merge results by topic name
      const succeeded: Array<{ topic: string; summary: string }> = [];
      for (const res of results) {
        if (res.status === 'fulfilled') {
          succeeded.push(res.value);
        }
      }

      if (succeeded.length === 0) {
        return '';
      }

      succeeded.sort((a, b) => a.topic.localeCompare(b.topic));

      const lines = ['Exploration Summary:'];
      for (const s of succeeded) {
        const label =
          s.topic === 'likely_files'
            ? 'Likely Files'
            : s.topic === 'test_commands'
            ? 'Test Commands'
            : 'Risk Areas';
        lines.push(`- ${label}: ${s.summary}`);
      }

      return lines.join('\n');
    } catch {
      clearTimeout(timeoutId);
      return '';
    }
  }

  public static mergeSummaries(
    findings: Array<{ topic: string; summary: string }>
  ): string {
    const sorted = [...findings].sort((a, b) => a.topic.localeCompare(b.topic));
    const lines = ['Exploration Summary:'];
    for (const s of sorted) {
      const label =
        s.topic === 'likely_files'
          ? 'Likely Files'
          : s.topic === 'test_commands'
          ? 'Test Commands'
          : 'Risk Areas';
      lines.push(`- ${label}: ${s.summary}`);
    }
    return lines.join('\n');
  }
}
