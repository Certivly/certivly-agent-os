import { test, expect, mock } from 'bun:test';
import { CommandRouter, CliCommand } from '../src/cli/CommandRouter';

test('CommandRouter routes to registered command', async () => {
  const router = new CommandRouter();
  let executed = false;
  
  const mockCommand: CliCommand = {
    name: 'testcmd',
    description: 'Test command',
    execute: async () => {
      executed = true;
    }
  };

  router.register(mockCommand);

  const mockContext: any = {
    runtime: { stateManager: { setLastCommand: () => {} } },
    renderStream: () => {},
    renderError: () => {}
  };

  await router.route({
    isCommand: true,
    raw: '/testcmd',
    command: 'testcmd'
  }, mockContext);

  expect(executed).toBe(true);
});

test('CommandRouter handles unknown command', async () => {
  const router = new CommandRouter();
  let errorRendered = false;

  const mockContext: any = {
    runtime: { stateManager: { setLastCommand: () => {} } },
    renderStream: () => {},
    renderError: () => {
      errorRendered = true;
    }
  };

  expect(router.route({
    isCommand: true,
    raw: '/unknown',
    command: 'unknown'
  }, mockContext)).rejects.toThrow('Unknown command: /unknown');
});
