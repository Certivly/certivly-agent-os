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
import { handleApprove, handleReject } from './bridge/ApprovalHandler';
import { InteractiveApprovalBridge } from './bridge/InteractiveApprovalBridge';
export { handleApprove, handleReject } from './bridge/ApprovalHandler';
export { InteractiveApprovalBridge } from './bridge/InteractiveApprovalBridge';

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
  try {
    fs.appendFileSync('cli-error.log', `[uncaughtException] ${new Date().toISOString()}\n${err.stack || String(err)}\n\n`);
  } catch (_e) {
    // best-effort: fallback to process stderr if writing to log file fails
    process.stderr.write(`[uncaughtException] Failed to write cli-error.log: ${String(err)}\n`);
  }
  // Do not exit — surface to user on next message
});
process.on('unhandledRejection', (reason: any) => {
  try {
    fs.appendFileSync('cli-error.log', `[unhandledRejection] ${new Date().toISOString()}\n${reason?.stack || String(reason)}\n\n`);
  } catch (_e) {
    // best-effort: fallback to process stderr if writing to log file fails
    process.stderr.write(`[unhandledRejection] Failed to write cli-error.log: ${String(reason)}\n`);
  }
  // Do not exit — surface to user on next message
});

program.command('chat')
  .description('Start the interactive agent console')
  .option('--mode <mode>', 'Permission mode: plan, manual, acceptEdits, auto', 'manual')
  .action(async (cmdOptions) => {
    logger.silent = true;
    const options = program.opts();
    const mode = (cmdOptions?.mode || 'manual');
    const sessionId = `session_${Date.now()}`;
    const approvalBridge = new InteractiveApprovalBridge();
    const runtime = new CliRuntime({
      configPath,
      debug: options.debug,
      permissionMode: mode,
      requestApproval: approvalBridge.requestApproval,
    }, sessionId);
    console.log(`[AgentOS] Permission mode: ${mode} | Type your goal to begin.`);
    
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

    const onApprove = async (id: string) => {
      if (approvalBridge.hasPending()) {
        const decided = approvalBridge.decide(id, true);
        if (decided) return;
      }
      await handleApprove(id, {
        eventBus: runtime.agentRuntime.getEventBus(),
        sessionId,
        workspaceRoot: process.cwd(),
      });
    };

    const onReject = async (id: string) => {
      if (approvalBridge.hasPending()) {
        const decided = approvalBridge.decide(id, false, 'User rejected');
        if (decided) return;
      }
      await handleReject(id, {
        eventBus: runtime.agentRuntime.getEventBus(),
        sessionId,
      });
    };

    const { waitUntilExit } = mountInkApp(sessionId, adapter.batcher, handleInput, onApprove, onReject);
    
    await waitUntilExit();
    logger.silent = false;
    adapter.cleanup();
  });

function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let curr = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(curr, 'packages')) && fs.existsSync(path.join(curr, 'package.json'))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return process.cwd();
}

async function runRuntimeDiagnosis(): Promise<boolean> {
  console.log('Running Runtime Production Audit...\n');
  const wsRoot = findWorkspaceRoot();
  const auditor = new RuntimeAuditor(new (require('@agent-os/shared').LoggingEventBus)(), wsRoot);
  const snapshot = await auditor.audit();

  const { BoundaryImportScanner } = await import('@agent-os/runtime-audit');
  const boundaryScanner = new BoundaryImportScanner(wsRoot);
  const boundaryViolations = await boundaryScanner.scanImports();

  const checker = new RuntimeHealthChecker();
  console.log(checker.generateHealthReport(snapshot, boundaryViolations));

  const isHealthy = snapshot.disconnectedPackages.length === 0 && boundaryViolations.length === 0;
  if (isHealthy) {
    console.log('\nProduction Path Verified');
    return true;
  } else {
    console.log('\nProduction Path Incomplete');
    return false;
  }
}

async function runProvidersDiagnosis(probe?: boolean): Promise<boolean> {
  const { ProviderDoctor } = await import('./doctor/ProviderDoctor');
  const statuses = await ProviderDoctor.diagnose({ probe });
  console.log(ProviderDoctor.formatReport(statuses, probe));
  return true;
}

const doctorCmd = program.command('doctor')
  .description('Diagnose AgentOS system health')
  .option('--runtime', 'Verify production runtime architecture and integration')
  .action(async (options) => {
    if (options.runtime) {
      const ok = await runRuntimeDiagnosis();
      if (!ok) process.exit(1);
    } else {
      console.log('=== AgentOS System Doctor ===\n');
      await runProvidersDiagnosis(false);
      console.log('\n');
      const ok = await runRuntimeDiagnosis();
      if (!ok) process.exit(1);
    }
  });

doctorCmd.command('runtime')
  .description('Verify production runtime architecture and package boundaries')
  .action(async () => {
    const ok = await runRuntimeDiagnosis();
    if (!ok) process.exit(1);
  });

doctorCmd.command('providers')
  .description('Diagnose LLM providers configuration and reachability')
  .option('--probe', 'Perform live probe request to check connectivity')
  .action(async (opts) => {
    await runProvidersDiagnosis(opts.probe);
  });

program.command('runtime-audit')
  .description('Audit the entire runtime architecture')
  .action(async () => {
    const auditor = new RuntimeAuditor(new (require('@agent-os/shared').LoggingEventBus)(), findWorkspaceRoot());
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
    const auditor = new RuntimeAuditor(new (require('@agent-os/shared').LoggingEventBus)(), findWorkspaceRoot());
    const snapshot = await auditor.audit();
    const reporter = new PackageUsageReport();
    console.log(reporter.generateDead(snapshot));
  });

program.command('runtime-graph')
  .description('Generate runtime dependency graph')
  .action(async () => {
    const auditor = new RuntimeAuditor(new (require('@agent-os/shared').LoggingEventBus)(), findWorkspaceRoot());
    const snapshot = await auditor.audit();
    const reporter = new PackageUsageReport();
    console.log(reporter.generateGraph(snapshot));
  });

program.command('wiring-report')
  .description('Generate wiring recommendations for disconnected packages')
  .action(async () => {
    const auditor = new RuntimeAuditor(new (require('@agent-os/shared').LoggingEventBus)(), findWorkspaceRoot());
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

const evalCmd = program.command('eval')
  .description('Run evaluation harness on fixture tasks')
  .option('-t, --task <id>', 'Task ID to run or "all"', 'all')
  .option('-m, --model <model>', 'Model to evaluate (provider:model or fake:scripted)', 'fake:scripted')
  .option('--profile <id>', 'Load provider/model config from evals/profiles/<id>.json')
  .option('--output <path>', 'JSONL output path')
  .option('--compare <path>', 'Path to previous JSONL results for comparison')
  .action(async (opts) => {
    const { EvalLoader } = await import('./eval/EvalLoader');
    const { EvalRunner } = await import('./eval/EvalRunner');
    const { EvalReporter } = await import('./eval/EvalReporter');

    let modelName = opts.model;
    if (opts.profile) {
      const profilePath = path.resolve(process.cwd(), `evals/profiles/${opts.profile}.json`);
      if (fs.existsSync(profilePath)) {
        try {
          const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
          modelName = `${profile.provider}:${profile.model}`;
        } catch (e: any) {
          console.warn(`Failed to parse profile ${profilePath}: ${e.message}`);
        }
      } else {
        console.warn(`Profile ${opts.profile} not found at ${profilePath}`);
      }
    }

    const tasksRoot = EvalLoader.getDefaultTasksRoot();
    let tasks: import('./eval/EvalTypes').EvalTask[] = [];

    const all = await EvalLoader.loadAllTasks(tasksRoot);
    if (opts.task === 'all') {
      tasks = all;
    } else {
      const tagged = all.filter((t) => t.meta.tags?.includes(opts.task) || t.meta.id === opts.task);
      if (tagged.length > 0) {
        tasks = tagged;
      } else {
        tasks = [await EvalLoader.loadTask(opts.task, tasksRoot)];
      }
    }

    if (tasks.length === 0) {
      console.log('No evaluation tasks found.');
      return;
    }

    console.log(`Running evaluation on ${tasks.length} task(s) using model: ${modelName}...\n`);

    const results = await EvalRunner.runAll(tasks, {
      modelName,
      outputJsonl: opts.output,
      comparePath: opts.compare,
      onProgress: (task, res) => {
        const symbol = res.skipped ? 'SKIP' : (res.passed ? '✓ PASS' : '✗ FAIL');
        const reason = res.skipped && res.skipReason ? ` - ${res.skipReason}` : '';
        console.log(`[${symbol}] ${task.id} (${(res.wallTimeMs / 1000).toFixed(2)}s, ${res.turns} turns)${reason}`);
      },
    });

    let baseline: import('./eval/EvalTypes').EvalResult[] | undefined;
    if (opts.compare && fs.existsSync(opts.compare)) {
      baseline = EvalReporter.readJsonl(opts.compare);
    }

    console.log('\n' + EvalReporter.toMarkdownTable(results, baseline));

    const allPassed = results.every((r) => r.passed || r.skipped);
    if (!allPassed) {
      process.exitCode = 1;
    }
  });

evalCmd.command('compare')
  .description('Compare candidate eval results against a baseline')
  .requiredOption('--base <path>', 'Path to baseline JSONL results')
  .requiredOption('--candidate <path>', 'Path to candidate JSONL results')
  .option('--allow-regression', 'Allow regressions without failing exit code', false)
  .action(async (opts) => {
    const { EvalCompare } = await import('./eval/EvalCompare');
    if (!fs.existsSync(opts.base)) {
      console.error(`Baseline file not found: ${opts.base}`);
      process.exit(1);
    }
    if (!fs.existsSync(opts.candidate)) {
      console.error(`Candidate file not found: ${opts.candidate}`);
      process.exit(1);
    }

    const comparison = EvalCompare.compareFiles(opts.base, opts.candidate, {
      allowRegression: opts.allowRegression,
    });

    console.log(EvalCompare.formatReport(comparison, { allowRegression: opts.allowRegression }));

  });

evalCmd.command('competitors')
  .description('Run evaluation harness comparing AgentOS against external competitor tools')
  .option('-t, --task <id>', 'Task ID to run, tag name (e.g. smoke), or "all"', 'all')
  .option('-m, --model <model>', 'AgentOS model to evaluate', 'fake:scripted')
  .option('--config <path>', 'Path to competitors configuration JSON')
  .option('--report <path>', 'Output path for markdown benchmark report')
  .action(async (opts, cmd) => {
    const { EvalLoader } = await import('./eval/EvalLoader');
    const { CompetitorEval } = await import('./eval/CompetitorEval');

    const parentTask = cmd?.parent?.opts()?.task;
    const taskFilter = (opts.task && opts.task !== 'all') ? opts.task : (parentTask || opts.task || 'all');

    const tasksRoot = EvalLoader.getDefaultTasksRoot();
    let tasks: import('./eval/EvalTypes').EvalTask[] = [];

    const all = await EvalLoader.loadAllTasks(tasksRoot);
    if (taskFilter === 'all') {
      tasks = all;
    } else {
      const tagged = all.filter((t) => t.meta.tags?.includes(taskFilter) || t.meta.id === taskFilter);
      if (tagged.length > 0) {
        tasks = tagged;
      } else {
        tasks = [await EvalLoader.loadTask(taskFilter, tasksRoot)];
      }
    }

    if (tasks.length === 0) {
      console.log('No evaluation tasks found.');
      return;
    }

    console.log(`Running competitive benchmark on ${tasks.length} task(s)...`);

    const result = await CompetitorEval.runBenchmark({
      tasks,
      agentOsModel: opts.model,
      configPath: opts.config,
      reportPath: opts.report,
      onProgress: (harness, taskId, status) => {
        console.log(`[${status}] ${harness} on ${taskId}`);
      },
    });

    console.log('\n' + result.markdownReport);
  });

const traceCmd = program.command('trace').description('Inspect and export execution traces');

traceCmd
  .command('show <runId>')
  .description('Show execution trace events for a given run ID')
  .action(async (runId) => {
    const { RunTracer } = await import('@agent-os/agent-runtime');
    const traceFile = RunTracer.findTraceFile(runId);
    if (!traceFile) {
      console.error(`Trace not found for runId: ${runId}`);
      process.exit(1);
    }
    const entries = RunTracer.readTrace(traceFile);
    console.log(`Trace: ${traceFile} (${entries.length} events)\n`);
    for (const e of entries) {
      console.log(`[${e.timestamp}] ${e.type}: ${JSON.stringify(e.payload)}`);
    }
  });

traceCmd
  .command('export <runId>')
  .description('Export execution trace to json or md format')
  .option('-f, --format <format>', 'Export format (json or md)', 'md')
  .option('-o, --output <path>', 'Output file path')
  .action(async (runId, opts) => {
    const { RunTracer } = await import('@agent-os/agent-runtime');
    const traceFile = RunTracer.findTraceFile(runId);
    if (!traceFile) {
      console.error(`Trace not found for runId: ${runId}`);
      process.exit(1);
    }
    const entries = RunTracer.readTrace(traceFile);
    let output = '';
    if (opts.format === 'json') {
      output = JSON.stringify(entries, null, 2);
    } else {
      output = RunTracer.exportMarkdown(entries);
    }

    if (opts.output) {
      fs.writeFileSync(opts.output, output, 'utf8');
      console.log(`Exported trace to: ${opts.output}`);
    } else {
      console.log(output);
    }
  });

program
  .command('replay')
  .description('Reconstruct and display history for a session run')
  .requiredOption('-s, --session <id>', 'Session ID to replay')
  .requiredOption('-r, --run <id>', 'Run ID to replay')
  .action(async (opts) => {
    try {
      const runtime = new CliRuntime({ configPath }, opts.session);
      const { SessionReplayer } = await import('@agent-os/agent-runtime');
      const replayer = new SessionReplayer(runtime.agentRuntime.getSessionManager());
      const summary = replayer.replay(opts.session, opts.run);
      console.log(SessionReplayer.formatSummary(summary));
    } catch (err: any) {
      console.error(`Replay error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('resume')
  .description('Resume an interrupted session run')
  .requiredOption('-s, --session <id>', 'Session ID to resume')
  .option('-r, --run <id>', 'Run ID to resume')
  .action(async (opts) => {
    try {
      const runtime = new CliRuntime({ configPath }, opts.session);
      const incomplete = runtime.agentRuntime.getSessionManager().getIncompleteRun(opts.session);
      if (!incomplete && !opts.run) {
        console.log(`No incomplete run detected for session ${opts.session}`);
        return;
      }
      console.log(`Resuming session ${opts.session}...`);
      const summary = await runtime.agentRuntime.resume(opts.session, opts.run);
      console.log(`Resume complete (status: ${summary.status}):\n${summary.finalText}`);
    } catch (err: any) {
      console.error(`Resume error: ${err.message}`);
      process.exit(1);
    }
  });

const patchCmd = program.command('patch').description('Inspect and save run patches');

patchCmd
  .command('save <runId>')
  .description('Save the exact run ChangeSet as a unified patch file')
  .requiredOption('-o, --out <path>', 'Output patch file path')
  .action(async (runId, opts) => {
    try {
      const { ChangeSetStore } = await import('@agent-os/patch-engine');
      const store = new ChangeSetStore();
      const changeSet = store.load(runId);
      if (!changeSet) {
        console.error(`ChangeSet not found for runId: ${runId}`);
        process.exit(1);
      }
      const diff = ChangeSetStore.toUnifiedDiff(changeSet);
      fs.writeFileSync(opts.out, diff, 'utf8');
      console.log(`Saved patch for run ${runId} to ${opts.out}`);
    } catch (err: any) {
      console.error(`Patch save error: ${err.message}`);
      process.exit(1);
    }
  });

patchCmd
  .command('show <runId>')
  .description('Show changed files and diff preview for a run')
  .action(async (runId) => {
    try {
      const { ChangeSetStore } = await import('@agent-os/patch-engine');
      const store = new ChangeSetStore();
      const changeSet = store.load(runId);
      if (!changeSet) {
        console.error(`ChangeSet not found for runId: ${runId}`);
        process.exit(1);
      }
      console.log(`Patch for Run ${runId} (${changeSet.files.length} files changed):\n`);
      for (const f of changeSet.files) {
        console.log(`  [${(f.kind || 'modify').toUpperCase()}] ${f.path}`);
      }
      console.log('\n--- Diff Preview ---\n');
      console.log(ChangeSetStore.toUnifiedDiff(changeSet));
    } catch (err: any) {
      console.error(`Patch show error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('bench')
  .description('Run performance benchmarks and check against performance budgets')
  .option('--json', 'Output results as JSON')
  .option('--check', 'Exit with non-zero code if any budget is exceeded')
  .action(async (opts) => {
    try {
      const { BenchRunner } = await import('./bench/BenchRunner');
      const report = await BenchRunner.runBenchmarks(process.cwd());
      if (opts.json) {
        console.log(BenchRunner.formatJson(report));
      } else {
        console.log(BenchRunner.formatMarkdown(report));
      }
      if (opts.check && !report.allPassed) {
        process.exit(1);
      }
    } catch (err: any) {
      console.error(`Bench error: ${err.message}`);
      process.exit(1);
    }
  });

await program.parseAsync();


