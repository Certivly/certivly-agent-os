import { Pattern, PatternDetector, PatternType } from "../src/models";
import { v4 as uuidv4 } from "uuid";

export class ErrorHandlingDetector implements PatternDetector {
  public id = "detector-error-handling";

  public async detect(graph: any, knowledge: any[]): Promise<Pattern[]> {
    const errorClasses = graph?.nodes?.filter((n: any) => n.name && n.name.endsWith("Error")) || [];
    
    if (errorClasses.length > 0) {
      return [{
        id: uuidv4(),
        type: PatternType.ERROR_HANDLING,
        title: "Preferred Error Handling Style: Custom Error Classes",
        description: "Uses explicitly named Error subclasses",
        confidence: 0.85,
        occurrences: errorClasses.length,
        evidence: [{ graphRefs: errorClasses.map((e: any) => e.id), fileRefs: [], symbolRefs: [], knowledgeRefs: [], confidenceContribution: 1 }],
        createdAt: new Date().toISOString(),
        version: 1
      }];
    }
    return [];
  }
}
