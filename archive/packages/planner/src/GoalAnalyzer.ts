import { GoalRequest } from "./models";

export interface GoalAnalysisResult {
  category: "BUG_FIX" | "FEATURE" | "REFACTOR" | "TESTING" | "DOCUMENTATION" | "SECURITY" | "ANALYSIS";
  riskScore: number; // 0-100
  requiredSkills: string[];
  requiresSandbox: boolean;
  affectedFilesEstimate: number;
}

export class GoalAnalyzer {
  // repositorySnapshot is now received per-call via GoalRequest.repositorySnapshot
  // so the bootstrap can construct GoalAnalyzer once without a graph
  constructor() {}

  public async analyzeGoal(request: GoalRequest): Promise<GoalAnalysisResult> {
    const text = request.goal.toLowerCase();
    
    // Deterministic keyword classification
    let category: GoalAnalysisResult["category"] = "FEATURE";
    if (text.includes("fix") || text.includes("bug")) category = "BUG_FIX";
    else if (text.includes("refactor")) category = "REFACTOR";
    else if (text.includes("test")) category = "TESTING";
    else if (text.includes("doc")) category = "DOCUMENTATION";
    else if (text.includes("security")) category = "SECURITY";
    else if (text.includes("analyze") || text.includes("investigate") || text.includes("analysis")) category = "ANALYSIS";

    // Risk calculation
    let riskScore = 10; // base risk
    if (category === "SECURITY" || category === "BUG_FIX") riskScore += 40;
    if (category === "REFACTOR") riskScore += 20;

    // Required Skills Inference
    const requiredSkills: string[] = [];
    // Always include AnalyzeRepository as first skill
    requiredSkills.push("AnalyzeRepositorySkill");
    if (category === "TESTING") requiredSkills.push("CreateUnitTestsSkill");
    if (category === "REFACTOR") requiredSkills.push("RefactorModuleSkill");
    if (category === "ANALYSIS" || category === "FEATURE" || category === "BUG_FIX") {
      requiredSkills.push("SearchCodebaseSkill");
    }

    const requiresSandbox = category !== "ANALYSIS" && category !== "DOCUMENTATION";

    // Use repositorySnapshot from GoalRequest if available to estimate affected files
    let affectedFilesEstimate = 5;
    if (request.repositorySnapshot?.files) {
      // Rough estimate: search file paths for goal keywords
      const keywords = text.split(/\s+/).filter(w => w.length > 3);
      let matchCount = 0;
      for (const [, fileNode] of request.repositorySnapshot.files) {
        const filePath = (fileNode as any).path || '';
        if (keywords.some(kw => filePath.toLowerCase().includes(kw))) {
          matchCount++;
        }
      }
      affectedFilesEstimate = Math.max(1, matchCount || 5);
    }

    return {
      category,
      riskScore,
      requiredSkills,
      requiresSandbox,
      affectedFilesEstimate
    };
  }
}
