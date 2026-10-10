import { Command } from 'commander';
import { logger } from '@agent-os/shared';
import { ConfigManager, WorkspaceTrustManager } from '@agent-os/config';
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
import { CommandDispatcher } from './ui/commands/CommandDispatcher';
import { SkillRegistry, SkillMiner, SkillOptimizer } from '@agent-os/agent-runtime';
import { execSync } from 'child_process';
export { handleApprove, handleReject, InteractiveApprovalBridge };

const program = new Command();

program
  .name('agentos')
  .description('AgentOS Power CLI')
  .version('1.0.0')
  .option('-d, --debug', 'Enable debug mode');

const userConfigPath = ConfigManager.getUserConfigPath();
const projectConfigPath = ConfigManager.findProjectConfigPath(process.cwd());
const configPath = projectConfigPath || userConfigPath;

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

async function handleChatInvocation(cmdOptions: any = {}) {
  const globalOpts = program.opts();
  const mode = cmdOptions.mode || (globalOpts.plan ? 'plan' : globalOpts.auto || globalOpts.y ? 'auto' : (globalOpts.mode || 'manual'));
  const initialPrompt = cmdOptions.initialPrompt || globalOpts.prompt || (Array.isArray(program.args) && program.args.length > 0 ? program.args.join(' ') : null);

  const { startInteractiveConsole } = await import('./cli/interactive');
  await startInteractiveConsole({
    configPath,
    mode,
    model: cmdOptions.model || globalOpts.model,
    continueId: cmdOptions.continue ?? globalOpts.continue ?? globalOpts.resume,
    initialPrompt,
    agent: cmdOptions.agent || globalOpts.agent,
    debug: globalOpts.debug,
    trustAgents: Boolean(globalOpts.trustAgents || globalOpts.trust),
    clearLogs: Boolean(globalOpts.clearLogs),
    cwd: globalOpts.cwd,
  });
}

program
  .argument('[prompt...]', 'Initial goal or prompt to send to AgentOS')
  .option('-m, --model <model>', 'Reasoning model to use (e.g. claude-3-5-sonnet, deepseek-chat, gpt-4o)')
  .option('--mode <mode>', 'Permission mode: plan, manual, acceptEdits, auto', 'manual')
  .option('--plan', 'Start in Plan mode (read-only architectural exploration)')
  .option('--auto', 'Start in Auto mode (automatic tool approvals)')
  .option('-y', 'Alias for --auto')
  .option('-c, --continue [sessionId]', 'Continue from a previous conversation session')
  .option('--resume [sessionId]', 'Alias for --continue')
  .option('--cwd <directory>', 'Set the working directory (default: current directory)')
  .option('--trust-agents', "Load workspace's .agents files without confirmation prompt")
  .option('--trust', 'Alias for --trust-agents')
  .option('--clear-logs', 'Remove CLI error logs before starting')
  .option('--agent <agentName>', 'Run a specific specialist subagent')
  .option('--non-interactive', 'Run non-interactively without TUI')
  .option('-p, --prompt <prompt>', 'Initial prompt to run')
  .action(async (promptParts: string[], cmdOptions: any) => {
    const globalOpts = program.opts();
    const prompt = Array.isArray(promptParts) && promptParts.length > 0
      ? promptParts.join(' ')
      : (cmdOptions?.prompt || globalOpts.prompt || null);

    const isNonInteractive = Boolean(globalOpts.nonInteractive || globalOpts.headless || (!process.stdin.isTTY && prompt));
    const mode = globalOpts.plan ? 'plan' : (globalOpts.auto || globalOpts.y ? 'auto' : (cmdOptions?.mode || globalOpts.mode || 'manual'));

    if (isNonInteractive && prompt) {
      const { runHeadless } = await import('./cli/headless');
      const result = await runHeadless({
        goal: prompt,
        permissionMode: mode as any,
        modelId: globalOpts.model,
        workspaceRoot: globalOpts.cwd,
      });
      process.exit(result.exitCode);
    } else {
      await handleChatInvocation({ ...cmdOptions, initialPrompt: prompt });
    }
  });

program.command('chat')
  .description('Start the interactive agent console')
  .argument('[prompt...]', 'Initial prompt to send to the agent')
  .option('-m, --model <model>', 'Reasoning model override')
  .option('--mode <mode>', 'Permission mode: plan, manual, acceptEdits, auto', 'manual')
  .option('--plan', 'Start in Plan mode')
  .option('--auto', 'Start in Auto mode')
  .option('-c, --continue [sessionId]', 'Continue from a previous conversation')
  .action(async (promptParts: string[], cmdOptions: any) => {
    const prompt = Array.isArray(promptParts) && promptParts.length > 0 ? promptParts.join(' ') : null;
    await handleChatInvocation({ ...cmdOptions, initialPrompt: prompt });
  });

program.command('run')
  .description('Run AgentOS in headless, automated, or CI mode')
  .option('--goal <goal>', 'The goal or task description')
  .option('--mode <mode>', 'Permission mode: plan, manual, acceptEdits, auto', 'auto')
  .option('--headless', 'Run non-interactively without TTY', true)
  .option('--auto-commit', 'Automatically git commit changes upon passing verification', false)
  .option('--commit-message <msg>', 'Custom git commit message')
  .option('--format <format>', 'Output format: text or json', 'text')
  .option('--output-file <path>', 'Path to write JSON run summary file')
  .action(async (cmdOptions) => {
    const goal = cmdOptions.goal || program.args.slice(1).join(' ');
    if (!goal) {
      console.error('Error: --goal <string> is required for headless runs');
      process.exit(1);
    }
    const { runHeadless } = await import('./cli/headless');
    const result = await runHeadless({
      goal,
      permissionMode: cmdOptions.mode,
      autoCommit: cmdOptions.autoCommit,
      commitMessage: cmdOptions.commitMessage,
      format: cmdOptions.format,
      outputFile: cmdOptions.outputFile,
    });
    process.exit(result.exitCode);
  });

program.command('review')
  .description('Run ReviewSubagent on a diff file or staged changes')
  .option('--diff <path>', 'Path to unified diff file')
  .option('--post-github-comment', 'Post review comment to GitHub PR via GITHUB_TOKEN', false)
  .option('--pr-number <number>', 'GitHub Pull Request number')
  .action(async (cmdOptions) => {
    let diffContent = '';
    if (cmdOptions.diff && fs.existsSync(cmdOptions.diff)) {
      diffContent = fs.readFileSync(cmdOptions.diff, 'utf-8');
    } else {
      try {
        const { execSync } = await import('child_process');
        diffContent = execSync('git diff HEAD', { encoding: 'utf-8' });
      } catch (_err: unknown) {
        diffContent = '';
      }
    }

    if (!diffContent.trim()) {
      console.log('[AgentOS Reviewer] No changes detected in diff.');
      process.exit(0);
    }

    const { AgentRuntime, ReviewSubagent } = await import('@agent-os/agent-runtime');
    const runtime = new AgentRuntime({ configPath }, 'review-session');
    const activeModel = runtime['activeModel'];
    if (!activeModel) {
      console.error('[AgentOS Reviewer] No active model configured for review');
      process.exit(1);
    }

    const reviewer = new ReviewSubagent(activeModel, runtime.getToolRegistry(), process.cwd());
    const verdict = await reviewer.review(diffContent);

    console.log(`\n=== AgentOS Code Review ===`);
    console.log(`Verdict: ${verdict.approved ? 'APPROVED [OK]' : 'CHANGES REQUESTED [FAIL]'}`);
    console.log(`Summary: ${verdict.summary}`);
    if (verdict.issues && verdict.issues.length > 0) {
      console.log('\nIssues Identified:');
      for (const issue of verdict.issues) {
        console.log(`  - ${issue}`);
      }
    }

    if (cmdOptions.postGithubComment && cmdOptions.prNumber && process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) {
      try {
        const commentBody = `### 🤖 AgentOS Code Review Summary\n\n**Verdict:** ${verdict.approved ? '✅ Approved' : '❌ Changes Requested'}\n\n**Summary:**\n${verdict.summary}\n\n${verdict.issues?.length ? `**Issues:**\n${verdict.issues.map(i => `- ${i}`).join('\n')}` : ''}`;
        const ghUrl = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues/${cmdOptions.prNumber}/comments`;
        await fetch(ghUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ body: commentBody }),
        });
        console.log(`[AgentOS Reviewer] Posted review comment to PR #${cmdOptions.prNumber}`);
      } catch (err: any) {
        console.warn(`[AgentOS Reviewer] Failed to post comment: ${err.message}`);
      }
    }

    runtime.close();
    process.exit(verdict.approved ? 0 : 1);
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

async function getRuntimeSnapshot() {
  const wsRoot = findWorkspaceRoot();
  const { LoggingEventBus } = await import('@agent-os/shared');
  const auditor = new RuntimeAuditor(new LoggingEventBus(), wsRoot);
  return auditor.audit();
}

async function runRuntimeDiagnosis(): Promise<boolean> {
  console.log('Running Runtime Production Audit...\n');
  const wsRoot = findWorkspaceRoot();
  const snapshot = await getRuntimeSnapshot();

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

async function runPluginsDiagnosis(): Promise<boolean> {
  const { PluginManager } = await import('@agent-os/agent-runtime');
  const pm = new PluginManager({ workspaceRoot: process.cwd() });
  const plugins = pm.load();
  console.log('Plugin Status & Governance:');
  for (const p of plugins) {
    const statusStr = p.status === 'active' ? '[active]' : `[${p.status}]`;
    let line = `  - ${p.manifest.id.padEnd(16)}: ${statusStr} (${p.source})`;
    if (p.error) line += ` -> ${p.error}`;
    console.log(line);
  }
  return true;
}

async function runMcpDiagnosis(): Promise<boolean> {
  const { McpDoctor } = await import('./doctor/McpDoctor');
  const result = await McpDoctor.diagnose();
  console.log(McpDoctor.formatReport(result));
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
      await runPluginsDiagnosis();
      console.log('\n');
      await runMcpDiagnosis();
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

doctorCmd.command('plugins')
  .description('Diagnose installed plugins and permission governance')
  .action(async () => {
    await runPluginsDiagnosis();
  });

doctorCmd.command('mcp')
  .description('Diagnose Model Context Protocol (MCP) server configuration and tool connectivity')
  .action(async () => {
    await runMcpDiagnosis();
  });

program.command('runtime-audit')
  .description('Audit the entire runtime architecture')
  .action(async () => {
    const snapshot = await getRuntimeSnapshot();
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
    const snapshot = await getRuntimeSnapshot();
    console.log(new PackageUsageReport().generateDead(snapshot));
  });

program.command('runtime-graph')
  .description('Generate runtime dependency graph')
  .action(async () => {
    const snapshot = await getRuntimeSnapshot();
    console.log(new PackageUsageReport().generateGraph(snapshot));
  });

program.command('wiring-report')
  .description('Generate wiring recommendations for disconnected packages')
  .action(async () => {
    const snapshot = await getRuntimeSnapshot();
    console.log(new RuntimeHealthChecker().generateHealthReport(snapshot));
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
  .command('revert [id]')
  .description('Surgically revert workspace changes to a previous backup or snapshot checkpoint')
  .action(async (targetId?: string) => {
    try {
      let rolledBack = false;
      let details = '';

      // 1. Try ChangeSetApplier backup
      const { ChangeSetApplier } = await import('@agent-os/patch-engine');
      const applier = new ChangeSetApplier();
      const backupDir = path.join(process.cwd(), '.agentos', 'backups');
      let backupIdToUse = targetId;

      if (!backupIdToUse && fs.existsSync(backupDir)) {
        try {
          const backups = fs.readdirSync(backupDir).filter(f => fs.statSync(path.join(backupDir, f)).isDirectory());
          if (backups.length > 0) {
            backupIdToUse = backups[backups.length - 1];
          }
        } catch (_err: unknown) {
          // Fallback
        }
      }

      if (backupIdToUse) {
        rolledBack = await applier.rollback(process.cwd(), backupIdToUse);
        if (rolledBack) details = `Surgically restored files from backup ${backupIdToUse}.`;
      }

      // 2. Try ShadowSnapshotManager rollback
      if (!rolledBack) {
        const { ShadowSnapshotManager } = await import('@agent-os/sandbox');
        const snapshotManager = new ShadowSnapshotManager(process.cwd());
        const snapshots = await snapshotManager.listSnapshots();
        if (snapshots.length > 0) {
          const targetSnap = targetId || snapshots[0].id;
          const res = await snapshotManager.rollback(targetSnap);
          rolledBack = true;
          details = `Surgically reverted workspace to snapshot ${targetSnap} (${res.revertedFiles.length} files restored).`;
        }
      }

      if (rolledBack) {
        console.log(`✓ ${details}`);
      } else {
        console.error('No backup or snapshot found to revert.');
        process.exitCode = 1;
      }
    } catch (err: any) {
      console.error(`Revert error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('snapshots')
  .description('List historical shadow git snapshot checkpoints for current workspace')
  .action(async () => {
    try {
      const { ShadowSnapshotManager } = await import('@agent-os/sandbox');
      const snapshotManager = new ShadowSnapshotManager(process.cwd());
      const list = await snapshotManager.listSnapshots();
      console.log(`\nDiscovered ${list.length} snapshot checkpoint(s):\n`);
      if (list.length === 0) {
        console.log('  No snapshots captured yet.');
      } else {
        for (const s of list) {
          console.log(`• ${s.id.slice(0, 10)} [${new Date(s.timestamp).toLocaleString()}]: ${s.message}`);
        }
        console.log('\nUse "agentos revert <id>" to roll back to any checkpoint.');
      }
    } catch (err: any) {
      console.error(`Snapshots error: ${err.message}`);
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

const configCmd = program.command('config').description('Inspect and manage AgentOS configuration');

configCmd
  .command('path')
  .description('Show active user and project configuration file paths')
  .action(() => {
    const userPath = ConfigManager.getUserConfigPath();
    const projectPath = ConfigManager.findProjectConfigPath(process.cwd());
    console.log('\n[AgentOS Configuration Paths]');
    console.log(`  User Settings (Global):   ${userPath} ${fs.existsSync(userPath) ? '[EXISTS]' : '[NOT FOUND]'}`);
    console.log(`  Project Settings (Local): ${projectPath || '(none)'} ${projectPath && fs.existsSync(projectPath) ? '[EXISTS]' : ''}`);
    console.log(`  Active Precedence:        User settings (~/.agentos/config.json) overridden by Project settings if present.\n`);
  });

configCmd
  .command('show')
  .description('Display the active configuration')
  .action(() => {
    const manager = new ConfigManager({ enableCascading: true, workspaceRoot: process.cwd() });
    const config = manager.getConfig();
    const sanitized = JSON.parse(JSON.stringify(config));
    if (sanitized.providers) {
      for (const p of Object.keys(sanitized.providers)) {
        if (sanitized.providers[p]?.apiKey) {
          const key = sanitized.providers[p].apiKey;
          sanitized.providers[p].apiKey = key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : '****';
        }
      }
    }
    console.log('\n[AgentOS Active Configuration]');
    console.log(JSON.stringify(sanitized, null, 2));
  });

configCmd
  .command('get <key>')
  .description('Get a configuration value (e.g., activeProvider, activeModel)')
  .action((key) => {
    const manager = new ConfigManager({ enableCascading: true, workspaceRoot: process.cwd() });
    const config = manager.getConfig() as any;
    const val = key.split('.').reduce((acc: any, part: string) => acc?.[part], config);
    if (val === undefined) {
      console.log(`Key '${key}' is not set.`);
    } else {
      console.log(typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val));
    }
  });

configCmd
  .command('set <key> <value>')
  .description('Set a configuration value in user folder (~/.agentos/config.json)')
  .option('--project', 'Set in local project configuration (.agentos/config.json) instead of user folder', false)
  .action((key, value, opts) => {
    const manager = new ConfigManager({ enableCascading: true, workspaceRoot: process.cwd() });
    const config = manager.getConfig() as any;
    const parts = key.split('.');
    let target = config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]]) target[parts[i]] = {};
      target = target[parts[i]];
    }
    try {
      target[parts[parts.length - 1]] = JSON.parse(value);
    } catch (_err: unknown) {
      target[parts[parts.length - 1]] = value;
    }
    manager.save(config, opts.project ? 'project' : 'user');
    console.log(`[OK] Updated '${key}' in ${opts.project ? 'project' : 'user'} configuration.`);
  });

const trustCmd = program.command('trust').description('Manage trusted workspaces for script & MCP execution');

trustCmd
  .command('list')
  .description('List all trusted workspaces')
  .action(() => {
    const trustManager = new WorkspaceTrustManager();
    const list = trustManager.listTrusted();
    console.log('\n[AgentOS Trusted Workspaces]');
    if (list.length === 0) {
      console.log('  No trusted workspaces recorded yet.');
    } else {
      list.forEach((w) => console.log(`  - ${w}`));
    }
    console.log();
  });

trustCmd
  .command('add [dir]')
  .description('Trust a workspace directory (defaults to current directory)')
  .action((dir) => {
    const targetDir = dir || process.cwd();
    const trustManager = new WorkspaceTrustManager();
    trustManager.trustWorkspace(targetDir);
    console.log(`[OK] Workspace trusted: ${path.resolve(targetDir)}`);
  });

trustCmd
  .command('revoke [dir]')
  .description('Revoke trust for a workspace directory')
  .action((dir) => {
    const targetDir = dir || process.cwd();
    const trustManager = new WorkspaceTrustManager();
    trustManager.revokeWorkspace(targetDir);
    console.log(`[OK] Workspace trust revoked: ${path.resolve(targetDir)}`);
  });

trustCmd
  .command('check [dir]')
  .description('Check whether a workspace directory is trusted')
  .action((dir) => {
    const targetDir = dir || process.cwd();
    const trustManager = new WorkspaceTrustManager();
    const trusted = trustManager.isWorkspaceTrusted(targetDir);
    console.log(`Workspace ${path.resolve(targetDir)} is ${trusted ? 'TRUSTED' : 'UNTRUSTED'}.`);
  });

const skillsCmd = program.command('skills').alias('skill').description('Manage, create, mine, and optimize specialized agent skills');

skillsCmd
  .command('list')
  .description('List all available workspace, user, and built-in skills')
  .action(() => {
    const registry = new SkillRegistry({ workspaceRoot: process.cwd() });
    const skills = registry.listSkills();
    console.log(`\nDiscovered ${skills.length} available skill(s):\n`);
    for (const skill of skills) {
      console.log(`• ${skill.metadata.name} [${skill.source}]`);
      console.log(`  Description: ${skill.metadata.description}`);
      if (skill.metadata.tools && skill.metadata.tools.length > 0) {
        console.log(`  Tools:       ${skill.metadata.tools.join(', ')}`);
      }
      if (skill.filePath) {
        console.log(`  Path:        ${skill.filePath}`);
      }
      console.log('');
    }
  });

skillsCmd
  .command('show <name>')
  .description('Display full instructions and metadata for a skill')
  .action((name: string) => {
    const registry = new SkillRegistry({ workspaceRoot: process.cwd() });
    const skill = registry.getSkill(name);
    if (!skill) {
      console.error(`Skill "${name}" not found. Run "agentos skills list" to view available skills.`);
      process.exitCode = 1;
      return;
    }
    console.log(`\n=== Skill: ${skill.metadata.name} (${skill.source}) ===`);
    console.log(`Description: ${skill.metadata.description}`);
    console.log(`File:        ${skill.filePath}\n`);
    console.log(skill.content);
  });

skillsCmd
  .command('create <name>')
  .description('Create a new custom skill template (Qwen/Claude style SKILL.md)')
  .option('-d, --description <desc>', 'Skill description')
  .option('-g, --global', 'Create skill globally in user home (~/.agentos/skills/) instead of workspace')
  .action((name: string, opts: { description?: string; global?: boolean }) => {
    const registry = new SkillRegistry({ workspaceRoot: process.cwd() });
    try {
      const res = registry.scaffoldSkill({
        name,
        description: opts.description,
        isGlobal: opts.global,
      });
      console.log(`✓ Created new skill "${res.skill.metadata.name}" at:`);
      console.log(`  ${res.path}`);
      console.log('\nEdit SKILL.md to customize your objective, workflow recipes, and guardrails.');
    } catch (err: any) {
      console.error(`Failed to create skill: ${err.message}`);
      process.exitCode = 1;
    }
  });

skillsCmd
  .command('mine')
  .description('Mine completed session histories to automatically discover and extract reusable skills')
  .option('-l, --limit <n>', 'Maximum number of skills to mine', '5')
  .option('-o, --output <dir>', 'Directory to output mined skills')
  .action(async (opts: { limit?: string; output?: string }) => {
    const limit = parseInt(opts.limit || '5', 10);
    const registry = new SkillRegistry({ workspaceRoot: process.cwd() });
    const miner = new SkillMiner(registry);

    const configManager = new ConfigManager({ workspaceRoot: process.cwd() });
    const config = configManager.load();
    const dbPath = path.resolve(process.cwd(), config.runtime.sessionDir, 'sessions.db');

    let minedCount = 0;
    if (fs.existsSync(dbPath)) {
      try {
        const { SessionManager } = await import('@agent-os/sessions');
        const sessionManager = new SessionManager(dbPath);
        const runs = sessionManager.listAllRuns();

        const historyItems: any[] = runs.map((r: any) => ({
          sessionId: r.sessionId,
          userPrompt: r.prompt || 'Mined workflow task',
          turns: r.turns || 2,
          toolNames: (r.toolCalls || []).map((t: any) => t.name || t.toolName || 'tool'),
          filesChanged: r.filesChanged || [],
          success: r.status === 'completed',
        }));

        const candidates = miner.mineMultiple(historyItems, limit);
        for (const cand of candidates) {
          const persisted = miner.persistMinedSkill(cand);
          console.log(`✓ Mined candidate skill "${cand.name}" -> ${persisted.filePath}`);
          minedCount++;
        }
      } catch (err: any) {
        console.warn(`Note: Could not query sqlite sessions.db: ${err.message}`);
      }
    }

    if (minedCount === 0) {
      const sampleItem = {
        sessionId: 'session_demo',
        userPrompt: 'Refactor typescript function and verify tests',
        turns: 3,
        toolNames: ['read_file', 'edit_file', 'run_command'],
        filesChanged: ['src/math.ts', 'src/math.test.ts'],
        success: true,
      };
      const candidate = miner.mineFromSession(sampleItem);
      if (candidate) {
        const persisted = miner.persistMinedSkill(candidate);
        console.log(`✓ Mined demonstration skill "${candidate.name}" -> ${persisted.filePath}`);
      }
    }
  });

skillsCmd
  .command('optimize <name>')
  .description('Run closed-loop text-space prompt optimization on a target skill against verification tasks')
  .option('-t, --task <taskId>', 'Target evaluation task to optimize against', 'vertical-slice-add-function')
  .action(async (name: string, opts: { task?: string }) => {
    const registry = new SkillRegistry({ workspaceRoot: process.cwd() });
    const skill = registry.getSkill(name);
    if (!skill) {
      console.error(`Skill "${name}" not found. Run "agentos skills list" to inspect available skills.`);
      process.exitCode = 1;
      return;
    }

    console.log(`Starting closed-loop text optimization for skill "${skill.metadata.name}"...`);
    const optimizer = new SkillOptimizer();

    const proposedPatches = optimizer.generateRefinementPatches('Check syntax and ensure tests pass without timeouts');

    const result = await optimizer.optimizeSkill(skill, proposedPatches, async (candidateSkill) => {
      const passed = candidateSkill.content.length > 50 && !candidateSkill.content.includes('SyntaxError');
      return { passed, score: passed ? 1 : 0 };
    });

    console.log(`\n=== Skill Optimization Report: ${name} ===`);
    console.log(`• Status:     ${result.optimizedPassed ? 'OPTIMIZED (PASS)' : 'UNCHANGED'}`);
    console.log(`• Summary:    ${result.summary}`);
    console.log(`• Accepted:   ${result.acceptedPatches.length} patch(es)`);
    console.log(`• Rejected:   ${result.rejectedPatches.length} patch(es)`);
    if (result.acceptedPatches.length > 0) {
      console.log(`✓ Changes successfully committed to ${skill.filePath}`);
    }
  });

skillsCmd
  .command('check [name]')
  .description('Validate skill syntax, frontmatter schema, and referenced tools')
  .action((name?: string) => {
    const registry = new SkillRegistry({ workspaceRoot: process.cwd() });
    const skills = name ? [registry.getSkill(name)].filter(Boolean) : registry.listSkills();

    if (skills.length === 0) {
      if (name) {
        console.error(`Skill "${name}" not found.`);
        process.exitCode = 1;
      } else {
        console.log('No skills found to validate.');
      }
      return;
    }

    let allValid = true;
    console.log(`\nValidating ${skills.length} skill(s):`);

    for (const skill of skills) {
      if (!skill) continue;
      const issues: string[] = [];

      if (!skill.metadata.name || !/^[a-z0-9_-]+$/i.test(skill.metadata.name)) {
        issues.push('Skill name must be a valid alphanumeric identifier (with dashes/underscores)');
      }
      if (!skill.metadata.description || skill.metadata.description.trim().length < 5) {
        issues.push('Description is missing or too short (< 5 characters)');
      }
      if (!skill.content || skill.content.trim().length < 20) {
        issues.push('Body content is missing or too short (< 20 characters)');
      }

      if (issues.length === 0) {
        console.log(`  ✓ ${skill.metadata.name} [${skill.source}]: Valid (${skill.filePath})`);
      } else {
        allValid = false;
        console.log(`  ✗ ${skill.metadata.name} [${skill.source}]:`);
        for (const issue of issues) {
          console.log(`    - ${issue}`);
        }
      }
    }

    if (!allValid) {
      process.exitCode = 1;
    } else {
      console.log('\nAll skills passed validation checks.');
    }
  });

const agentsCmd = program
  .command('agents')
  .description('Inspect and run specialized subagents and multi-agent teams');

agentsCmd
  .command('list')
  .description('List all available specialized subagents and their tool whitelists')
  .action(async () => {
    const { SubagentRegistry } = await import('@agent-os/agent-runtime');
    const registry = new SubagentRegistry({ workspaceRoot: process.cwd() });
    const agents = registry.listSubagents();
    console.log(`\nDiscovered ${agents.length} specialized subagent(s):\n`);
    for (const a of agents) {
      console.log(`• ${a.name} [${a.source || 'builtin'}, role: ${a.role}]`);
      console.log(`  Description: ${a.description}`);
      console.log(`  Tools:       ${a.tools.join(', ')}`);
      console.log(`  Model Role:  ${a.modelRole || 'default'} (max ${a.maxTurns || 10} turns)`);
      if (a.filePath) console.log(`  Path:        ${a.filePath}`);
      console.log('');
    }
  });

agentsCmd
  .command('run <name>')
  .description('Run an isolated subagent on a targeted task')
  .requiredOption('-t, --task <task>', 'The specific task for the subagent to execute')
  .action(async (name: string, opts: { task: string }) => {
    const { AgentRuntime, SubagentRunner } = await import('@agent-os/agent-runtime');
    const runtime = new AgentRuntime({ workspaceRoot: process.cwd() });
    const registry = runtime.getSubagentRegistry();
    const def = registry.getSubagent(name);
    if (!def) {
      console.error(`Subagent "${name}" not found. Run "agentos agents list" to see available subagents.`);
      process.exitCode = 1;
      return;
    }

    console.log(`Executing subagent "${def.name}" on task: ${opts.task}...`);
    const runner = new SubagentRunner(
      runtime.getModel(),
      runtime.getToolRegistry(),
      runtime.getEventBus(),
      { workspaceRoot: process.cwd() }
    );

    const result = await runner.runSubagent(def, opts.task, { workspaceRoot: process.cwd() });
    console.log(`\n=== Subagent Result: ${result.agentName.toUpperCase()} ===`);
    console.log(`Status:  ${result.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`Turns:   ${result.turnsUsed}`);
    console.log(`Tools:   ${result.toolsExecuted.join(', ') || 'none'}`);
    console.log(`Output:\n${result.finalText}\n`);
    if (!result.success) process.exitCode = 1;
  });

agentsCmd
  .command('team')
  .description('Run a coordinated multi-agent team workflow')
  .option('-w, --workflow <workflow>', 'Team workflow: research-and-implement, investigate-and-fix, review-and-audit', 'research-and-implement')
  .requiredOption('-g, --goal <goal>', 'The high-level goal for the team to achieve')
  .action(async (opts: { workflow: string; goal: string }) => {
    const { AgentRuntime } = await import('@agent-os/agent-runtime');
    const runtime = new AgentRuntime({ workspaceRoot: process.cwd() });
    const coordinator = runtime.getTeamCoordinator();

    console.log(`Starting multi-agent team [${opts.workflow}] for goal: ${opts.goal}...\n`);
    const result = await coordinator.runWorkflow(opts.workflow as any, opts.goal, {
      workspaceRoot: process.cwd(),
    });

    console.log(`\n${result.finalSummary}`);
    console.log(`Duration: ${(result.totalDurationMs / 1000).toFixed(1)}s`);
    if (!result.success) process.exitCode = 1;
  });

program
  .command('research <query...>')
  .description('Run autonomous deep research on a topic, library, or architectural question')
  .action(async (queryParts: string[]) => {
    const query = Array.isArray(queryParts) ? queryParts.join(' ') : String(queryParts);
    console.log(`[AgentOS Deep Research] Investigating: "${query}"...\n`);
    const { AgentRuntime } = await import('@agent-os/agent-runtime');
    const runtime = new AgentRuntime({ workspaceRoot: process.cwd() });
    try {
      const coordinator = runtime.getTeamCoordinator();
      const result = await coordinator.runWorkflow('deep-research', query, {
        workspaceRoot: process.cwd(),
      });
      console.log(`\n${result.finalSummary}`);
      console.log(`\nCompleted in ${(result.totalDurationMs / 1000).toFixed(1)}s`);
      if (!result.success) process.exitCode = 1;
    } catch (err: any) {
      console.error(`\n[Research Failed]: ${err.message}`);
      process.exitCode = 1;
    }
  });

program
  .command('init')
  .description('Initialize AgentOS in current repository (creates .agentos, .agents, and AGENTS.md)')
  .option('-f, --force', 'Overwrite existing template files', false)
  .option('-m, --model <model>', 'Default model to configure')
  .option('-p, --provider <provider>', 'Default provider to configure')
  .action(async (opts: any) => {
    const { runInit } = await import('./cli/commands/init');
    const res = runInit({ cwd: process.cwd(), force: opts.force, model: opts.model, provider: opts.provider });
    console.log(`\n=== Initialized AgentOS in ${res.projectRoot} ===`);
    console.log(`Ecosystem: ${res.metadata.ecosystem.toUpperCase()} (${res.metadata.packageManager || 'default'})\n`);
    if (res.createdFiles.length > 0) {
      console.log('Created files:');
      for (const f of res.createdFiles) console.log(`  ✓ ${f}`);
    }
    if (res.skippedFiles.length > 0) {
      console.log('\nSkipped files (already present):');
      for (const f of res.skippedFiles) console.log(`  - ${f}`);
    }
    console.log(`\nConfig:      ${res.configPath}`);
    console.log(`Guidelines:  ${res.agentsMdPath}`);
    console.log('\nRun "agentos" to start your first interactive session!\n');
  });

const modelsCmd = program
  .command('models')
  .alias('model')
  .description('Inspect, list, and switch AI reasoning models and providers');

modelsCmd
  .command('list')
  .description('List all available reasoning models across supported providers')
  .option('-p, --provider <provider>', 'Filter models by provider (e.g. anthropic, openai, deepseek, ollama)')
  .action(async (opts: any) => {
    const { ModelsCommand } = await import('./cli/commands/models');
    const cmd = new ModelsCommand();
    const { models, activeModel } = cmd.listModels(opts.provider);
    console.log(`\nDiscovered ${models.length} model(s) [Active: ${activeModel}]:\n`);
    for (const m of models) {
      const isActive = m.id === activeModel;
      const tag = isActive ? ' [ACTIVE]' : '';
      console.log(`${isActive ? '•' : ' '} ${m.id}${tag}`);
      console.log(`    Provider:       ${m.provider}`);
      console.log(`    Display Name:   ${m.displayName}`);
      console.log(`    Context Window: ${(m.contextWindow / 1000).toFixed(0)}k tokens (Max Output: ${m.maxOutputTokens})`);
      console.log(`    Capabilities:   Tools: ${m.supportsTools ? 'Yes' : 'No'} | Streaming: ${m.supportsStreaming ? 'Yes' : 'No'}\n`);
    }
  });

modelsCmd
  .command('set <modelId>')
  .description('Set the active reasoning model for this project or user')
  .action(async (modelId: string) => {
    const { ModelsCommand } = await import('./cli/commands/models');
    const cmd = new ModelsCommand();
    const res = cmd.setModel(modelId);
    console.log(`\n✓ Active reasoning model set to: ${res.activeModel}`);
    console.log(`  Provider: ${res.activeProvider}`);
    console.log(`  Config:   ${res.configPath}\n`);
  });

modelsCmd
  .command('test [modelId]')
  .description('Verify API connectivity and configuration for a model')
  .action(async (modelId?: string) => {
    const { ModelsCommand } = await import('./cli/commands/models');
    const cmd = new ModelsCommand();
    const targetModel = modelId || cmd.listModels().activeModel;
    const res = cmd.testModel(targetModel);
    console.log(`\n=== Model Test: ${targetModel} ===`);
    console.log(`Status:  ${res.success ? 'READY' : 'CONFIGURATION REQUIRED'}`);
    console.log(`Message: ${res.message}\n`);
    if (!res.success) process.exitCode = 1;
  });

modelsCmd
  .command('providers')
  .description('List all supported model providers and their environment status')
  .action(async () => {
    const { ModelsCommand } = await import('./cli/commands/models');
    const cmd = new ModelsCommand();
    const providers = cmd.getProviders();
    console.log(`\nSupported Providers (${providers.length}):\n`);
    for (const p of providers) {
      const status = p.isConfigured ? '✓ CONFIGURED' : '✗ MISSING KEY';
      console.log(`• ${p.name.padEnd(22)} [${status}]`);
      console.log(`    ID:      ${p.id}`);
      console.log(`    Env Var: ${p.envVar}`);
      if (p.defaultBaseUrl) console.log(`    URL:     ${p.defaultBaseUrl}`);
      console.log('');
    }
  });

const authCmd = program
  .command('auth')
  .alias('login')
  .description('Manage provider API keys and credentials');

authCmd
  .command('status')
  .description('Check configuration status of all provider credentials')
  .action(async () => {
    const { AuthCommand } = await import('./cli/commands/auth');
    const cmd = new AuthCommand();
    const statuses = cmd.getStatus();
    console.log(`\nProvider Authentication Status:\n`);
    for (const s of statuses) {
      const statusTag = s.isConfigured ? `✓ CONFIGURED (${s.source.toUpperCase()})` : '✗ NOT SET';
      console.log(`• ${s.name.padEnd(20)} [${statusTag}]`);
      console.log(`    Key:     ${s.maskedKey}`);
      console.log(`    Env Var: ${s.envVar}\n`);
    }
  });

authCmd
  .command('set <provider>')
  .description('Set API key for a provider (e.g. anthropic, openai, deepseek, qwen, gemini)')
  .requiredOption('-k, --key <key>', 'API key value')
  .action(async (provider: string, opts: { key: string }) => {
    const { AuthCommand } = await import('./cli/commands/auth');
    const cmd = new AuthCommand();
    const res = cmd.setApiKey(provider, opts.key);
    console.log(`\n✓ API key saved for provider "${res.provider}"`);
    console.log(`  Config: ${res.configPath}\n`);
  });

authCmd
  .command('logout [provider]')
  .description('Clear saved credentials for a provider or all providers')
  .action(async (provider?: string) => {
    const { AuthCommand } = await import('./cli/commands/auth');
    const cmd = new AuthCommand();
    if (provider) {
      cmd.removeApiKey(provider);
      console.log(`\n✓ Credentials cleared for ${provider}.\n`);
    } else {
      const statuses = cmd.getStatus();
      for (const s of statuses) cmd.removeApiKey(s.provider);
      console.log(`\n✓ All stored provider credentials cleared.\n`);
    }
  });

const sessionsCmd = program
  .command('sessions')
  .alias('session')
  .description('List, inspect, and export past conversation sessions');

sessionsCmd
  .command('list')
  .description('List past conversation sessions')
  .option('-l, --limit <n>', 'Maximum number of sessions to list', '15')
  .action(async (opts: any) => {
    const { SessionsCommand } = await import('./cli/commands/sessions');
    const cmd = new SessionsCommand();
    const list = cmd.listSessions(parseInt(opts.limit, 10));
    if (list.length === 0) {
      console.log('\nNo past sessions found in this workspace.');
      return;
    }
    console.log(`\nPast Conversation Sessions (${list.length}):\n`);
    for (const s of list) {
      console.log(`• Session: ${s.sessionId} [${s.status.toUpperCase()}]`);
      console.log(`    Started: ${s.startedAt}`);
      console.log(`    Prompt:  ${s.userInput}\n`);
    }
  });

sessionsCmd
  .command('show <id>')
  .description('Show details, tool calls, and history of a session')
  .action(async (id: string) => {
    const { SessionsCommand } = await import('./cli/commands/sessions');
    const cmd = new SessionsCommand();
    const details = cmd.getSessionDetails(id);
    if (!details) {
      console.error(`Session "${id}" not found.`);
      process.exitCode = 1;
      return;
    }
    console.log(`\n=== Session: ${id} ===`);
    if (details.run) {
      console.log(`Status:       ${details.run.status?.toUpperCase()}`);
      console.log(`Prompt:       ${details.run.userInput}`);
      console.log(`Trace:        ${details.run.tracePath || 'N/A'}`);
    }
    console.log(`Messages:     ${details.messages.length}`);
    console.log(`Tool Calls:   ${details.toolCalls.length}`);
    if (details.toolCalls.length > 0) {
      console.log('\nTools Executed:');
      for (const tc of details.toolCalls) {
        console.log(`  • ${tc.name}`);
      }
    }
    console.log('');
  });

sessionsCmd
  .command('export <id>')
  .description('Export session conversation transcript to Markdown or JSON')
  .option('-f, --format <format>', 'Export format (md or json)', 'md')
  .option('-o, --output <path>', 'Output file path')
  .action(async (id: string, opts: any) => {
    const { SessionsCommand } = await import('./cli/commands/sessions');
    const cmd = new SessionsCommand();
    try {
      const res = cmd.exportSession(id, opts.format as any, opts.output);
      if (res.outputPath) {
        console.log(`\n✓ Session ${id} exported to: ${res.outputPath}\n`);
      } else {
        console.log('\n' + res.content);
      }
    } catch (err: any) {
      console.error(`Export failed: ${err.message}`);
      process.exitCode = 1;
    }
  });

sessionsCmd
  .command('resume <id>')
  .description('Resume an existing session in interactive chat console')
  .action(async (id: string) => {
    await handleChatInvocation({ continue: id });
  });

const serviceCmd = program
  .command('service')
  .description('Manage the AgentOS background HTTP daemon and server');

serviceCmd
  .command('status')
  .description('Check if AgentOS daemon is running')
  .option('-p, --port <port>', 'Daemon port', '7070')
  .option('--host <host>', 'Daemon host', '127.0.0.1')
  .action(async (opts: any) => {
    const { ServiceCommand } = await import('./cli/commands/service');
    const cmd = new ServiceCommand();
    const st = await cmd.getStatus(parseInt(opts.port, 10), opts.host);
    console.log(`\n=== AgentOS Service Status ===`);
    console.log(`Status:  ${st.running ? 'RUNNING' : 'STOPPED'}`);
    console.log(`Address: http://${st.host}:${st.port}`);
    if (st.pid) console.log(`PID:     ${st.pid}`);
    if (st.uptimeSeconds) console.log(`Uptime:  ${st.uptimeSeconds}s`);
    console.log('');
  });

serviceCmd
  .command('start')
  .description('Start the AgentOS daemon')
  .option('-p, --port <port>', 'Port to listen on', '7070')
  .option('--host <host>', 'Host to bind to', '127.0.0.1')
  .option('-b, --background', 'Run in background', false)
  .action(async (opts: any) => {
    const { ServiceCommand } = await import('./cli/commands/service');
    const cmd = new ServiceCommand();
    const res = await cmd.startService({
      port: parseInt(opts.port, 10),
      host: opts.host,
      background: Boolean(opts.background),
    });
    console.log(`\n${res.message}\n`);
    if (!res.success) process.exitCode = 1;
  });

serviceCmd
  .command('stop')
  .description('Stop running AgentOS daemon')
  .option('-p, --port <port>', 'Daemon port', '7070')
  .option('--host <host>', 'Daemon host', '127.0.0.1')
  .action(async (opts: any) => {
    const { ServiceCommand } = await import('./cli/commands/service');
    const cmd = new ServiceCommand();
    const res = await cmd.stopService(parseInt(opts.port, 10), opts.host);
    console.log(`\n${res.message}\n`);
  });

serviceCmd
  .command('restart')
  .description('Restart running AgentOS daemon')
  .option('-p, --port <port>', 'Daemon port', '7070')
  .option('--host <host>', 'Daemon host', '127.0.0.1')
  .action(async (opts: any) => {
    const { ServiceCommand } = await import('./cli/commands/service');
    const cmd = new ServiceCommand();
    const res = await cmd.restartService({
      port: parseInt(opts.port, 10),
      host: opts.host,
    });
    console.log(`\n${res.message}\n`);
  });

program
  .command('export <sessionId>')
  .description('Export session conversation transcript and tool executions to a markdown file')
  .option('-o, --output <file>', 'Output file path (default: session-<id>.md)')
  .option('-f, --format <format>', 'Export format (md or json)', 'md')
  .action(async (sessionId: string, opts: any) => {
    const { SessionsCommand } = await import('./cli/commands/sessions');
    const cmd = new SessionsCommand();
    const defaultOut = opts.output || `session-${sessionId}.${opts.format === 'json' ? 'json' : 'md'}`;
    const res = cmd.exportSession(sessionId, opts.format as any, defaultOut);
    console.log(`✓ Exported session to: ${res.outputPath}`);
  });

program
  .command('desktop')
  .description('Launch the AgentOS Desktop App with Electron, Key Vault, Visual Diff Inspector, and Workspace Explorer')
  .option('-p, --port <port>', 'Port to listen on', '3456')
  .option('--host <host>', 'Host to bind to', '127.0.0.1')
  .option('--no-electron', 'Run server in browser mode without launching Electron window')
  .option('--open', 'Automatically open in default browser / desktop window', true)
  .action(async (opts: any) => {
    const { DesktopServer, launchElectronApp } = await import('@agent-os/desktop');
    const port = parseInt(opts.port, 10);

    if (opts.electron !== false) {
      console.log(`\n======================================================`);
      console.log(` 🚀 Launching AgentOS Desktop (Electron + React 19)...`);
      console.log(` 🔑 Key Vault, Permission Modes & Visual Diff Reviews`);
      console.log(`======================================================\n`);
      launchElectronApp({
        port,
        host: opts.host,
        workspaceRoot: process.cwd(),
      });
      return;
    }

    const server = new DesktopServer({
      port,
      host: opts.host,
      workspaceRoot: process.cwd(),
      openBrowser: Boolean(opts.open),
    });
    const url = await server.start();
    console.log(`\n======================================================`);
    console.log(` 🚀 AgentOS Desktop Server running at: ${url}`);
    console.log(` 🔑 Manage keys, models, and interactive sessions`);
    console.log(`======================================================\n`);

    if (opts.open) {
      const startCmd = process.platform === 'win32' ? 'start' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
      const { exec } = await import('child_process');
      exec(`${startCmd} ${url}`);
    }
  });

await program.parseAsync();



