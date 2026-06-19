export interface GoalSignature {
  action: string;
  domain: string;
  targetType: string;
  repositoryAreas: string[];
}

export class GoalFingerprintEngine {
  public generate(description: string, affectedFiles: string[] = []): GoalSignature {
    const lower = description.toLowerCase();
    
    // Deterministic keyword matching
    let action = "unknown";
    if (lower.includes("fix") || lower.includes("bug")) action = "fix";
    else if (lower.includes("add") || lower.includes("create") || lower.includes("build")) action = "feature";
    else if (lower.includes("refactor") || lower.includes("update")) action = "refactor";

    let domain = "general";
    if (lower.includes("auth") || lower.includes("login")) domain = "auth";
    else if (lower.includes("ui") || lower.includes("component")) domain = "ui";
    else if (lower.includes("api") || lower.includes("endpoint")) domain = "api";
    else if (lower.includes("db") || lower.includes("database")) domain = "db";

    let targetType = "runtime";
    if (lower.includes("test")) targetType = "test";
    else if (lower.includes("config")) targetType = "config";

    const repositoryAreas = Array.from(new Set(affectedFiles.map(f => f.split("/")[0]))).filter(Boolean).sort();

    return { action, domain, targetType, repositoryAreas };
  }
}
