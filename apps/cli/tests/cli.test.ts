import { describe, it, expect } from 'bun:test';
import { execSync } from 'child_process';
import * as path from 'path';

describe('AgentOS CLI End-to-End Invocations', () => {
  const cliPath = path.resolve(__dirname, '../src/index.ts');

  it('prints full help with top-level arguments, options, and subcommands', () => {
    const stdout = execSync(`bun run "${cliPath}" --help`, {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });

    expect(stdout).toContain('Usage: agentos [options] [command] [prompt...]');
    expect(stdout).toContain('AgentOS Power CLI');
    expect(stdout).toContain('-m, --model <model>');
    expect(stdout).toContain('--plan');
    expect(stdout).toContain('--auto');
    expect(stdout).toContain('-c, --continue [sessionId]');
    expect(stdout).toContain('init [options]');
    expect(stdout).toContain('models|model');
    expect(stdout).toContain('auth|login');
    expect(stdout).toContain('sessions|session');
    expect(stdout).toContain('service');
    expect(stdout).toContain('research <query...>');
  });

  it('prints version number with --version and -V', () => {
    const stdout = execSync(`bun run "${cliPath}" -V`, {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });

    expect(stdout.trim()).toBe('1.0.0');
  });

  it('runs models providers command', () => {
    const stdout = execSync(`bun run "${cliPath}" models providers`, {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });

    expect(stdout).toContain('Supported Providers');
    expect(stdout).toContain('Anthropic Claude');
    expect(stdout).toContain('ANTHROPIC_API_KEY');
    expect(stdout).toContain('Ollama (Local)');
  });

  it('runs auth status command', () => {
    const stdout = execSync(`bun run "${cliPath}" auth status`, {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });

    expect(stdout).toContain('Provider Authentication Status:');
    expect(stdout).toContain('Anthropic Claude');
    expect(stdout).toContain('OpenAI GPT');
  });

  it('runs service status command', () => {
    const stdout = execSync(`bun run "${cliPath}" service status`, {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });

    expect(stdout).toContain('AgentOS Service Status');
    expect(stdout).toContain('http://127.0.0.1:7070');
  });
});
