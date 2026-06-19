import { Pattern, PatternDetector, PatternType } from "../src/models";
import { v4 as uuidv4 } from "uuid";

export class ValidationPatternDetector implements PatternDetector {
  public id = "detector-validation-pattern";

  public async detect(graph: any, knowledge: any[]): Promise<Pattern[]> {
    const zodImports = graph?.edges?.filter((e: any) => e.target === "zod" && e.type === "import") || [];
    
    if (zodImports.length > 0) {
      return [{
        id: uuidv4(),
        type: PatternType.VALIDATION_LAYER,
        title: "Preferred Validation Strategy: Zod",
        description: "Uses Zod for schema validation across the repository",
        confidence: 0.99,
        occurrences: zodImports.length,
        evidence: [{ graphRefs: zodImports.map((e: any) => e.id), fileRefs: [], symbolRefs: [], knowledgeRefs: [], confidenceContribution: 1 }],
        createdAt: new Date().toISOString(),
        version: 1
      }];
    }
    return [];
  }
}
