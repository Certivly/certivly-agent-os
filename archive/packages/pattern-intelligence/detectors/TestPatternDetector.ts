import { Pattern, PatternDetector, PatternType } from "../src/models";
import { v4 as uuidv4 } from "uuid";

export class TestPatternDetector implements PatternDetector {
  public id = "detector-test-pattern";

  public async detect(graph: any, knowledge: any[]): Promise<Pattern[]> {
    const vitestImports = graph?.edges?.filter((e: any) => e.target === "vitest" && e.type === "import") || [];
    
    if (vitestImports.length > 0) {
      return [{
        id: uuidv4(),
        type: PatternType.TEST_LAYER,
        title: "Testing Convention: Vitest",
        description: "Uses Vitest as the primary test runner",
        confidence: 0.95,
        occurrences: vitestImports.length,
        evidence: [{ graphRefs: vitestImports.map((e: any) => e.id), fileRefs: [], symbolRefs: [], knowledgeRefs: [], confidenceContribution: 1 }],
        createdAt: new Date().toISOString(),
        version: 1
      }];
    }
    return [];
  }
}
