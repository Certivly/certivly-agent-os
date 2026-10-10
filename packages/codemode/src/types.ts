export type DiagnosticKind =
  | 'ParseError'
  | 'UnsupportedSyntax'
  | 'UnknownTool'
  | 'InvalidToolInput'
  | 'ToolCallLimitExceeded'
  | 'TimeoutExceeded'
  | 'ToolFailure'
  | 'ExecutionFailure';

export interface CodeModeDiagnostic {
  kind: DiagnosticKind;
  message: string;
  details?: unknown;
}

export interface CodeModeExecutionLimits {
  timeoutMs?: number;        // Default: 15,000ms
  maxToolCalls?: number;     // Default: 50
  maxOutputBytes?: number;   // Default: 50 * 1024 (50 KB)
  concurrencyLimit?: number; // Default: 8
}

export interface ToolCallAudit {
  name: string;
  args: Record<string, unknown>;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface CodeModeResult {
  ok: boolean;
  value?: unknown;
  error?: CodeModeDiagnostic;
  logs: string[];
  toolCalls: ToolCallAudit[];
  durationMs: number;
}

export interface ToolSignature {
  name: string;
  namespace?: string;
  description: string;
  readOnly: boolean;
  signature: string;
}

export interface CatalogSearchResult {
  query: string;
  totalMatches: number;
  tools: ToolSignature[];
}
