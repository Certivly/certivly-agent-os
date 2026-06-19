import { describe, it, expect } from "bun:test";
import { FolderConventionDetector } from "../detectors/FolderConventionDetector";
import { ValidationPatternDetector } from "../detectors/ValidationPatternDetector";
import { NamingConventionDetector } from "../detectors/NamingConventionDetector";

describe("Detectors", () => {
  it("should detect folder conventions", async () => {
    const detector = new FolderConventionDetector();
    const mockGraph = {
      nodes: [
        { type: "folder", name: "src/services" },
        { type: "folder", name: "src/repositories" }
      ]
    };
    const patterns = await detector.detect(mockGraph, []);
    expect(patterns.length).toBe(1);
    expect(patterns[0].occurrences).toBe(2);
  });

  it("should detect validation pattern (Zod)", async () => {
    const detector = new ValidationPatternDetector();
    const mockGraph = {
      edges: [
        { type: "import", target: "zod" }
      ]
    };
    const patterns = await detector.detect(mockGraph, []);
    expect(patterns.length).toBe(1);
    expect(patterns[0].title).toContain("Zod");
  });

  it("should detect naming conventions", async () => {
    const detector = new NamingConventionDetector();
    const mockGraph = {
      nodes: [
        { type: "class", name: "UserService" },
        { type: "class", name: "user_repository" } // violation
      ]
    };
    const patterns = await detector.detect(mockGraph, []);
    expect(patterns.length).toBe(1);
    expect(patterns[0].confidence).toBe(0.5); // 1 out of 2 classes are PascalCase
  });
});
