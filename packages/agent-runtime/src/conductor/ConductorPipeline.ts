export type ConductorPhase = 'context' | 'spec' | 'plan' | 'implement' | 'verify' | 'completed';

export interface ConductorPhaseRecord {
  phase: ConductorPhase;
  startedAt: number;
  completedAt?: number;
  artifacts: string[];
  notes?: string;
}

export interface ConductorTaskState {
  id: string;
  goal: string;
  currentPhase: ConductorPhase;
  phaseHistory: ConductorPhaseRecord[];
  specArtifact?: string;
  planArtifact?: string;
  modifiedFiles: string[];
  verified: boolean;
}

export class ConductorPipeline {
  private state: ConductorTaskState;

  constructor(taskId: string, goal: string) {
    this.state = {
      id: taskId,
      goal,
      currentPhase: 'context',
      phaseHistory: [
        {
          phase: 'context',
          startedAt: Date.now(),
          artifacts: [],
        },
      ],
      modifiedFiles: [],
      verified: false,
    };
  }

  public getState(): ConductorTaskState {
    return {
      ...this.state,
      phaseHistory: [...this.state.phaseHistory],
      modifiedFiles: [...this.state.modifiedFiles],
    };
  }

  public getCurrentPhase(): ConductorPhase {
    return this.state.currentPhase;
  }

  /**
   * Advances the conductor pipeline to the next lifecycle phase:
   * context -> spec -> plan -> implement -> verify -> completed
   */
  public transitionTo(
    nextPhase: ConductorPhase,
    options?: {
      artifacts?: string[];
      notes?: string;
      specContent?: string;
      planContent?: string;
      allowFastTrack?: boolean;
    }
  ): boolean {
    const validOrder: Record<ConductorPhase, ConductorPhase[]> = {
      context: ['spec', 'completed'],
      spec: ['plan', 'completed'],
      plan: ['implement', 'completed'],
      implement: ['verify', 'completed'],
      verify: ['completed', 'implement'], // Can loop back to implement if verification fails!
      completed: [],
    };

    const allowedTransitions = validOrder[this.state.currentPhase] || [];
    if (!allowedTransitions.includes(nextPhase) && !options?.allowFastTrack) {
      return false;
    }

    // Mark current phase as completed
    const currentRecord = this.state.phaseHistory[this.state.phaseHistory.length - 1];
    if (currentRecord) {
      currentRecord.completedAt = Date.now();
      if (options?.artifacts) {
        currentRecord.artifacts.push(...options.artifacts);
      }
      if (options?.notes) {
        currentRecord.notes = options.notes;
      }
    }

    // Save specific phase artifacts
    if (options?.specContent) {
      this.state.specArtifact = options.specContent;
    }
    if (options?.planContent) {
      this.state.planArtifact = options.planContent;
    }

    this.state.currentPhase = nextPhase;
    this.state.phaseHistory.push({
      phase: nextPhase,
      startedAt: Date.now(),
      artifacts: options?.artifacts ? [...options.artifacts] : [],
    });

    if (nextPhase === 'completed') {
      this.state.verified = true;
    }

    return true;
  }

  public recordModifiedFile(filePath: string): void {
    if (!this.state.modifiedFiles.includes(filePath)) {
      this.state.modifiedFiles.push(filePath);
    }
  }

  public formatPhaseGuidance(): string {
    switch (this.state.currentPhase) {
      case 'context':
        return 'Conduct repository exploration, AST symbol lookups, and grep inspections. Do not mutate source code yet.';
      case 'spec':
        return 'Define explicit input/output contracts, API signatures, and boundary edge cases for the goal.';
      case 'plan':
        return 'Author a step-by-step implementation checklist and determine exact files to edit.';
      case 'implement':
        return 'Apply surgical patches and code updates according to the locked specification and plan.';
      case 'verify':
        return 'Execute verification test suites and diagnostics. If tests fail, transition back to implement.';
      case 'completed':
        return 'Task verified and concluded. Ready for review or user inspection.';
    }
  }
}
