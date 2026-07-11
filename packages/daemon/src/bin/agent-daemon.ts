#!/usr/bin/env node
import * as os from 'os';
import * as path from 'path';
import { DaemonBootstrap } from '../DaemonBootstrap';
import type { DaemonConfig } from '../DaemonConfig';

/**
 * AgentOS Daemon process entry point.
 *
 * Usage:
 *   bun packages/daemon/src/bin/agent-daemon.ts [--tcp-port 7878] [--data-dir ~/.agentos]
 *   node dist/bin/agent-daemon.js
 *
 * Environment:
 *   AGENTOS_SOCKET   Override socket path
 *   AGENTOS_PORT     Use TCP instead of Unix socket
 *   AGENTOS_DATA_DIR Data directory for state persistence
 */

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const isWindows = process.platform === 'win32';
const defaultSocketPath = isWindows
  ? '\\\\.\\pipe\\agentos'
  : path.join(os.tmpdir(), 'agentos.sock');

const config: DaemonConfig = {
  socketPath: process.env.AGENTOS_SOCKET
    ?? (process.env.AGENTOS_PORT ? '' : (getArg('--socket') ?? defaultSocketPath)),
  tcpPort: process.env.AGENTOS_PORT
    ? Number(process.env.AGENTOS_PORT)
    : getArg('--tcp-port') ? Number(getArg('--tcp-port')) : undefined,
  dataDir: process.env.AGENTOS_DATA_DIR
    ?? getArg('--data-dir')
    ?? path.join(os.homedir(), '.agentos'),
  maxConcurrentRuntimes: Number(getArg('--max-sessions') ?? process.env.AGENTOS_MAX_SESSIONS ?? '8')
};

const { daemon, lifecycle } = DaemonBootstrap.create(config);

async function main() {
  await lifecycle.startup();

  const addr = config.socketPath || `tcp:${config.tcpPort}`;
  console.log(`[AgentOS Daemon] Listening on ${addr} (pid ${process.pid})`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[AgentOS Daemon] Received ${signal}. Shutting down…`);
    await lifecycle.shutdown();
    process.exit(0);
  };

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', async (err) => {
    console.error('[AgentOS Daemon] Uncaught exception:', err);
    await lifecycle.shutdown();
    process.exit(1);
  });
}

main().catch(err => {
  console.error('[AgentOS Daemon] Fatal startup error:', err);
  process.exit(1);
});
