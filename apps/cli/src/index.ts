import { Command } from 'commander';
import { AgentRuntime } from '@agent-os/agent-runtime';
import { logger } from '@agent-os/shared';
import * as path from 'path';

// Just basic setup for Phase 1. Ink UI omitted for simplicity in this initial file,
// we will wire a basic REPL using standard input for now.
import * as readline from 'readline';

import { render } from 'ink';
import React from 'react';
import { ChatApp } from './commands/chat';

const program = new Command();

program
  .name('agent')
  .description('AgentOS CLI')
  .version('1.0.0');

const configPath = path.join(process.cwd(), 'agentos.config.json');

program.command('chat')
  .description('Start an interactive chat session')
  .action(() => {
    const runtime = new AgentRuntime({ configPath });
    const sessionId = `session_${Date.now()}`;
    
    const { unmount } = render(
      React.createElement(ChatApp, {
        runtime,
        sessionId,
        onExit: () => {
          unmount();
          process.exit(0);
        }
      })
    );
  });

program.command('run')
  .description('Run a single prompt')
  .argument('<prompt>', 'The prompt to run')
  .action(async (promptText) => {
    const runtime = new AgentRuntime({ configPath });
    const sessionId = `session_${Date.now()}`;
    try {
      const response = await runtime.handleRequest(sessionId, promptText);
      console.log(response);
    } catch (e: any) {
      logger.error(`Error: ${e.message}`);
    }
  });

program.command('sessions')
  .description('Manage sessions (placeholder)')
  .action(() => {
    console.log('Sessions command is a placeholder for future phases.');
  });

program.command('config')
  .description('Manage configuration (placeholder)')
  .action(() => {
    console.log('Config command is a placeholder for future phases.');
  });

program.parse();
