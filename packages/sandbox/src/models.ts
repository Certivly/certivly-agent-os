export interface ExecutionOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
  shell?: boolean | string;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut?: boolean;
}

export type FilePatch = {
  filePath: string;
  beforeHash: string;
  afterHash: string;
  diff: string;
};

export type SnapshotFile = {
  path: string;
  sha256: string;
};

export type WorkspaceSnapshot = {
  id: string;
  createdAt: number;
  files: SnapshotFile[];
};

export interface Sandbox {
  id: string;

  create(): Promise<void>;

  execute(
    command: string,
    options?: ExecutionOptions
  ): Promise<ExecutionResult>;

  readFile(path: string): Promise<string>;

  writeFile(
    path: string,
    content: string
  ): Promise<void>;

  listFiles(path?: string): Promise<string[]>;

  deleteFile(path: string): Promise<void>;

  getDiff(): Promise<string>;

  generatePatch(): Promise<FilePatch[]>;

  destroy(): Promise<void>;
}

