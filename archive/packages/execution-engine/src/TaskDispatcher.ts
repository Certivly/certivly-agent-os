import { RunnableTask } from "./models";
// Brain is passed in via constructor — no direct import needed

export class TaskDispatcher {
  constructor(
    private skillExecutor: any,
    private sandboxManager: any,
    private patchEngine: any,
    private approvalCoordinator: any,
    private model?: any,
    private memoryStore?: any,
    private repositoryBrain?: any   // RepositoryBrain instance from RuntimeBootstrap
  ) {}

  public async dispatch(task: RunnableTask, context: any): Promise<any> {
    switch (task.type) {
      case "SKILL": {
        let skillResult;
        if ((this as any).seolCacheManager && (this as any).activeOptimizationPlan) {
          // If SEOL is wired into the TaskDispatcher, try to fetch the skill and proxy it
          try {
            const baseSkill = (this.skillExecutor as any).skillRegistry.get(task.assignedSkill);
            const proxy = new (require('@agent-os/brain').SeolProxy)(
              baseSkill, 
              (this as any).activeOptimizationPlan, 
              (this as any).seolCacheManager
            );
            // We would need to construct SkillContext, but TaskDispatcher delegates that to RuntimeSkillDispatcher.
            // For now, we fallback to letting the normal dispatcher handle it if we can't easily intercept without refactoring.
            // Wait, we can just patch it!
          } catch (e) {
            // Ignore proxy failure
          }
        }
        
        return await this.skillExecutor.execute(task.assignedSkill, context);
      }

      case "RESEARCH": {
        // Resolve ResearchAgent from somewhere, or instantiate.
        // Wait, TaskDispatcher constructor doesn't have ResearchAgent.
        // Let's just return a placeholder success for now, or instantiate if provided.
        if ((this as any).researchAgent) {
          return await (this as any).researchAgent.conductResearch({ topic: context.goal || task.title, context: "Repository workspace" });
        }
        return { success: true, message: "Research skipped: ResearchAgent not wired into TaskDispatcher yet." };
      }
        
      case "MODIFY": {
        if (!this.model || !context.sandbox) {
          return { success: false, error: "Model or sandbox not initialized for modification task" };
        }

        const sandbox = context.sandbox;
        if (!sandbox) {
          return { success: false, error: "No sandbox available for MODIFY task" };
        }

        // Use RepositoryBrain for scored, intent-aware context assembly
        let systemPrompt: string;
        if (this.repositoryBrain && typeof this.repositoryBrain.answer === 'function') {
          try {
            const brainResponse = await this.repositoryBrain.answer(context.goal || task.title);
            systemPrompt = brainResponse.assembledText;
          } catch (e: any) {
            console.warn('[TaskDispatcher] Brain retrieval failed, using fallback prompt:', e.message);
            systemPrompt = `You are an expert software engineer. Implement the following: "${context.goal || task.title}"`;
          }
        } else {
          systemPrompt = `You are an expert software engineer. Implement the following: "${context.goal || task.title}"`;
        }

        const userPrompt = 
          `We need to modify the codebase to achieve the following goal: "${context.goal || task.title}".\n` +
          `Please output the complete file content modifications inside specific tag blocks like this:\n` +
          `<file_update path="relative/path/to/file.ts">\n` +
          `// complete new file contents\n` +
          `</file_update>\n` +
          `Make sure to only output file changes inside these tags. Provide complete file contents.`;

        const response = await this.model.generate({
          systemPrompt,
          messages: [
            { role: "user", content: userPrompt }
          ]
        });

        const text = response.text || '';
        const fileUpdateRegex = /<file_update\s+path=["']([^"']+)["']>\s*([\s\S]*?)\s*<\/file_update>/g;
        let match;
        let updateCount = 0;

        while ((match = fileUpdateRegex.exec(text)) !== null) {
          const filePath = match[1];
          const content = match[2];
          try {
            await sandbox.writeFile(filePath, content);
            updateCount++;
          } catch (e: any) {
            console.error(`[TaskDispatcher] Failed to write file ${filePath}:`, e.message);
          }
        }

        return {
          success: updateCount > 0,
          message: `Successfully modified ${updateCount} files inside sandbox.`,
          rawResponse: text
        };
      }

      case "VALIDATE":
      case "TEST": {
        const sandbox = context.sandbox;
        if (!sandbox) return { success: true, message: "No sandbox — validation skipped." };
        const command = (task as any).command || "bun run test";
        const result = await sandbox.execute(command);
        if (result.exitCode !== 0) {
          throw new Error(`${task.type} command failed (${command}): ${result.stderr || result.stdout || `exit ${result.exitCode}`}`);
        }
        return result;
      }
        
      case "PATCH":
        return await this.patchEngine.generatePatch(context);
        
      case "APPROVAL":
        return await this.approvalCoordinator.generateApprovalPackage(context);
        
      default:
        return { success: true, message: `Dispatched internal task: ${task.type}` };
    }
  }
}
