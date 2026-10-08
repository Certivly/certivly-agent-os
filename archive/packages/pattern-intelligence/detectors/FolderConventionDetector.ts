import { Pattern, PatternDetector, PatternType } from "../src/models";
import { v4 as uuidv4 } from "uuid";

export class FolderConventionDetector implements PatternDetector {
  public id = "detector-folder-convention";

  public async detect(graph: any, knowledge: any[]): Promise<Pattern[]> {
    // Simulated folder graph search
    const folders = graph?.nodes?.filter((n: any) => n.type === "folder") || [];
    const occurrences = folders.filter((f: any) => ["src/services", "src/repositories", "src/routes"].includes(f.name)).length;
    
    if (occurrences > 0) {
      return [{
        id: uuidv4(),
        type: PatternType.FOLDER_STRUCTURE,
        title: "Feature-Based Package Structure",
        description: "Uses bounded context folders like src/services and src/repositories",
        confidence: occurrences / 3, // Simplistic ratio
        occurrences,
        evidence: [{ graphRefs: ["folder-refs"], fileRefs: [], symbolRefs: [], knowledgeRefs: [], confidenceContribution: 1 }],
        createdAt: new Date().toISOString(),
        version: 1
      }];
    }
    return [];
  }
}
