import { describe, it, expect } from 'bun:test';
import { AgentError, ProviderError, ToolError, SessionError, ConfigError, RuntimeError } from '../src/errors';

describe('Errors', () => {
  it('should create an AgentError', () => {
    const error = new AgentError('test error');
    expect(error.message).toBe('test error');
    expect(error.name).toBe('AgentError');
    expect(error instanceof Error).toBe(true);
  });

  it('should create specific errors inheriting from AgentError', () => {
    const providerErr = new ProviderError('provider error');
    expect(providerErr.name).toBe('ProviderError');
    expect(providerErr instanceof AgentError).toBe(true);

    const toolErr = new ToolError('tool error');
    expect(toolErr.name).toBe('ToolError');
    expect(toolErr instanceof AgentError).toBe(true);

    const sessionErr = new SessionError('session error');
    expect(sessionErr.name).toBe('SessionError');
    expect(sessionErr instanceof AgentError).toBe(true);

    const configErr = new ConfigError('config error');
    expect(configErr.name).toBe('ConfigError');
    expect(configErr instanceof AgentError).toBe(true);

    const runtimeErr = new RuntimeError('runtime error');
    expect(runtimeErr.name).toBe('RuntimeError');
    expect(runtimeErr instanceof AgentError).toBe(true);
  });
});
