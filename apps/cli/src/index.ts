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

process.on('uncaughtException', (err) => {
  fs.writeFileSync('cli-error.log', err.stack || String(err));
  process.exit(1);
});
process.on('unhandledRejection', (reason: any) => {
  fs.writeFileSync('cli-error.log', reason?.stack || String(reason));
  process.exit(1);
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

program.parse();
