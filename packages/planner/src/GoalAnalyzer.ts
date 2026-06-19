import { GoalRequest } from "./models";
import { RepositoryGraphSnapshot } from "@agent-os/repository";
// import WiCER layer and Memory Layer

export interface GoalAnalysisResult {
  category: "BUG_FIX" | "FEATURE" | "REFACTOR" | "TESTING" | "DOCUMENTATION" | "SECURITY" | "ANALYSIS";
  riskScore: number; // 0-100
  requiredSkills: string[];
  requiresSandbox: boolean;
  affectedFilesEstimate: number;
}

export class GoalAnalyzer {
  constructor(
    private repositorySnapshot: RepositoryGraphSnapshot,
    // wicer layer
    // memory layer
  ) {}

  public async analyzeGoal(request: GoalRequest): Promise<GoalAnalysisResult> {
    const text = request.goal.toLowerCase();
    
    // Simplistic classification logic to satisfy determinism rules
    let category: GoalAnalysisResult["category"] = "FEATURE";
    if (text.includes("fix") || text.includes("bug")) category = "BUG_FIX";
    else if (text.includes("refactor")) category = "REFACTOR";
    else if (text.includes("test")) category = "TESTING";
    else if (text.includes("doc")) category = "DOCUMENTATION";
    else if (text.includes("security")) category = "SECURITY";
    else if (text.includes("analyze") || text.includes("investigate")) category = "ANALYSIS";

    // Risk calculation
    let riskScore = 10; // base risk
    if (category === "SECURITY" || category === "BUG_FIX") riskScore += 40;
    if (category === "REFACTOR") riskScore += 20;

    // Required Skills Inference
    const requiredSkills: string[] = [];
    if (category === "TESTING") requiredSkills.push("CreateUnitTestsSkill");
    if (category === "REFACTOR") requiredSkills.push("RefactorModuleSkill");

    const requiresSandbox = category !== "ANALYSIS" && category !== "DOCUMENTATION";

    // Query graph snapshot for estimate
    // e.g. how many files are related to keywords in the goal
    const affectedFilesEstimate = 5; 

    return {
      category,
      riskScore,
      requiredSkills,
      requiresSandbox,
      affectedFilesEstimate
    };
  }
}
