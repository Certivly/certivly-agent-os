export type PatchOperationType =
  | "CREATE_FILE"
  | "DELETE_FILE"
  | "RENAME_FILE"
  | "MODIFY_FILE"
  | "INSERT_TEXT"
  | "REPLACE_TEXT"
  | "DELETE_TEXT"
  | "AST_INSERT"
  | "AST_REMOVE"
  | "AST_REPLACE";

export interface PatchOperation {
  type: PatchOperationType;
  targetPath: string;
  astNodeContext?: string; // Simulated AST target e.g. "FunctionDeclaration:login"
  payload?: string;
  lineNumber?: number;
}

export interface PatchFile {
  path: string;
  originalHash?: string;
  newHash?: string;
}

export interface Patch {
  id: string;
  goalId: string;
  strategyId?: string;
  files: PatchFile[];
  operations: PatchOperation[];
  explanation: string;
  createdAt: number;
}

export interface PatchBundle {
  id: string;
  patches: Patch[];
  summary?: string;
  createdAt?: number;
}
