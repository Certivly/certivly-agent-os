import { Pattern, PatternDetector, PatternType } from "../src/models";
import { v4 as uuidv4 } from "uuid";

export class RepositoryPatternDetector implements PatternDetector {
  public id = "detector-repository-pattern";

  public async detect(graph: any, knowledge: any[]): Promise<Pattern[]> {
    const repos = graph?.nodes?.filter((n: any) => n.name && n.name.endsWith("Repository")) || [];
    
    if (repos.length > 0) {
      return [{
        id: uuidv4(),
        type: PatternType.REPOSITORY_LAYER,
        title: "Repository Pattern",
        description: "Data access logic is encapsulated in Repository classes",
        confidence: repos.length > 2 ? 0.95 : 0.6,
        occurrences: repos.length,
        evidence: [{ graphRefs: repos.map((s: any) => s.id), fileRefs: [], symbolRefs: [], knowledgeRefs: [], confidenceContribution: 1 }],
        createdAt: new Date().toISOString(),
        version: 1
      }];
    }
    return [];
  }
}
