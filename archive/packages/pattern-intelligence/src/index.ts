/**
 * ARCHIVED PACKAGE: @agent-os/pattern-intelligence
 *
 * Moved to archive/ on 2026-10-02.
 *
 * Reason: Merged into @agent-os/brain (also archived)
 *
 * Revival condition: Pattern database precision benchmark
 *
 * To revive: move this directory back to packages/pattern-intelligence/, add it to the
 * root package.json workspaces array, run un install, and wire it into
 * the live path.
 */

export * from "./models";
export * from "./PatternConfidence";
export * from "./PatternCompiler";
export * from "./PatternStore";
export * from "./PatternRegistry";
export * from "./PatternEngine";
export * from "./PatternEvents";
export * from "./PatternMetrics";
export * from "./PatternReplay";

export * from "../detectors/FolderConventionDetector";
export * from "../detectors/ServicePatternDetector";
export * from "../detectors/RepositoryPatternDetector";
export * from "../detectors/ValidationPatternDetector";
export * from "../detectors/APIPatternDetector";
export * from "../detectors/TestPatternDetector";
export * from "../detectors/ErrorHandlingDetector";
export * from "../detectors/DependencyUsageDetector";
export * from "../detectors/NamingConventionDetector";
export * from "../detectors/ConfigurationPatternDetector";

export * from "../queries/PatternQueryEngine";
export * from "../agents/PatternAgent";
