import { Pattern, PatternDetector, PatternType } from "../src/models";
import { v4 as uuidv4 } from "uuid";

export class APIPatternDetector implements PatternDetector {
  public id = "detector-api-pattern";

  public async detect(graph: any, knowledge: any[]): Promise<Pattern[]> {
    const honoImports = graph?.edges?.filter((e: any) => e.target === "hono" && e.type === "import") || [];
    
    if (honoImports.length > 0) {
      return [{
        id: uuidv4(),
        type: PatternType.API_LAYER,
        title: "Primary API Style: Hono",
        description: "Uses Hono as the primary HTTP framework",
        confidence: 0.9,
        occurrences: honoImports.length,
        evidence: [{ graphRefs: honoImports.map((e: any) => e.id), fileRefs: [], symbolRefs: [], knowledgeRefs: [], confidenceContribution: 1 }],
        createdAt: new Date().toISOString(),
        version: 1
      }];
    }
    return [];
  }
}
