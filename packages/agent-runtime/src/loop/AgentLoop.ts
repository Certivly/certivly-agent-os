import * as path from 'path';
import * as fs from 'fs';
import type { Model, GenerationRequest, ModelUsage } from '@agent-os/providers';
import { generateUnifiedDiff, computeSha256, type LoggingEventBus, type JsonObject } from '@agent-os/shared';
import type { ChangeSetFile } from '@agent-os/patch-engine';
import type { SessionHistory } from './SessionHistory';
import { validateToolArguments, type LoopTool, type ToolExecutionResult } from './LoopTool';
import { compactHistory, estimateTokenCount } from './compactHistory';
import { toProviderMessages } from './providerMessages';
import { BASE_AGENT_SYSTEM_PROMPT, loadInstructionText, InstructionLoader } from './instructions';
import {
  Verification,
  formatVerificationFailure,
  type VerificationResult,
  ProjectVerifier,
} from '../verification/Verification';
import type { RunStatus } from '@agent-os/sessions';
import type {
  AgentLoopOptions,
  AgentLoopInput,
  ResumeLoopInput,
  RunSummary,
  ToolCallRecord,
  RunCommandRecord,
  LoopMessage,
  LightweightPlan,
  PipelineStage,
  LoopState,
  ApprovalHandler,
  LoopToolCall,
} from './types';
import { LightweightPlanner } from '../planning/LightweightPlanner';
import { SandboxDiffCollector } from './SandboxDiffCollector';
import { PermissionGuard, isHardDeniedCommand } from './PermissionGuard';
import { HookRunner } from './HookRunner';
import { ContextAssembler } from './ContextAssembler';
import { SearchSubagent } from './SearchSubagent';
import { ToolRegistry } from '@agent-os/tools';


const DEFAULT_OPTIONS: AgentLoopOptions = {
  maxTurns: 40,
  maxWallTimeMs: 300_000,
  maxApproxTokens: 100_000,
  maxVerificationFixAttempts: 3,
};

export interface AgentLoopDeps {
  model: Model;
  tools?: LoopTool[];
  toolRegistry?: ToolRegistry;
  history: SessionHistory;
  eventBus: LoggingEventBus;
  workspaceRoot: string;
  sandboxRoot?: string;
  options?: Partial<AgentLoopOptions>;
  requestApproval?: ApprovalHandler;
}

export class AgentLoop {
  private model: Model;
  private tools: LoopTool[];
  private history: SessionHistory;
  private eventBus: LoggingEventBus;
  private workspaceRoot: string;
  private sandboxRoot?: string;
  private options: AgentLoopOptions;
  private requestApprovalFn?: ApprovalHandler;
  private toolRegistry?: ToolRegistry;

  constructor(deps: AgentLoopDeps) {
    this.model = deps.model;
    this.tools = deps.tools ?? [];
    this.toolRegistry = deps.toolRegistry;
    this.history = deps.history;
    this.eventBus = deps.eventBus;
    this.workspaceRoot = deps.workspaceRoot;
    this.sandboxRoot = deps.sandboxRoot;
    this.options = { ...DEFAULT_OPTIONS, ...deps.options };
    this.requestApprovalFn = deps.requestApproval;
  }

  private getOrCreateToolRegistry(): ToolRegistry {
    if (this.toolRegistry) return this.toolRegistry;
    const reg = new ToolRegistry();
    for (const tool of this.tools) {
      reg.register({
        spec: tool.spec,
        requiresApproval: tool.requiresApproval,
        execute: async (args, ctx) => {
          const res = await tool.execute(args, undefined, crypto.randomUUID());
          return { content: res.content, isError: res.isError };
        },
      });
    }
    return reg;
  }

  public async run(input: AgentLoopInput): Promise<RunSummary> {
    if (!this.workspaceRoot && input.workspaceRoot) {
      this.workspaceRoot = input.workspaceRoot;
    }
    const sessionManager = this.history.getSessionManager();
    const runId = input.runId || crypto.randomUUID();

    sessionManager.createRun({
      id: runId,
      sessionId: input.sessionId,
      status: 'running',
      userInput: input.userInput,
      tracePath: input.tracePath,
    });

    return this.executeUnifiedLoop({
      sessionId: input.sessionId,
      runId,
      userInput: input.userInput,
      workspaceRoot: input.workspaceRoot || this.workspaceRoot,
      sandboxRoot: input.sandboxRoot || this.sandboxRoot,
      abortSignal: input.abortSignal,
      tracePath: input.tracePath,
      isResume: false,
    });
  }

  private async executeUnifiedLoop(params: {
    sessionId: string;
    runId: string;
    userInput: string;
    workspaceRoot: string;
    sandboxRoot?: string;
    abortSignal?: AbortSignal;
    tracePath?: string;
    isResume?: boolean;
    initialTurns?: number;
    initialApprovalDecisions?: { toolName: string; approved: boolean; reason?: string }[];
    initialFinalText?: string;
    pendingToolCalls?: LoopToolCall[];
  }): Promise<RunSummary> {
    const input = params;
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const sessionId = params.sessionId;
    const sessionManager = this.history.getSessionManager();
    const runId = params.runId;

    this.eventBus.publish('agent.loop.started', {
      sessionId,
      userInput: params.userInput,
    });

    const toolCallRecords: ToolCallRecord[] = [];
    const commandRecords: RunCommandRecord[] = [];
    const filesChanged: string[] = [];
    const changeSetFiles: ChangeSetFile[] = [];
    const errors: string[] = [];
    const approvalDecisions: { toolName: string; approved: boolean; reason?: string }[] =
      params.initialApprovalDecisions ? [...params.initialApprovalDecisions] : [];
    const loopState: LoopState = {
      filesRead: new Set<string>(),
      filesEdited: new Set<string>(),
      pipelineCompleted: ['explore'],
      verificationAttempts: 0,
      loadedInstructionDirs: new Set<string>(),
    };
    const pipelineCompleted = new Set<PipelineStage>(loopState.pipelineCompleted);

    let approxInputTokens = 0;
    let approxOutputTokens = 0;
    let turns = params.initialTurns ?? 0;
    let finalText = params.initialFinalText ?? '';
    let success = false;
    let verificationAttempts = 0;
    let reviewAttempts = 0;
    let summaryVerification: VerificationResult | undefined;
    let verificationPassed: boolean | undefined;
    let plan: LightweightPlan | undefined;
    const planRevisions: LightweightPlan[] = [];

    const effectiveWs = params.sandboxRoot || this.sandboxRoot || params.workspaceRoot || this.workspaceRoot;
    let verifier: ProjectVerifier | undefined;

    try {
      if (!params.isResume) {
        await this.history.appendUser(sessionId, params.userInput);
      } else if (params.pendingToolCalls && params.pendingToolCalls.length > 0) {
        await this.executeToolCallsPartitioned(
          params.pendingToolCalls,
          sessionId,
          params.abortSignal,
          toolCallRecords,
          commandRecords,
          filesChanged,
          approvalDecisions,
          changeSetFiles,
          loopState
        );
      }

      // Load repo instruction text (Action 5-02)
      const instructions = InstructionLoader.load(effectiveWs);
      const instructionSection = InstructionLoader.buildSystemPromptSection(instructions);
      let systemPrompt = instructionSection
        ? `${BASE_AGENT_SYSTEM_PROMPT}\n\n${instructionSection}`
        : BASE_AGENT_SYSTEM_PROMPT;

      if (this.options.workflowMemoryStore) {
        const hints = this.options.workflowMemoryStore.formatPromptHints();
        if (hints) {
          systemPrompt += `\n\n${hints}`;
        }
      }

      if (!params.isResume && this.options.parallelExploration) {
        const { ParallelExplorer } = await import('../exploration/ParallelExplorer');
        const explorer = new ParallelExplorer({
          model: this.model,
          tools: this.tools,
          workspaceRoot: this.workspaceRoot,
          timeoutMs: this.options.explorationTimeoutMs,
        });
        const explorationSummary = await explorer.explore(input.userInput, input.abortSignal);
        if (explorationSummary) {
          systemPrompt += `\n\n${explorationSummary}`;
        }
      }

      const planningMode = this.options.planningMode ?? 'auto';
      if (!params.isResume && LightweightPlanner.shouldTriggerPlan({ planningMode, userInput: input.userInput })) {
        plan = await LightweightPlanner.generatePlan(this.model, {
          userInput: input.userInput,
          workspaceRoot: this.workspaceRoot,
        });
        this.eventBus.publish('plan.created', {
          sessionId,
          plan,
        });

        // SearchSubagent integration (Action 5-06)
        if (plan && (!plan.filesLikelyTouched || plan.filesLikelyTouched.length === 0)) {
          const registry = this.getOrCreateToolRegistry();
          const searcher = new SearchSubagent(this.model, registry, this.workspaceRoot);
          const searchResult = await searcher.search(input.userInput);
          if (searchResult.rankedFiles.length > 0) {
            plan.filesLikelyTouched = searchResult.rankedFiles;
          }
          loopState.searchSubagentResult = searchResult;
          this.eventBus.publish('search-subagent.completed', {
            sessionId,
            rankedFiles: searchResult.rankedFiles,
            reason: searchResult.reason,
          });
        }

        const formatted = LightweightPlanner.formatPlan(plan);
        systemPrompt += `\n\n${formatted}\nNote: This plan is advisory. Live observations and tool execution take priority.`;
      }

      // 2. Loop up to maxTurns
      const hasEditTools = this.tools.length > 0 && this.tools.some(t => !t.spec.readOnly);
      const canVerify = !this.options.skipVerification && (!plan || plan.pipeline.includes('verify')) && hasEditTools;
      if (this.options.baselineVerification && canVerify && effectiveWs) {
        verifier = new ProjectVerifier(effectiveWs, this.options.verificationExecutor);
        try {
          await verifier.captureBaseline(plan?.verificationCommands);
        } catch (err) {
          // best-effort: baseline capture failure should not fail the agent run
          this.eventBus.publish('agent.loop.warning', {
            sessionId,
            message: `Baseline verification failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      while (turns < this.options.maxTurns) {
        // Check wall time
        if (Date.now() - startTime > this.options.maxWallTimeMs) {
          throw new Error(`Execution exceeded maximum wall time of ${this.options.maxWallTimeMs}ms`);
        }

        if (input.abortSignal?.aborted) {
          throw new Error('Execution was aborted');
        }

        turns++;
        this.eventBus.publish('agent.loop.turn.started', {
          sessionId,
          turn: turns,
        });

        // Load and compact history if needed
        const rawHistory = await this.history.load(sessionId);
        const compactedHistory = compactHistory(rawHistory, this.options.maxApproxTokens);

        const genMessages = toProviderMessages(compactedHistory);

        // Available tools spec
        const toolSpecs = this.tools.map(t => ({
          name: t.spec.name,
          description: t.spec.description,
          parameters: t.spec.parameters as JsonObject,
        }));

        // ContextAssembler snapshot (Action 5-05)
        const snapshot = ContextAssembler.build(loopState, {
          userInput: input.userInput,
          permissionMode: this.options.permissionMode,
          plan: plan ?? undefined,
          verificationPassed: loopState.lastVerificationOutput ? false : true,
          filesChanged,
        });
        const turnContextSection = ContextAssembler.toSystemPromptSection(snapshot);
        const turnSystemPrompt = turnContextSection ? `${turnContextSection}\n\n${systemPrompt}` : systemPrompt;

        const genRequest: GenerationRequest = {
          systemPrompt: turnSystemPrompt,
          messages: genMessages,
          ...(toolSpecs.length > 0 ? { tools: toolSpecs } : {}),
          signal: input.abortSignal,
        };

        const response = await this.executeModelTurn(genRequest, sessionId);

        if (typeof response.usage?.inputTokens === 'number') {
          approxInputTokens += response.usage.inputTokens;
        } else {
          for (const m of genMessages) {
            approxInputTokens += estimateTokenCount(m.content);
          }
        }

        if (typeof response.usage?.outputTokens === 'number') {
          approxOutputTokens += response.usage.outputTokens;
        } else {
          approxOutputTokens += estimateTokenCount(response.text || '');
        }

        finalText = response.text || '';

        const modelToolCalls = response.toolCalls;

        // If no tool calls, this turn gave the final answer
        if (!modelToolCalls || modelToolCalls.length === 0) {
          await this.history.appendAssistant(sessionId, finalText);

          const shouldVerify =
            (loopState.filesEdited.size > 0 || filesChanged.length > 0) &&
            !this.options.skipVerification &&
            (!plan || plan.pipeline.includes('verify'));

          if (shouldVerify) {
            const effectiveWs = input.sandboxRoot || this.sandboxRoot || this.workspaceRoot;
            if (!verifier) {
              verifier = new ProjectVerifier(effectiveWs, this.options.verificationExecutor);
            }
            const commands = plan?.verificationCommands && plan.verificationCommands.length > 0
              ? plan.verificationCommands
              : undefined;

            // Lifecycle Hook: before_verify (Action 5-03)
            const hooksConfig = this.options.hooks;
            if (hooksConfig?.before_verify) {
              const hookResult = await HookRunner.run(
                hooksConfig.before_verify,
                {
                  VERIFY_COMMANDS: (commands || []).join(' '),
                },
                effectiveWs
              );
              if (!hookResult.ok && hooksConfig.before_verify.blocking !== false) {
                loopState.lastVerificationOutput = `[HookFailed before_verify] ${hookResult.output}`.trim();
              }
            }

            const vRun = await verifier.run(commands);

            // Lifecycle Hook: after_verify (Action 5-03)
            if (hooksConfig?.after_verify) {
              await HookRunner.run(
                hooksConfig.after_verify,
                {
                  VERIFY_STATUS: vRun.passed ? 'pass' : 'fail',
                  VERIFY_OUTPUT: vRun.output || '',
                },
                effectiveWs
              );
            }

            loopState.pipelineCompleted.push('verify');
            pipelineCompleted.add('verify');
            loopState.lastVerificationOutput = vRun.output;
            verificationPassed = vRun.passed;

            const verificationResult: VerificationResult = {
              verdict: vRun.passed
                ? 'verified'
                : (vRun.checks && vRun.checks.length > 0 && vRun.checks.every(c => c.status === 'skipped') ? 'unverified' : 'failed'),
              checks: vRun.checks || [],
            };
            summaryVerification = verificationResult;

            if (vRun.passed) {
              if (this.options.selfReview && filesChanged.length > 0) {
                if (reviewAttempts >= (this.options.maxSelfReviewAttempts ?? 1)) {
                  success = true;
                  break;
                }

                reviewAttempts++;
                const requestedChanges = await this.performSelfReview(
                  sessionId,
                  runId,
                  verificationResult,
                  filesChanged,
                  changeSetFiles
                );

                if (requestedChanges) {
                  continue;
                }
              }

              success = true;
              break;
            } else if (verificationResult.verdict === 'unverified') {
              success = true;
              break;
            } else {
              verificationAttempts++;
              loopState.verificationAttempts = verificationAttempts;
              const maxAttempts = this.options.maxVerificationFixAttempts ?? 3;
              if (verificationAttempts >= maxAttempts) {
                success = false;
                errors.push(`Verification failed after ${verificationAttempts} fix attempts. Last output:\n${vRun.output}`);
                break;
              }

              const failureLines = formatVerificationFailure(verificationResult);
              const feedback = `[Verification Failed]\n${failureLines || vRun.output}\n\nRepair the above failures and try again.`;
              await this.history.appendUser(sessionId, feedback);

              this.eventBus.publish('verification.failed', {
                sessionId,
                attempt: verificationAttempts,
                feedback,
              });

              const planningMode = this.options.planningMode ?? 'auto';
              if (LightweightPlanner.shouldTriggerPlan({
                planningMode,
                userInput: input.userInput,
                verificationAttempts,
              })) {
                if (!plan) {
                  plan = await LightweightPlanner.generatePlan(this.model, {
                    userInput: input.userInput,
                    workspaceRoot: this.workspaceRoot,
                    verificationFailures: [feedback],
                  });
                  this.eventBus.publish('plan.created', { sessionId, plan });
                  await this.history.appendUser(
                    sessionId,
                    `[Planning Advisor]\n${LightweightPlanner.formatPlan(plan)}\nNote: This plan is advisory. Live observations take priority.`
                  );
                } else {
                  const revisedPlan = await LightweightPlanner.generatePlan(this.model, {
                    userInput: input.userInput,
                    workspaceRoot: this.workspaceRoot,
                    currentPlan: plan,
                    revisionReason: `Verification failed twice (attempt ${verificationAttempts})`,
                    verificationFailures: [feedback],
                  });
                  planRevisions.push(revisedPlan);
                  this.eventBus.publish('plan.revised', {
                    sessionId,
                    plan: revisedPlan,
                    previousPlan: plan,
                  });
                  plan = revisedPlan;
                  await this.history.appendUser(
                    sessionId,
                    `[Planning Advisor Revision]\n${LightweightPlanner.formatPlan(revisedPlan)}\nNote: This plan is advisory.`
                  );
                }
              }

              continue;
            }
          }

          success = true;
          break;
        }

        // Model requested tools
        if (this.tools.length === 0) {
          const errMsg = 'Tools are not enabled in this action';
          errors.push(errMsg);
          await this.history.appendAssistant(sessionId, finalText, modelToolCalls);
          success = false;
          break;
        }

        // Persist assistant message with tool calls
        await this.history.appendAssistant(sessionId, finalText, modelToolCalls);

        // Partition and execute tool calls:
        // Read-only tools in parallel, non-read-only sequentially
        const toolExecutionResults = await this.executeToolCallsPartitioned(
          modelToolCalls,
          sessionId,
          input.abortSignal,
          toolCallRecords,
          commandRecords,
          filesChanged,
          approvalDecisions,
          changeSetFiles,
          loopState
        );

        if (filesChanged.length > 0) {
          pipelineCompleted.add('edit');
        }
        if (approvalDecisions.length > 0) {
          pipelineCompleted.add('approve');
        }

        if (!plan && (this.options.planningMode ?? 'auto') !== 'off') {
          for (const tr of toolExecutionResults) {
            if (tr.name === 'repo_map' && !tr.isError) {
              let fileCount = 0;
              try {
                const parsed = JSON.parse(tr.content);
                if (Array.isArray(parsed)) fileCount = parsed.length;
                else if (parsed.files && Array.isArray(parsed.files)) fileCount = parsed.files.length;
              } catch {
                fileCount = (tr.content.match(/\n/g) || []).length + 1;
              }
              if (LightweightPlanner.shouldTriggerPlan({
                planningMode: this.options.planningMode,
                userInput: input.userInput,
                likelyFileCount: fileCount,
              })) {
                plan = await LightweightPlanner.generatePlan(this.model, {
                  userInput: input.userInput,
                  workspaceRoot: this.workspaceRoot,
                });
                this.eventBus.publish('plan.created', { sessionId, plan });
                await this.history.appendUser(
                  sessionId,
                  `[Planning Advisor]\n${LightweightPlanner.formatPlan(plan)}\nNote: This plan is advisory. Live observations take priority.`
                );
                break;
              }
            }
          }
        }

        // Loop continues with next turn

      }

      if (!success && turns >= this.options.maxTurns) {
        errors.push(`Maximum turns (${this.options.maxTurns}) reached without final answer`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(errMsg);
      success = false;
      this.eventBus.publish('agent.loop.failed', {
        sessionId,
        error: errMsg,
      });
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;
    const finalStatus: RunStatus = input.abortSignal?.aborted
      ? 'cancelled'
      : (success ? 'completed' : 'failed');

    const effectiveSandboxRoot = input.sandboxRoot || this.sandboxRoot;
    let changeSetId: string | undefined;
    let hasChanges = false;

    if (effectiveSandboxRoot && effectiveSandboxRoot !== this.workspaceRoot) {
      try {
        const collector = SandboxDiffCollector.collect({
          workspaceRoot: this.workspaceRoot,
          sandboxRoot: effectiveSandboxRoot,
          runId,
        });

        if (collector !== null && collector.files.length > 0) {
          pipelineCompleted.add('patch');
          const { ChangeSetStore } = await import('@agent-os/patch-engine');
          const store = new ChangeSetStore();
          store.save(collector);
          changeSetId = collector.id;
          hasChanges = true;
        }
      } catch (err) {
        // best-effort: record error if sandbox change collection fails
        errors.push(`Failed to collect sandbox changes: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!changeSetId && changeSetFiles.length > 0) {
      pipelineCompleted.add('patch');
      try {
        const { ChangeSetStore } = await import('@agent-os/patch-engine');
        const store = new ChangeSetStore();
        store.save({
          id: runId,
          workspaceRoot: this.workspaceRoot,
          files: changeSetFiles,
          createdAt: completedAt,
        });
        changeSetId = runId;
        hasChanges = true;
      } catch (err) {
        // best-effort: record error if saving in-place changeset fails
        errors.push(`Failed to save changeset: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (success && changeSetId && hasChanges) {
      try {
        const { ChangeSetStore } = await import('@agent-os/patch-engine');
        const store = new ChangeSetStore();
        const cs = store.load(changeSetId);
        if (cs && cs.files.length > 0) {
          this.eventBus.publish('approval.requested', {
            sessionId,
            runId,
            changeSetId,
            fileCount: cs.files.length,
            diffPreview: ChangeSetStore.toUnifiedDiff(cs).slice(0, 2000),
          });
        }
      } catch (err) {
        // best-effort: log warning if approval preview fails to generate
        this.eventBus.publish('agent.loop.warning', {
          sessionId,
          message: `Failed to create approval preview: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    const warnings: string[] = [];
    if (plan?.isEditTask && !pipelineCompleted.has('patch')) {
      warnings.push('Loop completed without going through patch stage.');
    }

    sessionManager.updateRun(runId, {

      status: finalStatus,
      userInput: input.userInput,
      finalText,
      verification: summaryVerification ? JSON.stringify(summaryVerification) : undefined,
      approvalDecisions: approvalDecisions.length > 0 ? JSON.stringify(approvalDecisions) : undefined,
      tracePath: input.tracePath,
    });

    await this.persistWorkflowMemory(runId, summaryVerification, filesChanged);

    const summary: RunSummary = {
      sessionId,
      runId,
      status: finalStatus,
      success,
      finalText,
      turns,
      approxInputTokens,
      approxOutputTokens,
      toolCalls: toolCallRecords,
      commands: commandRecords,
      filesChanged,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
      changeSetId,
      hasChanges,
      verificationPassed,
      verificationOutput: loopState.lastVerificationOutput,
      repairAttempts: verificationAttempts,
      startedAt,
      completedAt,
      durationMs,
      verification: summaryVerification,
      verificationAttempts: verificationAttempts > 0 ? verificationAttempts : undefined,
      plan,
      planRevisions: planRevisions.length > 0 ? planRevisions : undefined,
      searchSubagentResult: loopState.searchSubagentResult,
    };

    if (success) {
      this.eventBus.publish('agent.loop.completed', {
        sessionId,
        success: true,
        summary: summary as unknown as JsonObject,
      });
    } else {
      this.eventBus.publish('agent.loop.failed', {
        sessionId,
        error: errors.join('; ') || 'Execution failed',
      });
    }

    return summary;
  }

  public async resume(input: ResumeLoopInput): Promise<RunSummary> {
    const sessionId = input.sessionId;
    const sessionManager = this.history.getSessionManager();

    // 1. Identify run
    let run: import('@agent-os/sessions').Run | null = null;
    if (input.runId) {
      run = sessionManager.getRun(input.runId);
      if (!run) {
        throw new Error(`Run ${input.runId} not found`);
      }
    } else {
      run = sessionManager.getIncompleteRun(sessionId);
      if (!run) {
        throw new Error(`No incomplete run found for session ${sessionId}`);
      }
    }

    if (run.status === 'cancelled') {
      throw new Error(`Cannot resume cancelled run ${run.id}`);
    }
    if (run.status === 'completed') {
      throw new Error(`Run ${run.id} is already completed`);
    }

    sessionManager.updateRun(run.id, { status: 'running' });

    // 2. Check session consistency
    const rawHistory = await this.history.load(sessionId);
    if (rawHistory.length === 0) {
      throw new Error(
        `Inconsistent session state: no messages found for session ${sessionId}. Trace path: ${run.tracePath || 'unknown'}`
      );
    }

    // 3. Inspect if there are pending tool calls from a crashed turn
    let pendingToolCalls: LoopToolCall[] | undefined;
    const lastAssistantIdx = rawHistory.map(m => m.role).lastIndexOf('assistant');
    if (lastAssistantIdx !== -1) {
      const lastAssistant = rawHistory[lastAssistantIdx];
      if (lastAssistant.toolCalls && lastAssistant.toolCalls.length > 0) {
        const subsequentMessages = rawHistory.slice(lastAssistantIdx + 1);
        const completedToolCallIds = new Set(
          subsequentMessages
            .filter(m => m.role === 'tool' && m.toolCallId)
            .map(m => m.toolCallId!)
        );

        // Only execute tool calls that do NOT have a persisted tool result!
        const unexecuted = lastAssistant.toolCalls.filter(tc => !completedToolCallIds.has(tc.id));
        if (unexecuted.length > 0) {
          pendingToolCalls = unexecuted;
        }
      }
    }

    const approvalDecisions: { toolName: string; approved: boolean; reason?: string }[] = run.approvalDecisions
      ? JSON.parse(run.approvalDecisions)
      : [];
    const initialTurns = rawHistory.filter(m => m.role === 'assistant').length;

    if (!this.workspaceRoot && input.workspaceRoot) {
      this.workspaceRoot = input.workspaceRoot;
    }

    return this.executeUnifiedLoop({
      sessionId,
      runId: run.id,
      userInput: run.userInput || '',
      workspaceRoot: input.workspaceRoot || this.workspaceRoot,
      sandboxRoot: input.sandboxRoot || this.sandboxRoot,
      abortSignal: input.abortSignal,
      tracePath: input.tracePath || run.tracePath || undefined,
      isResume: true,
      initialTurns,
      initialApprovalDecisions: approvalDecisions,
      initialFinalText: run.finalText || '',
      pendingToolCalls,
    });
  }


  private async executeToolCallsPartitioned(
    toolCalls: { id: string; name: string; args: string }[],
    sessionId: string,
    signal?: AbortSignal,
    toolCallRecords?: ToolCallRecord[],
    commandRecords?: RunCommandRecord[],
    filesChanged?: string[],
    approvalDecisions?: { toolName: string; approved: boolean; reason?: string }[],
    changeSetFiles?: ChangeSetFile[],
    loopState?: LoopState
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    let i = 0;

    while (i < toolCalls.length) {
      const current = toolCalls[i];
      const tool = this.tools.find(t => t.spec.name === current.name);
      const isReadOnly = tool?.spec.readOnly ?? false;

      if (isReadOnly) {
        // Collect all contiguous read-only tools
        const batch: { id: string; name: string; args: string }[] = [];
        while (i < toolCalls.length) {
          const next = toolCalls[i];
          const nextTool = this.tools.find(t => t.spec.name === next.name);
          if (nextTool?.spec.readOnly) {
            batch.push(next);
            i++;
          } else {
            break;
          }
        }

        // Execute in parallel
        const batchResults = await Promise.all(
          batch.map(tc =>
            this.executeSingleTool(
              tc,
              sessionId,
              signal,
              toolCallRecords,
              commandRecords,
              filesChanged,
              approvalDecisions,
              changeSetFiles,
              loopState
            )
          )
        );
        for (const tr of batchResults) {
          await this.history.appendTool(
            sessionId,
            tr.toolCallId,
            tr.name,
            tr.content,
            tr.isError
          );
        }
        results.push(...batchResults);
      } else {
        if (signal?.aborted) {
          throw new Error('Execution was aborted');
        }
        // Execute sequentially
        const result = await this.executeSingleTool(
          current,
          sessionId,
          signal,
          toolCallRecords,
          commandRecords,
          filesChanged,
          approvalDecisions,
          changeSetFiles,
          loopState
        );
        await this.history.appendTool(
          sessionId,
          result.toolCallId,
          result.name,
          result.content,
          result.isError
        );
        results.push(result);
        i++;
      }
    }

    return results;
  }



  private async executeSingleTool(
    tc: { id: string; name: string; args: string },
    sessionId: string,
    signal?: AbortSignal,
    toolCallRecords?: ToolCallRecord[],
    commandRecords?: RunCommandRecord[],
    filesChanged?: string[],
    approvalDecisions?: { toolName: string; approved: boolean; reason?: string }[],
    changeSetFiles?: ChangeSetFile[],
    loopState?: LoopState
  ): Promise<ToolExecutionResult> {


    let argsObj: Record<string, unknown> = {};
    try {
      argsObj = typeof tc.args === 'string' ? JSON.parse(tc.args) : (tc.args ?? {});
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errorMsg = `Failed to parse arguments: ${errMsg}`;
      toolCallRecords?.push({
        id: tc.id,
        name: tc.name,
        args: {},
        success: false,
        error: errorMsg,
      });
      return { toolCallId: tc.id, name: tc.name, content: errorMsg, isError: true };
    }

    const tool = this.tools.find(t => t.spec.name === tc.name);
    if (!tool) {
      const errorMsg = `Tool '${tc.name}' not found`;
      toolCallRecords?.push({
        id: tc.id,
        name: tc.name,
        args: argsObj,
        success: false,
        error: errorMsg,
      });
      return { toolCallId: tc.id, name: tc.name, content: errorMsg, isError: true };
    }

    // Validate arguments
    const validationErrors = validateToolArguments(tool.spec, argsObj);
    if (validationErrors.length > 0) {
      const errorMsg = `Argument validation failed: ${validationErrors.join(', ')}`;
      toolCallRecords?.push({
        id: tc.id,
        name: tc.name,
        args: argsObj,
        success: false,
        error: errorMsg,
      });
      return { toolCallId: tc.id, name: tc.name, content: errorMsg, isError: true };
    }

    // Permission Mode & Security Policy (Action 6-06)
    const isEditTool = tc.name === 'edit_file' || tc.name === 'write_file' || tc.name === 'apply_patch';
    const isCommandTool = tc.name === 'run_command';

    // Hard-deny is strictly enforced in all modes and configurations
    if (isCommandTool) {
      const commandStr = (argsObj.command || argsObj.cmd || '') as string;
      const hardDeny = isHardDeniedCommand(commandStr);
      if (hardDeny.denied) {
        const denialMsg = `[PermissionDenied] Command blocked by security policy: ${hardDeny.reason || 'prohibited command'}`;
        toolCallRecords?.push({
          id: tc.id,
          name: tc.name,
          args: argsObj,
          success: false,
          error: denialMsg,
        });
        return {
          toolCallId: tc.id,
          name: tc.name,
          content: denialMsg,
          isError: true,
        };
      }
    }

    let requiresApproval = false;
    const hasExplicitMode = Boolean(this.options.permissionMode);

    if (hasExplicitMode) {
      const guard = new PermissionGuard(this.options.permissionMode!);
      if (isEditTool) {
        const filePathStr = (argsObj.path || argsObj.file || argsObj.filePath || '') as string;
        const editDecision = guard.checkEdit(filePathStr);
        if (editDecision === 'block') {
          const denialMsg = `[PermissionDenied] Mode '${this.options.permissionMode}' does not allow file edits. Use plan mode to review, then switch to acceptEdits to apply.`;
          toolCallRecords?.push({
            id: tc.id,
            name: tc.name,
            args: argsObj,
            success: false,
            error: denialMsg,
          });
          return {
            toolCallId: tc.id,
            name: tc.name,
            content: denialMsg,
            isError: true,
          };
        }
        requiresApproval = editDecision === 'ask';
      } else if (isCommandTool) {
        const commandStr = (argsObj.command || argsObj.cmd || '') as string;
        const cmdDecision = guard.checkCommand(commandStr);
        if (cmdDecision === 'block') {
          const denialMsg = `[PermissionDenied] Mode '${this.options.permissionMode}' does not allow running commands.`;
          toolCallRecords?.push({
            id: tc.id,
            name: tc.name,
            args: argsObj,
            success: false,
            error: denialMsg,
          });
          return {
            toolCallId: tc.id,
            name: tc.name,
            content: denialMsg,
            isError: true,
          };
        }
        requiresApproval = cmdDecision === 'ask';
      } else {
        try {
          requiresApproval = await tool.requiresApproval(argsObj);
        } catch (err) {
          // best-effort: fail safe to requiring approval if check fails
          requiresApproval = true;
        }
      }
    } else {
      try {
        requiresApproval = await tool.requiresApproval(argsObj);
      } catch (err) {
        // best-effort: fail safe to requiring approval if check fails
        requiresApproval = true;
      }
    }

    // Pre-edit guard (ReadBeforeEdit - Action 4-05)
    const hasReadFileTool = this.tools.some(t => t.spec.name === 'read_file');
    if (!this.options.noReadGuard && hasReadFileTool && (tc.name === 'edit_file' || tc.name === 'write_file')) {
      const filePathStr = (argsObj.path || argsObj.file || argsObj.filePath || '') as string;
      if (filePathStr) {
        const targetPath = path.resolve(this.workspaceRoot, filePathStr);
        const exists = fs.existsSync(targetPath);
        const isNewFileWrite = tc.name === 'write_file' && !exists;
        const alreadyKnown = loopState?.filesRead.has(targetPath) || loopState?.filesEdited.has(targetPath);

        if (!isNewFileWrite && !alreadyKnown) {
          const advisoryMsg = `[ReadBeforeEdit] You must call read_file("${filePathStr}") before editing it. Please read the file first.`;
          toolCallRecords?.push({
            id: tc.id,
            name: tc.name,
            args: argsObj,
            success: false,
            error: advisoryMsg,
          });
          return {
            toolCallId: tc.id,
            name: tc.name,
            content: advisoryMsg,
            isError: true,
          };
        }
      }
    }

    if (requiresApproval) {
      const diffPreview = (argsObj.diff || argsObj.content || argsObj.patch || '') as string;
      const filePathStr = (argsObj.path || argsObj.file || argsObj.filePath || argsObj.targetFile || '') as string;
      const filesList = filePathStr ? [{ path: filePathStr, kind: tc.name === 'write_file' ? 'modify' : 'modify' }] : [];

      this.eventBus.publish('approval.requested', {
        id: `appr-${tc.id}`,
        sessionId,
        toolName: tc.name,
        args: argsObj as JsonObject,
        toolCallId: tc.id,
        files: filesList,
        diff: diffPreview,
      });

      if (isEditTool) {
        this.eventBus.publish('approval.requested.edit', {
          id: `appr-${tc.id}`,
          sessionId,
          toolName: tc.name,
          args: argsObj as JsonObject,
          toolCallId: tc.id,
          files: filesList,
          diff: diffPreview,
        });
      }

      if (this.requestApprovalFn) {
        const decision = await this.requestApprovalFn({
          sessionId,
          toolName: tc.name,
          args: argsObj,
          reason: 'Tool requires confirmation',
          toolCallId: tc.id,
          diff: diffPreview,
        });

        approvalDecisions?.push({
          toolName: tc.name,
          approved: decision.approved,
          reason: decision.reason,
        });


        if (!decision.approved) {
          const denialMsg = `user denied: ${decision.reason || 'operation denied'}`;
          toolCallRecords?.push({
            id: tc.id,
            name: tc.name,
            args: argsObj,
            success: false,
            error: denialMsg,
          });
          return {
            toolCallId: tc.id,
            name: tc.name,
            content: denialMsg,
            isError: true,
          };
        }
      } else {
        const denialMsg = 'user denied: no approval handler provided';
        toolCallRecords?.push({
          id: tc.id,
          name: tc.name,
          args: argsObj,
          success: false,
          error: denialMsg,
        });
        return {
          toolCallId: tc.id,
          name: tc.name,
          content: denialMsg,
          isError: true,
        };
      }
    }

    // Lifecycle Hook: before_tool (Action 5-03)
    const hooksConfig = this.options.hooks;
    const effectiveSandboxRoot = this.sandboxRoot || this.workspaceRoot;
    if (hooksConfig?.before_tool) {
      const hookResult = await HookRunner.run(
        hooksConfig.before_tool,
        {
          TOOL_NAME: tc.name,
          TOOL_ARGS_JSON: typeof tc.args === 'string' ? tc.args : JSON.stringify(argsObj),
        },
        effectiveSandboxRoot
      );
      if (!hookResult.ok && hooksConfig.before_tool.blocking !== false) {
        const errMsg = `[HookFailed before_tool] ${hookResult.output}`.trim();
        toolCallRecords?.push({
          id: tc.id,
          name: tc.name,
          args: argsObj,
          success: false,
          error: errMsg,
        });
        return {
          toolCallId: tc.id,
          name: tc.name,
          content: errMsg,
          isError: true,
        };
      }
    }

    this.eventBus.publish('tool.call.started', {
      sessionId,
      toolCallId: tc.id,
      toolName: tc.name,
      args: argsObj as JsonObject,
    });

    try {
      const result = await tool.execute(argsObj, signal, tc.id);

      if (result.isError) {
        this.eventBus.publish('tool.call.failed', {
          sessionId,
          toolCallId: tc.id,
          toolName: tc.name,
          error: result.content,
        });
        toolCallRecords?.push({
          id: tc.id,
          name: tc.name,
          args: argsObj,
          success: false,
          error: result.content,
        });
      } else {
        this.eventBus.publish('tool.call.completed', {
          sessionId,
          toolCallId: tc.id,
          toolName: tc.name,
          result: result.content,
        });
        toolCallRecords?.push({
          id: tc.id,
          name: tc.name,
          args: argsObj,
          success: true,
        });
      }

      // Track files read (ReadBeforeEdit - Action 4-05 & Project Memory - Action 5-02)
      if (tc.name === 'read_file' && !result.isError) {
        const filePathStr = (argsObj.path || argsObj.file || argsObj.filePath || '') as string;
        if (filePathStr) {
          const targetPath = path.resolve(this.workspaceRoot, filePathStr);
          loopState?.filesRead.add(targetPath);

          // Action 5-02: Load nested AGENTS.md when files are first read
          const nestedContent = InstructionLoader.loadForFile(filePathStr, this.workspaceRoot);
          if (nestedContent) {
            const relDir = path.dirname(
              path.isAbsolute(filePathStr) ? path.relative(this.workspaceRoot, filePathStr) : filePathStr
            ).replace(/\\/g, '/');
            const key = relDir === '.' || relDir === '' ? 'root' : relDir;
            if (loopState && !loopState.loadedInstructionDirs?.has(key)) {
              loopState.loadedInstructionDirs?.add(key);
              await this.history.appendSystem(sessionId, `[Project Instructions for ${key}/]\n${nestedContent}`);
            }
          }
        }
      }

      // Track command records
      if (tc.name === 'run_command') {
        const exitCode = typeof result.data?.exitCode === 'number'
          ? result.data.exitCode
          : (result.isError ? 1 : 0);
        commandRecords?.push({
          command: (argsObj.command || argsObj.cmd || '') as string,
          cwd: (argsObj.cwd || this.workspaceRoot) as string,
          exitCode,
          durationMs: 0,
          stdoutTail: result.data?.stdout || result.content,
        });
      }

      // Track changed files and update merged ChangeSet truthfully
      if (tc.name === 'edit_file' || tc.name === 'write_file' || tc.name === 'apply_patch') {
        if (!result.isError) {
          this.syncChangeSetFiles(
            loopState,
            changeSetFiles,
            filesChanged,
            tc.name,
            result,
            argsObj
          );

          // Lifecycle Hook: after_edit (Action 5-03)
          const targetPath = (result.metadata?.path || argsObj.path || argsObj.file || argsObj.filePath || '') as string;
          const editedPaths = tc.name === 'apply_patch'
            ? ((result.metadata?.filesModified as string[]) || [])
            : (targetPath ? [targetPath] : []);

          for (const editPath of editedPaths) {
            if (hooksConfig?.after_edit && editPath) {
              const hookResult = await HookRunner.run(
                hooksConfig.after_edit,
                {
                  EDITED_FILE: editPath,
                  WORKSPACE_ROOT: this.workspaceRoot,
                },
                effectiveSandboxRoot
              );
              if (!hookResult.ok && hooksConfig.after_edit.blocking !== false) {
                const errMsg = `[HookFailed after_edit] ${hookResult.output}`.trim();
                return {
                  toolCallId: tc.id,
                  name: tc.name,
                  content: `${result.content}\n\n${errMsg}`,
                  isError: true,
                };
              }
            }
          }
        }
      }


      return result;
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'fatal' in err && (err as { fatal: unknown }).fatal) {
        throw err;
      }
      const errorMsg = err instanceof Error ? err.message : String(err);

      this.eventBus.publish('tool.call.failed', {
        sessionId,
        toolCallId: tc.id,
        toolName: tc.name,
        error: errorMsg,
      });
      toolCallRecords?.push({
        id: tc.id,
        name: tc.name,
        args: argsObj,
        success: false,
        error: errorMsg,
      });
      return {
        toolCallId: tc.id,
        name: tc.name,
        content: errorMsg,
        isError: true,
      };
    }
  }

  private syncChangeSetFiles(
    loopState: LoopState | undefined,
    changeSetFiles: ChangeSetFile[] | undefined,
    filesChanged: string[] | undefined,
    toolName: string,
    result: ToolExecutionResult,
    argsObj: Record<string, unknown>
  ): void {
    if (!loopState) return;
    if (!loopState.fileBaselines) {
      loopState.fileBaselines = new Map();
    }

    let touchedFiles: Array<{ path: string; beforeContent?: string; isAdd?: boolean }> = [];
    if (toolName === 'apply_patch') {
      const changes = result.metadata?.changes as Array<{ path: string; beforeContent?: string; kind: string }> | undefined;
      if (Array.isArray(changes) && changes.length > 0) {
        touchedFiles = changes.map(c => ({
          path: c.path,
          beforeContent: c.beforeContent,
          isAdd: c.kind === 'add',
        }));
      } else {
        const files = (result.metadata?.filesModified as string[]) || [];
        touchedFiles = files.map(f => ({ path: f }));
      }
    } else {
      const targetPath = (result.metadata?.path || argsObj.path || argsObj.file || argsObj.filePath || '') as string;
      if (targetPath) {
        touchedFiles = [{
          path: targetPath,
          beforeContent: result.metadata?.beforeContent as string | undefined,
          isAdd: result.metadata?.kind === 'add',
        }];
      }
    }

    for (const item of touchedFiles) {
      if (!item.path) continue;
      const relPath = item.path.replace(/\\/g, '/');
      const resolvedPath = path.resolve(this.workspaceRoot, relPath);

      loopState.filesEdited.add(resolvedPath);
      if (filesChanged && !filesChanged.includes(relPath)) {
        filesChanged.push(relPath);
      }

      if (!loopState.fileBaselines.has(relPath)) {
        let initialExists: boolean;
        let initialContent: string;

        if (item.isAdd) {
          initialExists = false;
          initialContent = '';
        } else if (item.beforeContent !== undefined) {
          initialExists = true;
          initialContent = item.beforeContent;
        } else {
          initialExists = fs.existsSync(resolvedPath);
          initialContent = initialExists ? fs.readFileSync(resolvedPath, 'utf8') : '';
        }

        loopState.fileBaselines.set(relPath, { initialExists, initialContent });
      }
    }

    if (changeSetFiles) {
      changeSetFiles.length = 0;
      for (const [relPath, baseline] of loopState.fileBaselines.entries()) {
        const resolvedPath = path.resolve(this.workspaceRoot, relPath);
        const finalExists = fs.existsSync(resolvedPath);
        const finalContent = finalExists ? fs.readFileSync(resolvedPath, 'utf8') : '';

        if (!baseline.initialExists && !finalExists) {
          continue;
        }

        if (baseline.initialExists && finalExists && baseline.initialContent === finalContent) {
          continue;
        }

        if (!baseline.initialExists && finalExists) {
          changeSetFiles.push({
            path: relPath,
            kind: 'add',
            after: computeSha256(finalContent),
            diff: generateUnifiedDiff('', finalContent, relPath),
            afterContent: finalContent,
          });
        } else if (baseline.initialExists && !finalExists) {
          changeSetFiles.push({
            path: relPath,
            kind: 'delete',
            before: computeSha256(baseline.initialContent),
            diff: generateUnifiedDiff(baseline.initialContent, '', relPath),
            afterContent: undefined,
          });
        } else {
          changeSetFiles.push({
            path: relPath,
            kind: 'modify',
            before: computeSha256(baseline.initialContent),
            after: computeSha256(finalContent),
            diff: generateUnifiedDiff(baseline.initialContent, finalContent, relPath),
            afterContent: finalContent,
          });
        }
      }
    }
  }

  private async executeModelTurn(
    genRequest: GenerationRequest,
    sessionId: string
  ): Promise<{
    text: string;
    toolCalls?: Array<{ id: string; name: string; args: string }>;
    usage?: ModelUsage;
  }> {
    if (typeof this.model.stream === 'function') {
      let text = '';
      const toolCalls: Array<{ id: string; name: string; args: string }> = [];
      const toolNames = new Map<string, string>();
      let usage: ModelUsage | undefined = undefined;

      const events = this.model.stream(genRequest);
      for await (const event of events) {
        if (event.type === 'text_delta') {
          text += event.text;
          this.eventBus.publish('message.delta', {
            sessionId,
            delta: event.text,
          });
        } else if (event.type === 'tool_call_start') {
          toolNames.set(event.id, event.name);
        } else if (event.type === 'tool_call_end') {
          toolCalls.push({
            id: event.id,
            name: toolNames.get(event.id) || '',
            args: JSON.stringify(event.arguments),
          });
        } else if (event.type === 'done') {
          if (event.usage) usage = event.usage;
        } else if (event.type === 'error') {
          throw event.error;
        }
      }

      return {
        text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage,
      };
    }

    const response = await this.model.generate(genRequest);
    if (response.text) {
      this.eventBus.publish('message.delta', {
        sessionId,
        delta: response.text,
      });
    }
    return {
      text: response.text || '',
      toolCalls: response.toolCalls,
      usage: response.usage,
    };
  }

  private async persistWorkflowMemory(
    runId: string,
    summaryVerification?: VerificationResult,
    filesChanged?: string[]
  ): Promise<void> {
    if (!this.options.workflowMemoryStore) return;

    if (summaryVerification?.verdict === 'verified') {
      const passingTestCommands = summaryVerification.checks
        .filter((c) => c.name === 'test' && c.status === 'passed' && c.command)
        .map((c) => c.command!);
      const passingBuildCommands = summaryVerification.checks
        .filter(
          (c) =>
            (c.name === 'typecheck' || c.name === 'build' || c.name === 'lint') &&
            c.status === 'passed' &&
            c.command
        )
        .map((c) => c.command!);

      const { detectPackageManager } = await import('../verification/Verification');
      const pkgManager = detectPackageManager(this.workspaceRoot);

      this.options.workflowMemoryStore.save({
        runId,
        verdict: 'verified',
        packageManager: pkgManager,
        passingTestCommands:
          passingTestCommands.length > 0 ? passingTestCommands : undefined,
        passingBuildCommands:
          passingBuildCommands.length > 0 ? passingBuildCommands : undefined,
        filesChanged: filesChanged && filesChanged.length > 0 ? filesChanged : undefined,
      });
    } else if (summaryVerification?.verdict === 'failed') {
      const failedCommandSignatures = summaryVerification.checks
        .filter((c) => c.status === 'failed' && c.command)
        .map((c) => c.command!);

      const { detectPackageManager } = await import('../verification/Verification');
      const pkgManager = detectPackageManager(this.workspaceRoot);

      this.options.workflowMemoryStore.save({
        runId,
        verdict: 'failed',
        packageManager: pkgManager,
        failedCommandSignatures:
          failedCommandSignatures.length > 0 ? failedCommandSignatures : undefined,
        filesChanged: filesChanged && filesChanged.length > 0 ? filesChanged : undefined,
      });
    }
  }

  private async performSelfReview(
    sessionId: string,
    runId: string,
    verificationResult: VerificationResult,
    filesChanged: string[],
    changeSetFiles: ChangeSetFile[]
  ): Promise<boolean> {
    let diffSummary = filesChanged.join(', ');
    try {
      const { ChangeSetStore } = await import('@agent-os/patch-engine');
      diffSummary =
        ChangeSetStore.toUnifiedDiff({
          id: runId,
          workspaceRoot: this.workspaceRoot,
          files: changeSetFiles,
          createdAt: new Date().toISOString(),
        }) || diffSummary;
    } catch (err) {
      // best-effort: fallback to filesChanged string if unified diff generation fails
      this.eventBus.publish('agent.loop.warning', {
        sessionId,
        message: `Failed to generate unified diff for review: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    const reviewPrompt =
      `Review the final diff for bugs, missing tests, accidental edits, and unsafe changes.\n` +
      `Diff:\n${diffSummary}\n\n` +
      `Verification: ${JSON.stringify(verificationResult)}\n\n` +
      `Return APPROVE or REQUEST_CHANGES with exact reason.`;

    const reviewResponse = await this.executeModelTurn(
      {
        systemPrompt:
          'You are an expert code reviewer. Return APPROVE or REQUEST_CHANGES with exact reason.',
        messages: [{ role: 'user', content: reviewPrompt }],
      },
      sessionId
    );

    const reviewText = reviewResponse.text.trim();
    if (reviewText.startsWith('APPROVE') || reviewText.includes('APPROVE')) {
      return false;
    }

    if (reviewText.includes('REQUEST_CHANGES')) {
      await this.history.appendUser(
        sessionId,
        `Self-review requested changes:\n${reviewText}\nPlease make the necessary fixes and verify.`
      );
      return true;
    }

    return false;
  }
}

