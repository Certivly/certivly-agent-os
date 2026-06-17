export interface FileNode {
  fileId: string; // The absolute path generally works best as an ID for files
  path: string;
  extension: string;
  language: string;
  size: number;
  hash: string;
  lastModified: number;
  parentDirectory: string;
  imports: string[]; // Raw import strings
}

export type SymbolVisibility = 'public' | 'private' | 'protected' | 'unknown';

export interface SymbolNode {
  symbolId: string; // e.g. "filepath#SymbolName"
  name: string;
  type: 'Class' | 'Function' | 'Method' | 'Interface' | 'Type' | 'Enum';
  filePath: string;
  startLine: number;
  endLine: number;
  signature: string; // Raw text signature
  visibility: SymbolVisibility;
}

export interface DependencyEdge {
  sourceFileId: string;
  targetFileId: string; // Could be a file or a module name if unresolved
  importStatement: string;
}

export interface CallEdge {
  callerSymbolId: string; // ID of the function/method making the call
  calleeSymbolId: string; // ID of the function/method being called (if statically resolvable)
  calleeName: string; // The raw name used in the call expression
  filePath: string;
  line: number;
}

export interface RepositoryGraphSnapshot {
  version: number;
  timestamp: string;
  files: Map<string, FileNode>;
  symbols: Map<string, SymbolNode>;
  dependencies: DependencyEdge[];
  calls: CallEdge[];
  
  // Quick lookups
  fileSymbols: Map<string, string[]>; // fileId -> symbolIds
  symbolDefinitions: Map<string, SymbolNode>; // symbolId -> SymbolNode
}
