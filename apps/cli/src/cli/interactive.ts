import * as fs from 'fs';
import * as path from 'path';
import { logger } from '@agent-os/shared';
import { CliRuntime } from './CliRuntime';
import { CommandRouter } from './CommandRouter';
import { ChatCommand, RunCommand } from './commands';
import { EventStreamAdapter } from '../bridge/EventStreamAdapter';
import { mountInkApp } from '../ui/render';
import { InputParser } from './InputParser';
import { handleApprove, handleReject } from '../bridge/ApprovalHandler';
import { InteractiveApprovalBridge } from '../bridge/InteractiveApprovalBridge';
import { CommandDispatcher } from '../ui/commands/CommandDispatcher';
import { SessionsCommand } from './commands/sessions';
import { execSync } from 'child_process';

export interface InteractiveConsoleOptions {
  configPath?: string;
  mode?: string;
  model?: string;
  continueId?: string | boolean | null;
  initialPrompt?: string | null;
  agent?: string;
  debug?: boolean;
  trustAgents?: boolean;
  clearLogs?: boolean;
  cwd?: string;
}

export async function startInteractiveConsole(options: InteractiveConsoleOptions = {}): Promise<void> {
  logger.silent = true;

  if (options.cwd && fs.existsSync(options.cwd)) {
    try {
      process.chdir(options.cwd);
    } catch (_e) {
      // Best-effort: ignore directory change error
    }
  }

  if (options.clearLogs) {
    try {
      if (fs.existsSync('cli-error.log')) fs.unlinkSync('cli-error.log');
      const logsDir = path.join(process.cwd(), '.agentos', 'logs');
      if (fs.existsSync(logsDir)) {
        const files = fs.readdirSync(logsDir);
        for (const f of files) fs.unlinkSync(path.join(logsDir, f));
      }
    } catch (_e) {
      // Best-effort: ignore log clearing errors
    }
  }

  const mode = options.mode || 'manual';
  let sessionId = `session_${Date.now()}`;
  let isContinuing = false;

  // Handle conversation continuation
  if (options.continueId) {
    const sessionsCmd = new SessionsCommand();
    if (typeof options.continueId === 'string' && options.continueId.trim().length > 0) {
      sessionId = options.continueId.trim();
      isContinuing = true;
    } else {
      const recent = sessionsCmd.listSessions(1);
      if (recent.length > 0) {
        sessionId = recent[0].sessionId;
        isContinuing = true;
      }
    }
  }

  const approvalBridge = new InteractiveApprovalBridge();
  const runtime = new CliRuntime({
    configPath: options.configPath || '',
    debug: options.debug,
    permissionMode: mode as any,
    requestApproval: approvalBridge.requestApproval,
  }, sessionId);

  if (options.model) {
    runtime.agentRuntime.setActiveModel(options.model);
  }

  const activeModelId = runtime.agentRuntime.getActiveModel().id;
  console.log(`[AgentOS] Permission mode: ${mode} | Active model: ${activeModelId} | Type your goal to begin.`);
  if (isContinuing) {
    console.log(`[AgentOS] Resumed previous session: ${sessionId}`);
  }

  const router = new CommandRouter();
  router.register(ChatCommand);
  router.register(RunCommand);

  const adapter = new EventStreamAdapter(runtime.agentRuntime.getEventBus(), sessionId, options.debug);

  // Preload historical messages if resuming
  if (isContinuing) {
    try {
      const sessionsCmd = new SessionsCommand();
      const details = sessionsCmd.getSessionDetails(sessionId);
      if (details && details.messages.length > 0) {
        for (const msg of details.messages) {
          if (msg.role === 'user') {
            runtime.agentRuntime.getEventBus().publish('message.received', {
              sessionId,
              text: msg.content,
            });
          } else {
            runtime.agentRuntime.getEventBus().publish('message.responded', {
              sessionId,
              response: msg.content,
            });
          }
        }
      }
    } catch (_err) {
      // Ignore
    }
  }

  const handleInput = async (input: string, inputMode: string) => {
    try {
      if (CommandDispatcher.isCommand(input)) {
        const dispatched = CommandDispatcher.dispatch(input);
        if (dispatched.action === 'set_model' && dispatched.payload?.modelId) {
          runtime.agentRuntime.setActiveModel(dispatched.payload.modelId);
          runtime.agentRuntime.getEventBus().publish('message.responded', {
            sessionId,
            response: `Switched active reasoning model to: ${dispatched.payload.modelId}`,
          });
          return;
        } else if (dispatched.action === 'undo') {
          try {
            const targetId = dispatched.payload?.targetId;
            let rolledBack = false;
            let details = '';

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

            if (!rolledBack) {
              execSync('git checkout -- .', { cwd: process.cwd(), stdio: 'pipe' });
              details = 'Rolled back uncommitted working tree changes via git.';
            }

            runtime.agentRuntime.getEventBus().publish('message.responded', {
              sessionId,
              response: `✓ ${details}`,
            });
          } catch (err: any) {
            runtime.agentRuntime.getEventBus().publish('message.responded', {
              sessionId,
              response: `Rollback failed: ${err.message}`,
            });
          }
          return;
        } else if (dispatched.action === 'snapshots') {
          try {
            const { ShadowSnapshotManager } = await import('@agent-os/sandbox');
            const snapshotManager = new ShadowSnapshotManager(process.cwd());
            const list = await snapshotManager.listSnapshots();
            if (list.length === 0) {
              runtime.agentRuntime.getEventBus().publish('message.responded', {
                sessionId,
                response: 'No shadow git snapshot checkpoints found for this workspace.',
              });
            } else {
              const lines = list.slice(0, 10).map((s, idx) => `  ${idx + 1}. [${new Date(s.timestamp).toLocaleTimeString()}] ${s.id.slice(0, 8)} - ${s.message}`);
              runtime.agentRuntime.getEventBus().publish('message.responded', {
                sessionId,
                response: `[Workspace Checkpoint Snapshots]\n${lines.join('\n')}\n\nType "/revert <id>" to roll back to any checkpoint.`,
              });
            }
          } catch (err: any) {
            runtime.agentRuntime.getEventBus().publish('message.responded', {
              sessionId,
              response: `Failed to list snapshots: ${err.message}`,
            });
          }
          return;
        } else if (dispatched.action === 'doctor') {
          const { McpDoctor } = await import('../doctor/McpDoctor');
          const diagnosis = await McpDoctor.diagnose();
          const summary = diagnosis.servers.map(s => `  - ${s.name} (${s.type}): ${s.healthy ? 'HEALTHY' : 'UNHEALTHY'} (${s.toolCount} tools)`).join('\n') || '  No MCP servers configured.';
          runtime.agentRuntime.getEventBus().publish('message.responded', {
            sessionId,
            response: `[AgentOS System Diagnostics]\nConfig: ${diagnosis.configPath}\nServers:\n${summary}`,
          });
          return;
        } else if (dispatched.action === 'mcp') {
          const tools = runtime.agentRuntime.getToolRegistry().list().filter(t => t.spec.name.startsWith('mcp__'));
          const list = tools.map(t => `  - ${t.spec.name}: ${t.spec.description}`).join('\n') || '  No active MCP tools loaded.';
          runtime.agentRuntime.getEventBus().publish('message.responded', {
            sessionId,
            response: `[Active MCP Tools]\n${list}`,
          });
          return;
        } else if (dispatched.action === 'librarian') {
          const { LibrarianSubagent } = await import('@agent-os/agent-runtime');
          const model = runtime.agentRuntime.getModel();
          const librarian = new LibrarianSubagent(model);
          runtime.agentRuntime.getEventBus().publish('message.responded', {
            sessionId,
            response: `Exploring repository: ${dispatched.payload.repoUrl}...`,
          });
          try {
            const report = await librarian.investigate({
              repoUrl: dispatched.payload.repoUrl,
              question: dispatched.payload.question,
            });
            const filesList = report.relevantFiles.map(f => `  - ${f.path}: ${f.summary}`).join('\n') || '  None detected.';
            runtime.agentRuntime.getEventBus().publish('message.responded', {
              sessionId,
              response: `[Librarian Report: ${dispatched.payload.repoUrl}]\n\n${report.answer}\n\nKey Files:\n${filesList}`,
            });
          } catch (err: any) {
            runtime.agentRuntime.getEventBus().publish('message.responded', {
              sessionId,
              response: `[Librarian Error]: ${err.message}`,
            });
          }
          return;
        } else if (dispatched.action === 'toggle_todos') {
          const { sessionTodoManager } = await import('@agent-os/agent-runtime');
          const md = sessionTodoManager.formatMarkdown(sessionId);
          runtime.agentRuntime.getEventBus().publish('message.responded', {
            sessionId,
            response: md ? `[Session Tasks]\n${md}` : 'No active tasks yet for this session. The agent will create checklist items during complex tasks.',
          });
          return;
        } else if (dispatched.action === 'skills') {
          const registry = runtime.agentRuntime.getSkillRegistry();
          registry.refresh();
          const skills = registry.listSkills();
          const list = skills.map(s => `  • ${s.metadata.name} [${s.source}]: ${s.metadata.description}`).join('\n') || '  No skills discovered.';
          runtime.agentRuntime.getEventBus().publish('message.responded', {
            sessionId,
            response: `[Available Specialized Skills]\n${list}\n\nType "/skill <name>" to load a skill into this conversation.`,
          });
          return;
        } else if (dispatched.action === 'skill') {
          const registry = runtime.agentRuntime.getSkillRegistry();
          registry.refresh();
          const skillName = dispatched.payload?.skillName || '';
          const skill = registry.getSkill(skillName);
          if (skill) {
            await runtime.agentRuntime.handleRequest(
              sessionId,
              `[Activated Skill: ${skill.metadata.name}]\nDescription: ${skill.metadata.description}\n\n${skill.content}\n\nPlease apply this skill to our current and subsequent tasks.`
            );
          } else {
            runtime.agentRuntime.getEventBus().publish('message.responded', {
              sessionId,
              response: `Skill "${skillName}" not found. Type /skills to see available skills.`,
            });
          }
          return;
        } else if (dispatched.action === 'bugfix') {
          const { Verification, formatVerificationFailure } = await import('@agent-os/agent-runtime');
          const target = dispatched.payload?.target;
          runtime.agentRuntime.getEventBus().publish('message.responded', {
            sessionId,
            response: `[Bugfix] Running project verifier across workspace...`,
          });
          try {
            const result = await Verification.run({ workspaceRoot: process.cwd() });
            if (result.verdict === 'verified') {
              runtime.agentRuntime.getEventBus().publish('message.responded', {
                sessionId,
                response: `✓ All project checks are already passing (tests, typecheck, lint, build all green).${target ? `\n\nTo investigate "${target}", use /build to propose edits.` : ''}`,
              });
            } else {
              const failSummary = formatVerificationFailure(result);
              runtime.agentRuntime.getEventBus().publish('message.responded', {
                sessionId,
                response: `[Bugfix] Verification failed. Initiating autonomous diagnostic and repair loop...`,
              });
              await runtime.agentRuntime.handleRequest(
                sessionId,
                `[Autonomous Bugfix Request]\nTarget: ${target || 'Fix workspace verification failures'}\n\n${failSummary}\n\nPlease apply systematic debugging to isolate the root cause, apply minimal targeted fixes, and re-verify until green.`
              );
            }
          } catch (err: any) {
            runtime.agentRuntime.getEventBus().publish('message.responded', {
              sessionId,
              response: `[Bugfix Error]: ${err.message}`,
            });
          }
          return;
        } else if (dispatched.action === 'agents') {
          const registry = runtime.agentRuntime.getSubagentRegistry();
          registry.refresh();
          const agents = registry.listSubagents();
          const list = agents.map(a => `  • ${a.name} [role: ${a.role}, tools: ${a.tools.join(', ')}]\n    ${a.description}`).join('\n\n');
          runtime.agentRuntime.getEventBus().publish('message.responded', {
            sessionId,
            response: `[Specialized Subagents]\n${list}\n\nType "/team <workflow> <goal>" to execute a coordinated multi-agent workflow.`,
          });
          return;
        } else if (dispatched.action === 'team') {
          const workflow = dispatched.payload?.workflow || 'research-and-implement';
          const goal = dispatched.payload?.goal || 'Execute multi-agent workflow';
          runtime.agentRuntime.getEventBus().publish('message.responded', {
            sessionId,
            response: `[Team Coordinator] Initiating "${workflow}" team workflow for: ${goal}...`,
          });
          try {
            const coordinator = runtime.agentRuntime.getTeamCoordinator();
            const result = await coordinator.runWorkflow(workflow as any, goal, {
              workspaceRoot: process.cwd(),
            });
            runtime.agentRuntime.getEventBus().publish('message.responded', {
              sessionId,
              response: `${result.finalSummary}\n\nDuration: ${(result.totalDurationMs / 1000).toFixed(1)}s`,
            });
          } catch (err: any) {
            runtime.agentRuntime.getEventBus().publish('message.responded', {
              sessionId,
              response: `[Team Coordinator Error]: ${err.message}`,
            });
          }
          return;
        } else if (dispatched.action === 'research') {
          const query = dispatched.payload?.query || '';
          runtime.agentRuntime.getEventBus().publish('message.responded', {
            sessionId,
            response: `[Deep Research] Initiating autonomous deep research for: "${query}"...`,
          });
          try {
            const coordinator = runtime.agentRuntime.getTeamCoordinator();
            const result = await coordinator.runWorkflow('deep-research', query, {
              workspaceRoot: process.cwd(),
            });
            runtime.agentRuntime.getEventBus().publish('message.responded', {
              sessionId,
              response: `${result.finalSummary}\n\nDuration: ${(result.totalDurationMs / 1000).toFixed(1)}s`,
            });
          } catch (err: any) {
            runtime.agentRuntime.getEventBus().publish('message.responded', {
              sessionId,
              response: `[Research Error]: ${err.message}`,
            });
          }
          return;
        } else if (dispatched.message) {
          runtime.agentRuntime.getEventBus().publish('message.responded', {
            sessionId,
            response: dispatched.message,
          });
          return;
        }
      }

      // Check if target agent specified (e.g. --agent)
      if (options.agent) {
        const subRegistry = runtime.agentRuntime.getSubagentRegistry();
        const subDef = subRegistry.getSubagent(options.agent);
        if (subDef) {
          const { SubagentRunner } = await import('@agent-os/agent-runtime');
          const runner = new SubagentRunner(
            runtime.agentRuntime.getModel(),
            runtime.agentRuntime.getToolRegistry(),
            runtime.agentRuntime.getEventBus(),
            { workspaceRoot: process.cwd() }
          );
          const subRes = await runner.runSubagent(subDef, input, { workspaceRoot: process.cwd() });
          runtime.agentRuntime.getEventBus().publish('message.responded', {
            sessionId,
            response: `[${subDef.name.toUpperCase()}]: ${subRes.finalText}`,
          });
          return;
        }
      }

      const parsed = InputParser.parse(input);
      if (parsed.isCommand) {
        await router.route(parsed, { runtime });
      } else {
        await runtime.agentRuntime.handleRequest(sessionId, input);
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

  // If initial prompt provided, automatically queue it
  if (options.initialPrompt && options.initialPrompt.trim().length > 0) {
    setTimeout(() => {
      handleInput(options.initialPrompt!.trim(), mode);
    }, 250);
  }

  await waitUntilExit();
  logger.silent = false;
  adapter.cleanup();
}
