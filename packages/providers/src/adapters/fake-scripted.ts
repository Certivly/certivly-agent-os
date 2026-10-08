import * as fs from 'fs';
import * as path from 'path';
import type { Model, Provider, GenerationRequest, GenerationResponse } from '../interface';

export interface ScriptedTurn {
  text?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown> | string;
  }>;
}

export interface TaskScript {
  taskId: string;
  turns: ScriptedTurn[];
}

export interface FakeScriptedModelOptions {
  taskId?: string;
  scriptsDir?: string;
}

export class FakeScriptedModel implements Model {
  public id: string = 'fake:scripted';
  private explicitTaskId?: string;
  private scriptsDir: string;
  private currentTurnIndex: number = 0;
  private loadedScript?: TaskScript;

  constructor(options: FakeScriptedModelOptions = {}) {
    this.explicitTaskId = options.taskId;
    if (options.scriptsDir) {
      this.scriptsDir = options.scriptsDir;
    } else {
      let curr = process.cwd();
      let foundDir = path.resolve(curr, 'evals', 'scripts');
      while (true) {
        const candidate = path.join(curr, 'evals', 'scripts');
        if (fs.existsSync(candidate)) {
          foundDir = candidate;
          break;
        }
        const parent = path.dirname(curr);
        if (parent === curr) break;
        curr = parent;
      }
      this.scriptsDir = foundDir;
    }
  }

  private resolveTaskId(request: GenerationRequest): string {
    if (this.explicitTaskId) {
      return this.explicitTaskId;
    }

    const allContent = [
      request.systemPrompt || '',
      ...request.messages.map((m) => m.content),
    ].join('\n');

    // Check for explicit mention in prompt or session ID
    if (allContent.includes('array-slice.ts') || allContent.includes('ts-off-by-one')) {
      return 'ts-off-by-one';
    }
    if (allContent.includes('user.ts') || allContent.includes('ts-null-handling')) {
      return 'ts-null-handling';
    }
    if (allContent.includes('compare.ts') || allContent.includes('ts-wrong-comparison')) {
      return 'ts-wrong-comparison';
    }
    if (allContent.includes('string-utils.ts') || allContent.includes('ts-add-function')) {
      return 'ts-add-function';
    }
    if (allContent.includes('validator.py') || allContent.includes('py-wrong-regex')) {
      return 'py-wrong-regex';
    }
    if (allContent.includes('math.ts') || allContent.includes('vertical-slice-add-function')) {
      return 'vertical-slice-add-function';
    }
    if (allContent.includes('reverse.ts') || allContent.includes('ts-string-reverse')) {
      return 'ts-string-reverse';
    }
    if (allContent.includes('dedupe.ts') || allContent.includes('ts-array-dedupe')) {
      return 'ts-array-dedupe';
    }
    if (allContent.includes('tree.ts') || allContent.includes('ts-flatten-tree')) {
      return 'ts-flatten-tree';
    }
    if (allContent.includes('retry.ts') || allContent.includes('ts-retry-wrapper')) {
      return 'ts-retry-wrapper';
    }
    if (allContent.includes('lru.ts') || allContent.includes('ts-lru-cache')) {
      return 'ts-lru-cache';
    }
    if (allContent.includes('csv.ts') || allContent.includes('ts-csv-parser')) {
      return 'ts-csv-parser';
    }
    if (allContent.includes('repo-map-query-rank')) {
      return 'repo-map-query-rank';
    }
    if (allContent.includes('repo-map-stack-trace')) {
      return 'repo-map-stack-trace';
    }
    if (allContent.includes('repo-map-symbol-lookup')) {
      return 'repo-map-symbol-lookup';
    }

    const match = allContent.match(/task[:\s]+([a-z0-9-]+)/i);
    if (match) {
      return match[1];
    }

    throw new Error('Unable to infer taskId for fake:scripted model from request context. Specify options.taskId.');
  }

  private loadScript(taskId: string): TaskScript {
    if (this.loadedScript) {
      return this.loadedScript;
    }

    const scriptPath = path.join(this.scriptsDir, `${taskId}.json`);
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Missing evaluation script for task "${taskId}". Expected at ${scriptPath}`);
    }

    const content = fs.readFileSync(scriptPath, 'utf8');
    this.loadedScript = JSON.parse(content) as TaskScript;
    return this.loadedScript;
  }

  public async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const taskId = this.resolveTaskId(request);
    const script = this.loadScript(taskId);

    if (this.currentTurnIndex >= script.turns.length) {
      return {
        text: 'The required task has been successfully solved and verified.',
      };
    }

    const turn = script.turns[this.currentTurnIndex++];
    const toolCalls = turn.toolCalls?.map((tc) => ({
      id: tc.id,
      name: tc.name,
      args: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args),
    }));

    return {
      text: turn.text || '',
      ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
    };
  }

  public async *generateStream(request: GenerationRequest): AsyncIterableIterator<any> {
    const response = await this.generate(request);
    const words = (response.text || '').split(' ');
    for (let i = 0; i < words.length; i++) {
      yield {
        delta: (i === 0 ? '' : ' ') + words[i],
        ...(i === words.length - 1 && response.toolCalls ? { toolCalls: response.toolCalls } : {}),
      };
    }
  }
}

export class FakeScriptedProvider implements Provider {
  public name = 'fake';
  public models: Model[] = [];

  constructor(private scriptsDir?: string) {}

  public getModel(id: string): Model {
    const taskId = id.startsWith('fake:scripted:') ? id.replace('fake:scripted:', '') : undefined;
    return new FakeScriptedModel({ taskId, scriptsDir: this.scriptsDir });
  }

  public async checkHealth(): Promise<{ ok: boolean; error?: string }> {
    return { ok: true };
  }
}
