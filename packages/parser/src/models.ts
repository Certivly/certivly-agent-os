export type ASTNode =
  | {
      kind: 'function';
      name: string;
      startLine: number;
      endLine: number;
      signature: string;
      visibility?: string;
    }
  | {
      kind: 'class';
      name: string;
      startLine: number;
      endLine: number;
      visibility?: string;
    }
  | {
      kind: 'method';
      name: string;
      parent: string;
      startLine: number;
      endLine: number;
      signature: string;
      visibility?: string;
    }
  | {
      kind: 'import';
      source: string;
      statement: string;
      startLine: number;
    }
  | {
      kind: 'call';
      callee: string;
      context: string;
      startLine: number;
    }
  | {
      kind: 'interface';
      name: string;
      startLine: number;
      endLine: number;
    }
  | {
      kind: 'type';
      name: string;
      startLine: number;
      endLine: number;
    }
  | {
      kind: 'enum';
      name: string;
      startLine: number;
      endLine: number;
    };

export interface ASTEdge {
  from: string;
  to: string;
  type: string;
}

export interface ParsedAST {
  filePath: string;
  language: string;
  nodes: ASTNode[];
  edges: ASTEdge[]; // Currently unused per spec, we emit structural items
}
