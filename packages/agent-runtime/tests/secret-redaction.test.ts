import { describe, it, expect } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { SessionManager } from '@agent-os/sessions';
import { SessionHistory } from '../src/loop/SessionHistory';
import { redactSecrets } from '../src/trace/RunTracer';

describe('Action 3.14: Secret Redaction Matrix', () => {
  it('1. redacts API keys in environment variable strings', () => {
    const envString = 'OPENAI_API_KEY=sk-proj-abc12345678901234567890_xyz; ANTHROPIC_API_KEY=sk-ant-api03-abcdef123456789012345678';
    const redacted = redactSecrets(envString);
    expect(redacted).not.toContain('sk-proj-');
    expect(redacted).not.toContain('sk-ant-');
    expect(redacted).toContain('[REDACTED_SECRET]');
  });

  it('2. redacts tokens in command output', () => {
    const commandOutput = `
      Authenticated as octocat.
      Active token: ghp_1234567890abcdefghijklmnopqrstuvwxyz
      Session token: access_token="mysecretaccesstoken123456"
    `;
    const redacted = redactSecrets(commandOutput);
    expect(redacted).not.toContain('ghp_1234567890');
    expect(redacted).not.toContain('mysecretaccesstoken123456');
    expect(redacted).toContain('[REDACTED_SECRET]');
  });

  it('3. redacts Authorization headers in strings and objects', () => {
    const rawHeader = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token12345';
    const redactedHeader = redactSecrets(rawHeader);
    expect(redactedHeader).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(redactedHeader).toContain('[REDACTED_SECRET]');

    const requestObj = {
      headers: {
        authorization: 'Bearer secret_token_value_here',
        'User-Agent': 'agent-os/1.0',
      },
    };
    const redactedObj = redactSecrets(requestObj);
    expect(redactedObj.headers.authorization).toBe('[REDACTED]');
    expect(redactedObj.headers['User-Agent']).toBe('agent-os/1.0');
  });

  it('4. redacts provider error messages containing leaked secrets', () => {
    const providerError = {
      name: 'ProviderError',
      message: 'Failed to authenticate request with key sk-ant-api03-secretkey12345678901234: 401 Unauthorized',
      details: {
        attemptedKey: 'sk-proj-98765432109876543210',
        url: 'https://api.openai.com/v1/chat/completions',
      },
    };
    const redacted = redactSecrets(providerError);
    expect(redacted.message).not.toContain('sk-ant-');
    expect(redacted.message).toContain('[REDACTED_SECRET]');
    expect(redacted.details.attemptedKey).not.toContain('sk-proj-');
    expect(redacted.details.attemptedKey).toContain('[REDACTED_SECRET]');
    expect(redacted.details.url).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('5. redacts nested trace payloads containing sensitive keys and values', () => {
    const tracePayload = {
      eventType: 'model.request',
      provider: 'openai',
      credentials: {
        apiKey: 'sk-123456789012345678901234',
        password: 'SuperSecretPassword123!',
      },
      env: [
        'PATH=/usr/bin',
        'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz12',
      ],
      meta: {
        nestedAuth: {
          token: 'sensitive-token-string',
        },
      },
    };

    const redacted = redactSecrets(tracePayload);
    expect(redacted.credentials).toBe('[REDACTED]');
    expect(redacted.meta.nestedAuth.token).toBe('[REDACTED]');
    expect(redacted.env[1]).toContain('[REDACTED_SECRET]');
    expect(redacted.env[1]).not.toContain('ghp_');
  });

  it('6. redacts OPENAI_API_KEY=sk-abc123 in tool results before adding to history', async () => {
    const testDir = path.join(__dirname, '.tmp-secret-test');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    const dbPath = path.join(testDir, `test-${crypto.randomUUID()}.db`);
    try {
      const sm = new SessionManager(dbPath);
      const history = new SessionHistory(sm);
      const sessionId = 'test-secret-session';

      await history.appendTool(sessionId, 'call_secret', 'read_file', 'export OPENAI_API_KEY=sk-abc123\nconst a = 1;');
      const messages = await history.load(sessionId);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).not.toContain('sk-abc123');
      expect(messages[0].content).toContain('[REDACTED_SECRET]');
    } finally {
      try {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      } catch {}
    }
  });
});
