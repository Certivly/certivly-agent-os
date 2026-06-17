import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

export const ConfigSchema = z.object({
  activeProvider: z.string().default('lmstudio'),
  activeModel: z.string().default('local-model'),
  runtime: z.object({
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    sessionDir: z.string().default('.agentos/sessions'),
  }).default({}),
  providers: z.record(z.string(), ProviderConfigSchema).default({}),
});

export type AgentConfig = z.infer<typeof ConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
