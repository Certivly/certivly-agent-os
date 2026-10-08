import { GoalAnalysisResult } from "./GoalAnalyzer";
import { ExecutionPlan, GoalRequest, TaskDependency, TaskNode, TaskType } from "./models";
import { v4 as uuidv4 } from "uuid";

export class PlanBuilder {
  public buildPlan(request: GoalRequest, analysis: GoalAnalysisResult): ExecutionPlan {
    const planId = uuidv4();
    const tasks: TaskNode[] = [];
    const dependencies: TaskDependency[] = [];

    // Base sequence: Analyze -> Route based on category -> Generate Patch -> Validate -> Approve
    
    // 1. Analyze Repository
    const analyzeTask: TaskNode = {
      id: uuidv4(),
      type: TaskType.ANALYZE,
      title: "Analyze Repository Context",
      dependencies: [],
      status: "pending"
    };
    tasks.push(analyzeTask);

    let previousTask = analyzeTask;

    // 1.5 Research
    if (analysis.category !== "ANALYSIS") {
      const researchTask: TaskNode = {
        id: uuidv4(),
        type: TaskType.RESEARCH,
        title: "Acquire External Knowledge via ResearchAgent",
        dependencies: [previousTask.id],
        status: "pending"
      };
      tasks.push(researchTask);
      dependencies.push({ fromTaskId: previousTask.id, toTaskId: researchTask.id });
      previousTask = researchTask;
    }

    // 2. Main Logic Execution
    if (analysis.category === "TESTING" || analysis.category === "BUG_FIX") {
      const searchTask: TaskNode = {
        id: uuidv4(),
        type: TaskType.SEARCH,
        title: "Discover Affected Modules",
        dependencies: [previousTask.id],
        status: "pending"
      };
      tasks.push(searchTask);
      dependencies.push({ fromTaskId: previousTask.id, toTaskId: searchTask.id });
      previousTask = searchTask;
      
      if (analysis.requiresSandbox) {
        const executeTestsTask: TaskNode = {
          id: uuidv4(),
          type: TaskType.TEST,
          title: "Execute Tests",
          dependencies: [previousTask.id],
          status: "pending"
        };
        tasks.push(executeTestsTask);
        dependencies.push({ fromTaskId: previousTask.id, toTaskId: executeTestsTask.id });
        previousTask = executeTestsTask;
      }
    }

    if (analysis.requiredSkills.length > 0) {
      for (const skill of analysis.requiredSkills) {
        const skillTask: TaskNode = {
          id: uuidv4(),
          type: TaskType.SKILL,
          title: `Execute Skill: ${skill}`,
          dependencies: [previousTask.id],
          assignedSkill: skill,
          status: "pending"
        };
        tasks.push(skillTask);
        dependencies.push({ fromTaskId: previousTask.id, toTaskId: skillTask.id });
        previousTask = skillTask;
      }
    } else if (analysis.category !== "ANALYSIS") {
      const modifyTask: TaskNode = {
        id: uuidv4(),
        type: TaskType.MODIFY,
        title: "Apply Source Code Modifications",
        dependencies: [previousTask.id],
        status: "pending"
      };
      tasks.push(modifyTask);
      dependencies.push({ fromTaskId: previousTask.id, toTaskId: modifyTask.id });
      previousTask = modifyTask;
    }

    if (analysis.requiresSandbox && analysis.category !== "ANALYSIS") {
      const validateTask: TaskNode = {
        id: uuidv4(),
        type: TaskType.VALIDATE,
        title: "Run Sandbox Validation",
        dependencies: [previousTask.id],
        status: "pending"
      };
      tasks.push(validateTask);
      dependencies.push({ fromTaskId: previousTask.id, toTaskId: validateTask.id });
      previousTask = validateTask;

      const patchTask: TaskNode = {
        id: uuidv4(),
        type: TaskType.PATCH,
        title: "Generate Patch via PatchEngine",
        dependencies: [previousTask.id],
        status: "pending"
      };
      tasks.push(patchTask);
      dependencies.push({ fromTaskId: previousTask.id, toTaskId: patchTask.id });
      previousTask = patchTask;
    }

    // Always append Approval Package at the end
    const approvalTask: TaskNode = {
      id: uuidv4(),
      type: TaskType.APPROVAL,
      title: "Generate Approval Package",
      dependencies: [previousTask.id],
      status: "pending"
    };
    tasks.push(approvalTask);
    dependencies.push({ fromTaskId: previousTask.id, toTaskId: approvalTask.id });

    const complexity = tasks.length * 10;

    return {
      id: planId,
      goalId: request.requestId,
      goal: request.goal,
      tasks,
      dependencies,
      estimatedComplexity: complexity,
      riskScore: analysis.riskScore,
      requiresSandbox: analysis.requiresSandbox,
      createdAt: Date.now()
    };
  }
}
