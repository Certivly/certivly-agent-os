import { describe, it, expect, mock, spyOn } from 'bun:test';
import { AgentRuntime } from '../src/runtime';
import * as path from 'path';

// Note: To truly unit test this without hitting OpenAI, we would mock the provider.
// Given time constraints for Phase 1, we will verify initialization logic works.

describe('AgentRuntime', () => {
  it('should initialize successfully', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const configPath = path.join(__dirname, 'test-config.json');
    const runtime = new AgentRuntime({ configPath });
    
    expect(runtime.getConfigManager()).toBeDefined();
    expect(runtime.getSessionManager()).toBeDefined();
  });
});
