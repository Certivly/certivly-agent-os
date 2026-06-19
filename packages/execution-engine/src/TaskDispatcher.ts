import { RunnableTask } from "./models";

export class TaskDispatcher {
  constructor(
    private skillExecutor: any,
    private sandboxManager: any,
    private patchEngine: any,
    private approvalCoordinator: any
  ) {}

  public async dispatch(task: RunnableTask, context: any): Promise<any> {
    switch (task.type) {
      case "SKILL":
        return await this.skillExecutor.execute(task.assignedSkill, context);
      case "VALIDATE":
      case "TEST":
        return await this.sandboxManager.executeInSandbox(context.sandboxId, task);
      case "PATCH":
        return await this.patchEngine.generatePatch(context);
      case "APPROVAL":
        return await this.approvalCoordinator.generateApprovalPackage(context);
      default:
        // By default, assume local logic or specific internal tool routing for ANALYZE/SEARCH
        return { success: true, message: `Dispatched internal task: ${task.type}` };
    }
  }
}
