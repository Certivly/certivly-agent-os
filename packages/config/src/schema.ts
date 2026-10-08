import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
});

export const EvalModelConfigSchema = z.object({
  name: z.string(),
  enabled: z.boolean().default(true),
});

export const ConfigSchema = z.object({
  activeProvider: z.string().default('lmstudio'),
  activeModel: z.string().default('local-model'),
  evalModels: z.array(EvalModelConfigSchema).default([
    { name: 'fake:scripted', enabled: true },
    { name: 'openai:gpt-4.1', enabled: false },
    { name: 'anthropic:claude-sonnet', enabled: false },
    { name: 'lmstudio:local', enabled: false },
  ]),
  runtime: z.object({
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    sessionDir: z.string().default('.agentos/sessions'),
  }).default({}),
  permissionMode: z.enum(['plan', 'manual', 'acceptEdits', 'auto']).default('manual').optional(),
  agent: z.object({
    selfReview: z.boolean().default(false),
    parallelExploration: z.boolean().default(false),
    planningMode: z.enum(['off', 'auto', 'always']).default('auto'),
  }).default({}),
  repository: z.object({
    rootPath: z.string().optional(),
    ignorePatterns: z.array(z.string()).default([]),
  }).optional(),
  providers: z.record(z.string(), ProviderConfigSchema).default({}),
  hooks: z.object({
    before_tool: z.object({
      command: z.string(),
      timeoutMs: z.number().default(5000).optional(),
      blocking: z.boolean().default(true).optional(),
    }).optional(),
    after_edit: z.object({
      command: z.string(),
      timeoutMs: z.number().default(5000).optional(),
      blocking: z.boolean().default(true).optional(),
    }).optional(),
    before_verify: z.object({
      command: z.string(),
      timeoutMs: z.number().default(5000).optional(),
      blocking: z.boolean().default(true).optional(),
    }).optional(),
    after_verify: z.object({
      command: z.string(),
      timeoutMs: z.number().default(5000).optional(),
      blocking: z.boolean().default(true).optional(),
    }).optional(),
  }).optional(),
});

export interface HookDefinition {
  command: string;
  timeoutMs?: number;
  blocking?: boolean;
}

export interface HooksConfig {
  before_tool?: HookDefinition;
  after_edit?: HookDefinition;
  before_verify?: HookDefinition;
  after_verify?: HookDefinition;
}

export type PermissionMode = 'plan' | 'manual' | 'acceptEdits' | 'auto';

export type AgentConfig = z.infer<typeof ConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
