import { Pattern, PatternDetector, PatternType } from "../src/models";
import { v4 as uuidv4 } from "uuid";

export class DependencyUsageDetector implements PatternDetector {
  public id = "detector-dependency-usage";

  public async detect(graph: any, knowledge: any[]): Promise<Pattern[]> {
    const imports = graph?.edges?.filter((e: any) => e.type === "import") || [];
    
    if (imports.length > 10) {
      return [{
        id: uuidv4(),
        type: PatternType.DEPENDENCY_USAGE,
        title: "Dependency Patterns",
        description: "Frequent cross-package relationships",
        confidence: 0.8,
        occurrences: imports.length,
        evidence: [{ graphRefs: imports.map((e: any) => e.id).slice(0, 10), fileRefs: [], symbolRefs: [], knowledgeRefs: [], confidenceContribution: 1 }],
        createdAt: new Date().toISOString(),
        version: 1
      }];
    }
    return [];
  }
}
