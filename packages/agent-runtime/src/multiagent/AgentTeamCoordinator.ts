import type { LoggingEventBus } from '@agent-os/shared';
import type { SubagentRegistry } from './SubagentRegistry';
import type { SubagentRunner } from './SubagentRunner';
import type { TeamWorkflowType, TeamWorkflowResult, SubagentExecutionResult } from './SubagentModel';

export class AgentTeamCoordinator {
  constructor(
    private registry: SubagentRegistry,
    private runner: SubagentRunner,
    private eventBus?: LoggingEventBus
  ) {}

  public async runWorkflow(
    workflow: TeamWorkflowType,
    goal: string,
    options?: { workspaceRoot?: string; abortSignal?: AbortSignal }
  ): Promise<TeamWorkflowResult> {
    const startTime = Date.now();
    const stepResults: SubagentExecutionResult[] = [];

    if (this.eventBus) {
      this.eventBus.publish('team.workflow.started', {
        workflow,
        goal,
      });
    }

    if (workflow === 'deep-research') {
      // 1. Parallel External Web Research, Library Documentation & Local Reconnaissance
      const researcherDef = this.registry.getSubagent('researcher-web') || this.registry.getSubagent('librarian');
      const docsDef = this.registry.getSubagent('researcher-docs');
      const explorerDef = this.registry.getSubagent('explorer');

      const parallelResearch: Promise<SubagentExecutionResult>[] = [];
      if (researcherDef) {
        parallelResearch.push(
          this.runner.runSubagent(
            researcherDef,
            `Conduct comprehensive deep web research on: ${goal}. Find official documentation, release notes, primary source pages, and architectural solutions. Read primary source pages with read_url and cite all URLs.`,
            options
          )
        );
      }
      if (docsDef) {
        parallelResearch.push(
          this.runner.runSubagent(
            docsDef,
            `Investigate official framework and library documentation, API contracts, and usage patterns for: ${goal}`,
            options
          )
        );
      }
      if (explorerDef) {
        parallelResearch.push(
          this.runner.runSubagent(
            explorerDef,
            `Inspect local workspace symbols, dependencies, and entrypoints related to: ${goal}`,
            options
          )
        );
      }

      const researchResults = await Promise.all(parallelResearch);
      stepResults.push(...researchResults);

      // 2. Synthesize findings into cohesive research dossier via Reviewer
      const reviewerDef = this.registry.getSubagent('reviewer');
      if (reviewerDef) {
        const rawFindings = researchResults.map(r => `### Findings from ${r.agentName}:\n${r.finalText}`).join('\n\n');
        const dossierPrompt = `Synthesize a comprehensive research dossier for goal: "${goal}".\n\n${rawFindings}\n\nFormat with:\n- Executive Summary\n- Key Architectural Discoveries\n- Actionable Implementation Recommendations\n- Verified Source Citations & References`;
        const synthesisResult = await this.runner.runSubagent(reviewerDef, dossierPrompt, options);
        stepResults.push(synthesisResult);
      }
    } else if (workflow === 'research-and-implement') {
      // 1. Parallel Exploration & Documentation Research
      const explorerDef = this.registry.getSubagent('explorer');
      const librarianDef = this.registry.getSubagent('librarian');

      const researchPromises: Promise<SubagentExecutionResult>[] = [];
      if (explorerDef) {
        researchPromises.push(
          this.runner.runSubagent(
            explorerDef,
            `Map all relevant workspace files, functions, and symbols for goal: ${goal}`,
            options
          )
        );
      }
      if (librarianDef) {
        researchPromises.push(
          this.runner.runSubagent(
            librarianDef,
            `Investigate external documentation, APIs, and architectural patterns relevant to goal: ${goal}`,
            options
          )
        );
      }

      const researchResults = await Promise.all(researchPromises);
      stepResults.push(...researchResults);

      const researchSummary = researchResults.map(r => `[${r.agentName}]:\n${r.finalText}`).join('\n\n');

      // 2. Implementation by Coder Subagent
      const coderDef = this.registry.getSubagent('coder');
      if (coderDef) {
        const coderResult = await this.runner.runSubagent(
          coderDef,
          `Implement requested changes for goal: ${goal}\n\n[Research Findings]:\n${researchSummary}`,
          options
        );
        stepResults.push(coderResult);
      }

      // 3. Verification & Review
      const verifierDef = this.registry.getSubagent('verifier');
      if (verifierDef) {
        const verifierResult = await this.runner.runSubagent(
          verifierDef,
          `Run verification test suite to validate changes for goal: ${goal}`,
          options
        );
        stepResults.push(verifierResult);
      }

      const reviewerDef = this.registry.getSubagent('reviewer');
      if (reviewerDef) {
        const reviewerResult = await this.runner.runSubagent(
          reviewerDef,
          `Audit proposed changes for correctness, security, and cleanliness for goal: ${goal}`,
          options
        );
        stepResults.push(reviewerResult);
      }
    } else if (workflow === 'investigate-and-fix') {
      // 1. Run Verifier to isolate error traces
      const verifierDef = this.registry.getSubagent('verifier');
      let failureTrace = '';
      if (verifierDef) {
        const initialVerif = await this.runner.runSubagent(
          verifierDef,
          `Run tests and verifiers to capture exact error traces for: ${goal}`,
          options
        );
        stepResults.push(initialVerif);
        failureTrace = initialVerif.finalText;
      }

      // 2. Explorer locates faulty files
      const explorerDef = this.registry.getSubagent('explorer');
      let locationSummary = '';
      if (explorerDef) {
        const exploreResult = await this.runner.runSubagent(
          explorerDef,
          `Locate source files and line numbers responsible for failure:\n${failureTrace}`,
          options
        );
        stepResults.push(exploreResult);
        locationSummary = exploreResult.finalText;
      }

      // 3. Coder applies minimal fix
      const coderDef = this.registry.getSubagent('coder');
      if (coderDef) {
        const coderResult = await this.runner.runSubagent(
          coderDef,
          `Apply surgical fix to resolve failure:\n${failureTrace}\n\n[Locations]:\n${locationSummary}`,
          options
        );
        stepResults.push(coderResult);
      }

      // 4. Verifier re-checks
      if (verifierDef) {
        const postVerif = await this.runner.runSubagent(
          verifierDef,
          `Re-run verification test suite to ensure all tests pass`,
          options
        );
        stepResults.push(postVerif);
      }
    } else {
      // Default: Sequential Review & Audit
      const verifierDef = this.registry.getSubagent('verifier');
      const reviewerDef = this.registry.getSubagent('reviewer');
      if (verifierDef) {
        stepResults.push(
          await this.runner.runSubagent(verifierDef, `Verify current workspace health for: ${goal}`, options)
        );
      }
      if (reviewerDef) {
        stepResults.push(
          await this.runner.runSubagent(reviewerDef, `Perform security and quality audit for: ${goal}`, options)
        );
      }
    }

    const totalDurationMs = Date.now() - startTime;
    const allSuccessful = stepResults.every(r => r.success);
    const summaryLines = [
      `=== Multi-Agent Team Execution Summary (${workflow}) ===`,
      `Goal: ${goal}`,
      `Status: ${allSuccessful ? 'SUCCESS' : 'COMPLETED WITH WARNINGS'}`,
      `Steps Executed: ${stepResults.length}`,
      '',
    ];

    for (const step of stepResults) {
      summaryLines.push(
        `• [${step.agentName.toUpperCase()}] (${step.turnsUsed} turns, ${step.toolsExecuted.length} tools): ${step.finalText.slice(0, 160).replace(/\n/g, ' ')}...`
      );
    }

    const finalSummary = summaryLines.join('\n');

    if (this.eventBus) {
      this.eventBus.publish('team.workflow.completed', {
        workflow,
        success: allSuccessful,
        stepsCount: stepResults.length,
        totalDurationMs,
      });
    }

    return {
      workflow,
      goal,
      success: allSuccessful,
      stepResults,
      finalSummary,
      totalDurationMs,
    };
  }
}
