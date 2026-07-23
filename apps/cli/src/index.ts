import { Command } from 'commander';
import { logger } from '@agent-os/shared';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

import { CliRuntime } from './cli/CliRuntime';
import { CommandRouter } from './cli/CommandRouter';
import { ChatCommand, RunCommand } from './cli/commands';
import { EventStreamAdapter } from './bridge/EventStreamAdapter';
import { mountInkApp } from './ui/render';
import { InputParser } from './cli/InputParser';
import { RuntimeAuditor, PackageUsageReport, RuntimeHealthChecker } from '@agent-os/runtime-audit';

const program = new Command();

program
  .name('agentos')
  .description('AgentOS Power CLI')
  .version('1.0.0')
  .option('-d, --debug', 'Enable debug mode');

const localConfigPath = path.join(process.cwd(), 'agentos.config.json');
const globalConfigPath = path.join(os.homedir(), '.agentos', 'config.json');
const configPath = fs.existsSync(localConfigPath) ? localConfigPath : globalConfigPath;

// Log crashes to disk but DO NOT exit — the UI must stay alive so the user
// sees the error in the chat panel on next interaction.
process.on('uncaughtException', (err) => {
  try { fs.appendFileSync('cli-error.log', `[uncaughtException] ${new Date().toISOString()}\n${err.stack || String(err)}\n\n`); } catch {}
  // Do not exit — surface to user on next message
});
process.on('unhandledRejection', (reason: any) => {
  try { fs.appendFileSync('cli-error.log', `[unhandledRejection] ${new Date().toISOString()}\n${reason?.stack || String(reason)}\n\n`); } catch {}
  // Do not exit — surface to user on next message
});

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

    const adapter = new EventStreamAdapter(runtime.agentRuntime.getEventBus(), sessionId, options.debug);

    const handleInput = async (input: string, mode: string) => {
      try {
        if (mode === 'chat') {
          await runtime.agentRuntime.handleRequest(sessionId, input);
        } else {
          const parsed = InputParser.parse(input);
          if (parsed.isCommand) {
            await router.route(parsed, { runtime });
          }
        }
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        runtime.agentRuntime.getEventBus().publish('message.responded', {
          sessionId,
          response: `[System Error]: ${errorMsg}`
        });
      }
    };

    const handleApprove = async (patchBundle: any) => {
      try {
        const patchEngine: any = runtime.agentRuntime.getBootstrap().getRegistry().resolve("patch-engine");
        if (patchEngine && patchBundle) {
          await patchEngine.apply(patchBundle);
        }
      } catch (err: any) {
        runtime.agentRuntime.getEventBus().publish('message.responded', {
          sessionId,
          response: `[Approval Error]: Failed to apply patch: ${err.message}`
        });
      }
    };

    const { waitUntilExit } = mountInkApp(sessionId, adapter.batcher, handleInput, handleApprove);
    
    await waitUntilExit();
    logger.silent = false;
    adapter.cleanup();
  });

program.command('doctor')
  .description('Diagnose AgentOS system health')
  .option('--runtime', 'Verify production runtime architecture and integration')
  .action(async (options) => {
    if (options.runtime) {
      console.log('Running Runtime Production Audit...\n');
      const auditor = new RuntimeAuditor(new (require('@agent-os/shared').LoggingEventBus)(), path.resolve(process.cwd(), '../..'));
      const snapshot = await auditor.audit();
      const checker = new RuntimeHealthChecker();
      console.log(checker.generateHealthReport(snapshot));
      if (snapshot.disconnectedPackages.length === 0) {
        console.log('\nProduction Path Verified');
      } else {
        console.log('\nProduction Path Incomplete');
        process.exit(1);
      }
    } else {
      console.log('Please specify what to diagnose (e.g. --runtime)');
    }
  });

program.command('runtime-audit')
  .description('Audit the entire runtime architecture')
  .action(async () => {
    const auditor = new RuntimeAuditor(new (require('@agent-os/shared').LoggingEventBus)(), path.resolve(process.cwd(), '../..'));
    const snapshot = await auditor.audit();
    const reporter = new PackageUsageReport();
    console.log(reporter.generateGraph(snapshot));
    console.log(reporter.generateReachability(snapshot));
    console.log(reporter.generateOwnership(snapshot));
    console.log(reporter.generateDead(snapshot));
    console.log(reporter.generateStubbed(snapshot));
  });

program.command('dead-packages')
  .description('Detect dead or disconnected packages')
  .action(async () => {
    const auditor = new RuntimeAuditor(new (require('@agent-os/shared').LoggingEventBus)(), path.resolve(process.cwd(), '../..'));
    const snapshot = await auditor.audit();
    const reporter = new PackageUsageReport();
    console.log(reporter.generateDead(snapshot));
  });

program.command('runtime-graph')
  .description('Generate runtime dependency graph')
  .action(async () => {
    const auditor = new RuntimeAuditor(new (require('@agent-os/shared').LoggingEventBus)(), path.resolve(process.cwd(), '../..'));
    const snapshot = await auditor.audit();
    const reporter = new PackageUsageReport();
    console.log(reporter.generateGraph(snapshot));
  });

program.command('wiring-report')
  .description('Generate wiring recommendations for disconnected packages')
  .action(async () => {
    const auditor = new RuntimeAuditor(new (require('@agent-os/shared').LoggingEventBus)(), path.resolve(process.cwd(), '../..'));
    const snapshot = await auditor.audit();
    const checker = new RuntimeHealthChecker();
    console.log(checker.generateHealthReport(snapshot));
  });

program.command('daemon')
  .description('Start AgentOS as a headless background HTTP daemon (TCP, default port 7070)')
  .option('-p, --port <port>', 'Port to listen on', '7070')
  .option('--host <host>', 'Host to bind to', '127.0.0.1')
  .option('--data-dir <dir>', 'Directory for session persistence', path.join(os.homedir(), '.agentos', 'daemon'))
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);
    const dataDir = opts.dataDir;
    
    console.log(`[daemon] Starting AgentOS daemon on 127.0.0.1:${port}...`);
    
    try {
      const { DaemonBootstrap } = await import('@agent-os/daemon');
      const { daemon, lifecycle } = DaemonBootstrap.create({
        tcpPort: port,
        socketPath: '', // Not used — Windows uses TCP transport
        dataDir,
        maxConcurrentRuntimes: 4
      });
      
      await lifecycle.startup();
      // daemon.start() is called inside lifecycle.startup()
      
      console.log(`[daemon] AgentOS daemon running on port ${port}`);
      console.log('[daemon] Press Ctrl+C to stop');
      
      process.on('SIGINT', async () => {
        console.log('\n[daemon] Shutting down...');
        await lifecycle.shutdown();
        process.exit(0);
      });
      
      // Keep process alive
      await new Promise(() => {});
    } catch (err: any) {
      console.error('[daemon] Failed to start daemon:', err.message);
      process.exit(1);
    }
  });

program.parse();
