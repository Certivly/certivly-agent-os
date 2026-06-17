import { Command } from 'commander';
import { logger } from '@agent-os/shared';
import * as path from 'path';

import { CliRuntime } from './cli/CliRuntime';
import { CommandRouter } from './cli/CommandRouter';
import { ChatCommand, RunCommand } from './cli/commands';
import { EventStreamAdapter } from './bridge/EventStreamAdapter';
import { mountInkApp } from './ui/render';
import { InputParser } from './cli/InputParser';

const program = new Command();

program
  .name('agentos')
  .description('AgentOS Power CLI')
  .version('1.0.0')
  .option('-d, --debug', 'Enable debug mode');

const configPath = path.join(process.cwd(), 'agentos.config.json');

program.command('chat')
  .description('Start the interactive agent console')
  .action(async () => {
    logger.silent = true;
    const options = program.opts();
    const sessionId = `session_${Date.now()}`;
    const runtime = new CliRuntime({ configPath, debug: options.debug }, sessionId);
    
    const router = new CommandRouter();
    router.register(ChatCommand);
    router.register(RunCommand);

    const adapter = new EventStreamAdapter(runtime.agentRuntime.getEventBus(), sessionId);

    const handleInput = async (input: string, mode: string) => {
      if (mode === 'chat') {
        await runtime.agentRuntime.handleRequest(sessionId, input);
      } else {
        const parsed = InputParser.parse(input);
        if (parsed.isCommand) {
          await router.route(parsed, { runtime });
        }
      }
    };

    const { waitUntilExit } = mountInkApp(sessionId, adapter.batcher, handleInput);
    
    await waitUntilExit();
    logger.silent = false;
    adapter.cleanup();
  });

program.parse();
