import { Goal } from '../models/Goal';
import { ExecutionLoop } from './ExecutionLoop';
import { AgentContext } from '@agent-os/subagents';

export class ExecutionSupervisor {
  private goals: Map<string, Goal> = new Map();

  constructor(private loop: ExecutionLoop) {}

  public async submitGoal(goal: Goal, context: AgentContext): Promise<Goal> {
    this.goals.set(goal.id, goal);
    await this.loop.runUntilComplete(goal, context);
    return goal;
  }

  public getGoal(id: string): Goal | undefined {
    return this.goals.get(id);
  }
}
