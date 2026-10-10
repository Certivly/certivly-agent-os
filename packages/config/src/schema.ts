import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  type: z.enum(['openai', 'anthropic', 'gemini', 'deepseek', 'lmstudio', 'ollama', 'openrouter', 'custom']).or(z.string()).optional(),
  headers: z.record(z.string()).optional(),
  models: z.array(z.string()).optional(),
  contextWindow: z.number().optional(),
  maxOutputTokens: z.number().optional(),
});

export const EvalModelConfigSchema = z.object({
  name: z.string(),
  enabled: z.boolean().default(true),
});

export const ModelRolesSchema = z.object({
  primary: z.string().optional(),
  fast: z.string().optional(),
  planning: z.string().optional(),
  review: z.string().optional(),
}).optional();

export const McpServerConfigSchema = z.object({
  type: z.enum(['stdio', 'sse']).default('stdio').optional(),
  command: z.string().optional(),
  args: z.array(z.string()).default([]).optional(),
  env: z.record(z.string()).default({}).optional(),
  cwd: z.string().optional(),
  url: z.string().optional(),
  headers: z.record(z.string()).default({}).optional(),
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
    maxTurns: z.number().default(40),
    maxWallTimeMs: z.number().default(300_000),
    maxApproxTokens: z.number().default(100_000),
    maxVerificationFixAttempts: z.number().default(3),
    selfReview: z.boolean().default(false),
    parallelExploration: z.boolean().default(false),
    planningMode: z.enum(['off', 'auto', 'always']).default('auto'),
    antiLoopMonitoring: z.boolean().default(true).optional(),
    modelRoles: ModelRolesSchema,
  }).default({}),
  repository: z.object({
    rootPath: z.string().optional(),
    ignorePatterns: z.array(z.string()).default([]),
  }).optional(),
  providers: z.record(z.string(), ProviderConfigSchema).default({}),
  mcpServers: z.record(z.string(), McpServerConfigSchema).default({}).optional(),
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
export type ModelRolesConfig = z.infer<typeof ModelRolesSchema>;
