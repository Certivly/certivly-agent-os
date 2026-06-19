import { Pattern, PatternDetector, PatternType } from "../src/models";
import { v4 as uuidv4 } from "uuid";

export class NamingConventionDetector implements PatternDetector {
  public id = "detector-naming-convention";

  public async detect(graph: any, knowledge: any[]): Promise<Pattern[]> {
    const classNodes = graph?.nodes?.filter((n: any) => n.type === "class") || [];
    const pascalCaseClasses = classNodes.filter((n: any) => /^[A-Z][a-zA-Z0-9]+$/.test(n.name));
    
    if (pascalCaseClasses.length > 0) {
      return [{
        id: uuidv4(),
        type: PatternType.NAMING_CONVENTION,
        title: "Naming Conventions: PascalCase for Classes",
        description: "Classes are consistently named using PascalCase",
        confidence: pascalCaseClasses.length / classNodes.length,
        occurrences: pascalCaseClasses.length,
        evidence: [{ graphRefs: pascalCaseClasses.map((e: any) => e.id), fileRefs: [], symbolRefs: [], knowledgeRefs: [], confidenceContribution: 1 }],
        createdAt: new Date().toISOString(),
        version: 1
      }];
    }
    return [];
  }
}
