import { Pattern, PatternDetector, PatternType } from "../src/models";
import { v4 as uuidv4 } from "uuid";

export class ServicePatternDetector implements PatternDetector {
  public id = "detector-service-pattern";

  public async detect(graph: any, knowledge: any[]): Promise<Pattern[]> {
    const services = graph?.nodes?.filter((n: any) => n.name && n.name.endsWith("Service")) || [];
    const totalClasses = graph?.nodes?.filter((n: any) => n.type === "class") || [];
    
    if (services.length > 0) {
      return [{
        id: uuidv4(),
        type: PatternType.SERVICE_LAYER,
        title: "Service Layer Pattern",
        description: "Business logic is encapsulated in Service classes",
        confidence: totalClasses.length > 0 ? services.length / totalClasses.length : 1,
        occurrences: services.length,
        evidence: [{ graphRefs: services.map((s: any) => s.id), fileRefs: [], symbolRefs: [], knowledgeRefs: [], confidenceContribution: 1 }],
        createdAt: new Date().toISOString(),
        version: 1
      }];
    }
    return [];
  }
}
